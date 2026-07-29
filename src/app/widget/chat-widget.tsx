"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

interface Props {
  widgetToken: string;
  primaryColor: string;
  greeting: string;
  position: "bottom-right" | "bottom-left";
}

// Keep in sync with MAX_MESSAGE_LENGTH in src/app/api/chat/route.ts. Capping
// the input client-side means the 400 that route returns for an over-length
// message (one of the onError -> lead-capture handoff triggers below) can't
// fire from normal typing/pasting in the first place.
const MAX_MESSAGE_LENGTH = 4000;

export function ChatWidget({ widgetToken, primaryColor, greeting, position }: Props) {
  const conversationIdRef = useRef<string | null>(null);
  const [showLeadCapture, setShowLeadCapture] = useState(false);
  const [escalateReason, setEscalateReason] = useState("model_requested");
  // Tool-call ids we've already surfaced a LeadCapture prompt for.
  // escalate_to_human has no `execute` (see escalateToHumanTool's doc
  // comment), so its part's `state` never leaves "input-available" once the
  // model calls it — deriving showLeadCapture directly from "is there an
  // escalate tool part" (the previous design) meant that condition could
  // only ever go true, never false, making any dismiss control a visible
  // no-op. Tracking which toolCallIds have already been surfaced lets a
  // dismissal actually hide the form (see the effect below), while a
  // genuinely NEW escalation later in the conversation (a different
  // toolCallId) can still reopen it.
  const surfacedToolCallIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    window.parent.postMessage({ type: "supportai:position", position }, "*");
  }, [position]);

  // The ref read inside prepareSendMessagesRequest below (conversationId:
  // conversationIdRef.current) is verified safe, not a lint dodge:
  // @ai-sdk/react's compiled useChat (dist/index.mjs) builds its Chat
  // instance exactly once via `useRef(() => new Chat(options))` and only
  // rebuilds it if an explicit `id`/`chat` override is passed (we pass
  // neither), so this transport and its callbacks are captured from the
  // FIRST render only. A plain state variable read there would be frozen
  // at whatever conversationId was at mount (always null) for the rest of
  // the widget's life. The callback itself only ever runs later, when
  // sendMessage() actually prepares a request — never synchronously during
  // render — so reading the ref's latest value there is exactly the
  // "outside of render" case the rule otherwise guards against; the
  // static analysis just can't see through the third-party transport
  // boundary to confirm it.
  const { messages, sendMessage, status, clearError } = useChat({
    // eslint-disable-next-line react-hooks/refs
    transport: new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest: ({ messages: sent }) => ({
        body: {
          widgetToken,
          conversationId: conversationIdRef.current,
          message:
            sent[sent.length - 1]?.parts.find((p) => p.type === "text")?.text ?? "",
        },
      }),
    }),
    onData: (dataPart) => {
      if (dataPart.type === "data-conversationId") {
        conversationIdRef.current = dataPart.data as string;
      }
      if (dataPart.type === "data-escalate") {
        setEscalateReason((dataPart.data as { reason: string }).reason);
        setShowLeadCapture(true);
      }
    },
    // Reachable in normal use: the widget token expires after an hour, so a
    // long-open tab gets a 401. Degrade to the human handoff instead of
    // leaving the visitor with a dead input box. This is a guess, not a
    // certainty (a transient network blip reaches onError the same way) —
    // closeLeadCapture below (wired to LeadCapture's dismiss/back-to-chat
    // controls) is what gives the visitor a way out either way.
    onError: () => {
      setEscalateReason("error");
      setShowLeadCapture(true);
    },
  });

  // Surface a NEW tool-triggered escalation exactly once per toolCallId.
  // Scanning all messages on every messages change is deliberate: a
  // resolved-elsewhere id must never re-trigger, but a fresh id (a second,
  // later escalate_to_human call) must.
  useEffect(() => {
    for (const m of messages) {
      for (const p of m.parts) {
        if (p.type === "tool-escalate_to_human" && p.state === "input-available") {
          if (!surfacedToolCallIds.current.has(p.toolCallId)) {
            surfacedToolCallIds.current.add(p.toolCallId);
            setEscalateReason("model_requested");
            setShowLeadCapture(true);
          }
        }
      }
    }
  }, [messages]);

  // Single exit path out of the lead-capture UI, used by both LeadCapture's
  // pre-submit "No thanks, keep chatting" and post-submit "Back to chat"
  // controls.
  //
  // clearError() is the load-bearing part, not a formality: per
  // node_modules/ai/dist/index.mjs:9538-9541, an onError-triggered escalation
  // means the underlying Chat's status is stuck at "error" — nothing resets
  // it except a brand-new sendMessage()/makeRequest() call or clearError()
  // itself (index.mjs:9344-9349, "Clear the error state and set the status
  // to ready if the chat is in an error state"). Without calling it here,
  // dismissing or submitting an onError-triggered LeadCapture would swap
  // back to a ChatInput that is disabled forever (disabled={status !==
  // "ready"} never flips back on its own from "error"). clearError() is a
  // no-op when status isn't "error" (same source lines), so it's always
  // safe to call unconditionally here regardless of which of the three
  // triggers (tool call / data-escalate / onError) opened the form.
  function closeLeadCapture() {
    setShowLeadCapture(false);
    clearError();
  }

  return (
    <div style={{ fontFamily: "sans-serif", height: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{ background: primaryColor, color: "#fff", padding: 12 }}>{greeting}</header>
      <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
        {messages.map((m) => (
          <p key={m.id}>
            <strong>{m.role === "user" ? "You" : "Assistant"}:</strong>{" "}
            {m.parts.map((p, i) => (p.type === "text" ? <span key={i}>{p.text}</span> : null))}
          </p>
        ))}
      </div>
      {showLeadCapture ? (
        <LeadCapture
          widgetToken={widgetToken}
          conversationIdRef={conversationIdRef}
          reason={escalateReason}
          onClose={closeLeadCapture}
        />
      ) : (
        // status has four values ("submitted" | "streaming" | "ready" | "error");
        // "submitted" covers the whole POST-to-first-chunk window (embedding +
        // vector search + LLM time-to-first-token), during which
        // conversationIdRef.current is still null (it's only set from the
        // data-conversationId part the route writes once the stream opens).
        // Disabling on anything but "ready" is what actually prevents a second
        // send during that window from posting conversationId: null and
        // splitting the visitor's session across two conversation documents.
        // This branch can now render while status === "error" (it couldn't
        // before LeadCapture had any way to close) — that's exactly why
        // closeLeadCapture() above must clear the error, or this input would
        // render permanently disabled with no way to recover it.
        <ChatInput onSend={(text) => sendMessage({ text })} disabled={status !== "ready"} />
      )}
    </div>
  );
}

function ChatInput({ onSend, disabled }: { onSend: (text: string) => void; disabled: boolean }) {
  const [value, setValue] = useState("");
  return (
    <form
      style={{ display: "flex", borderTop: "1px solid #e5e7eb" }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        onSend(value);
        setValue("");
      }}
    >
      <input
        style={{ flex: 1, border: "none", padding: 12 }}
        value={value}
        disabled={disabled}
        maxLength={MAX_MESSAGE_LENGTH}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Ask a question…"
      />
      <button type="submit" disabled={disabled}>
        Send
      </button>
    </form>
  );
}

function LeadCapture({
  widgetToken,
  conversationIdRef,
  reason,
  onClose,
}: {
  widgetToken: string;
  // Passed as the ref object itself (not dereferenced) so the parent's JSX
  // return never reads `.current` during render — the actual read happens
  // below, inside `submit`, a real event handler invoked later, which is
  // the textbook "outside of render" case refs are meant for.
  conversationIdRef: React.RefObject<string | null>;
  reason: string;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Once true, this component renders a confirmation instead of a
  // resubmittable form — permanently, for this mounted instance — which is
  // what actually stops a second press from filing a second ticket against
  // the same conversation (createEscalationTicket has no dedupe).
  const [submitted, setSubmitted] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // conversationId may legitimately be null (error before the first reply) —
    // the server creates a conversation-less ticket rather than dropping the lead.
    const res = await fetch("/api/chat/escalate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        widgetToken,
        conversationId: conversationIdRef.current,
        visitorEmail: email,
        note,
        reason,
      }),
    });
    if (!res.ok) {
      setError("Something went wrong — please try again.");
      return;
    }
    // Deliberately does NOT call onClose() here. onClose() flips the
    // parent's showLeadCapture to false, which unmounts this component;
    // React's automatic batching would fold that parent update into the
    // same commit as setSubmitted(true) below, so the confirmation view a
    // few lines down would never actually get painted before disappearing.
    // Staying mounted and requiring an explicit "Back to chat" click (which
    // does call onClose) is what guarantees the visitor actually sees the
    // confirmation.
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div style={{ padding: 12, borderTop: "1px solid #e5e7eb" }}>
        <p>Thanks — a human will follow up at {email}.</p>
        <button type="button" onClick={onClose}>
          Back to chat
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ padding: 12, borderTop: "1px solid #e5e7eb" }}>
      <p>Leave your email and a human will follow up.</p>
      <input
        type="email"
        required
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ display: "block", width: "100%", marginBottom: 8 }}
      />
      <textarea
        placeholder="Anything else to add? (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        style={{ display: "block", width: "100%", marginBottom: 8 }}
      />
      {error && <p style={{ color: "red" }}>{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit">Send</button>
        <button type="button" onClick={onClose}>
          No thanks, keep chatting
        </button>
      </div>
    </form>
  );
}
