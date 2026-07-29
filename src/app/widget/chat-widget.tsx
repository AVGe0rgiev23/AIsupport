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
// message (the most common trigger for the onError -> lead-capture handoff
// below) can't fire from normal typing/pasting in the first place.
const MAX_MESSAGE_LENGTH = 4000;

export function ChatWidget({ widgetToken, primaryColor, greeting, position }: Props) {
  const conversationIdRef = useRef<string | null>(null);
  const [showLeadCapture, setShowLeadCapture] = useState(false);
  const [escalateReason, setEscalateReason] = useState("model_requested");

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
  const { messages, sendMessage, status } = useChat({
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
    // certainty (a transient network blip reaches onError the same way), so
    // LeadCapture's "No thanks, keep chatting" control gives a way back to
    // the chat input instead of trapping the visitor in the form.
    onError: () => {
      setEscalateReason("error");
      setShowLeadCapture(true);
    },
  });

  const toolEscalated = messages.some((m) =>
    m.parts.some((p) => p.type === "tool-escalate_to_human" && p.state === "input-available"),
  );

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
      {showLeadCapture || toolEscalated ? (
        <LeadCapture
          widgetToken={widgetToken}
          conversationIdRef={conversationIdRef}
          reason={escalateReason}
          onSubmitted={() => setShowLeadCapture(false)}
          onDismiss={() => setShowLeadCapture(false)}
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
  onSubmitted,
  onDismiss,
}: {
  widgetToken: string;
  // Passed as the ref object itself (not dereferenced) so the parent's JSX
  // return never reads `.current` during render — the actual read happens
  // below, inside `submit`, a real event handler invoked later, which is
  // the textbook "outside of render" case refs are meant for.
  conversationIdRef: React.RefObject<string | null>;
  reason: string;
  onSubmitted: () => void;
  onDismiss: () => void;
}) {
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  // This instance stays mounted for as long as the parent's
  // `showLeadCapture || toolEscalated` branch is true. `toolEscalated` in
  // particular never clears on its own (escalate_to_human has no `execute`,
  // so its tool-call part never leaves "input-available"), so `onSubmitted`
  // clearing `showLeadCapture` alone doesn't hide this branch or unmount
  // this component. Without a local "already sent" flag the form would
  // still be here, still empty-looking, right after a successful submit —
  // inviting a second press that files a second ticket against the same
  // conversation (createEscalationTicket has no dedupe). Once true, render
  // a confirmation instead of a resubmittable form, permanently, for this
  // escalation instance.
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
    setSubmitted(true);
    onSubmitted();
  }

  if (submitted) {
    return (
      <div style={{ padding: 12, borderTop: "1px solid #e5e7eb" }}>
        <p>Thanks — a human will follow up at {email}.</p>
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
        <button type="button" onClick={onDismiss}>
          No thanks, keep chatting
        </button>
      </div>
    </form>
  );
}
