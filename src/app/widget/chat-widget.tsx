"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { stripCitationMarkers } from "@/lib/chat/citations";
import { readableOn } from "@/app/_ui/color";
import { IconChat, IconCheck, IconHandoff, IconSend } from "@/app/_ui/icons";

interface Props {
  widgetToken: string;
  orgName: string;
  primaryColor: string;
  greeting: string;
  position: "bottom-right" | "bottom-left";
}

// Keep in sync with MAX_MESSAGE_LENGTH in src/app/api/chat/route.ts. Capping
// the input client-side means the 400 that route returns for an over-length
// message (one of the onError -> lead-capture handoff triggers below) can't
// fire from normal typing/pasting in the first place.
const MAX_MESSAGE_LENGTH = 4000;

// Brand colours arrive as free-form org data, so they're applied through CSS
// variables (never interpolated into class names) and paired with whichever
// text colour actually contrasts with them.
type BrandStyle = CSSProperties & { "--brand": string; "--on-brand": string };

export function ChatWidget({ widgetToken, orgName, primaryColor, greeting, position }: Props) {
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
  const scroller = useRef<HTMLDivElement>(null);

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

  // Keep the newest message in view while the reply streams in.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, status, showLeadCapture]);

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

  const brandStyle: BrandStyle = { "--brand": primaryColor, "--on-brand": readableOn(primaryColor) };
  const last = messages[messages.length - 1];
  const waitingForReply = status === "submitted" || (status === "streaming" && last?.role !== "assistant");

  return (
    <div style={brandStyle} className="flex h-dvh flex-col bg-white font-sans text-slate-800 antialiased">
      <header className="flex items-center gap-3 bg-(--brand) px-4 py-3.5 text-(--on-brand)">
        <span className="relative grid size-9 shrink-0 place-items-center rounded-full bg-black/10">
          <IconChat className="size-[18px]" />
          <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-(--brand) bg-emerald-400" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold leading-tight">{orgName}</p>
          <p className="text-xs opacity-80">AI assistant · replies instantly</p>
        </div>
      </header>

      <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-5" aria-live="polite">
        <Bubble from="assistant">{greeting}</Bubble>
        {messages.map((m) => {
          // The system prompt MANDATES inline [n] citation markers and the
          // route parses and persists them from the raw text — but nothing
          // renders them, so unstripped they reach the visitor as literal
          // "[1] [2]" noise on every single reply. Stripping is a pure
          // string transform applied at the render boundary only: the raw
          // text is still what gets persisted and what parseCitations reads
          // server-side, and this stays text-only inside React-escaped
          // spans. That last property is load-bearing, not incidental —
          // zero markdown/HTML/image rendering is why prompt-injected
          // content pulled out of a crawled third-party page has no
          // exfiltration beacon to reach for.
          const text = m.parts
            .map((p) => (p.type === "text" ? stripCitationMarkers(p.text) : ""))
            .join("");
          // A turn can be a tool call with no text at all (escalate_to_human):
          // render nothing rather than an empty bubble.
          if (!text.trim()) return null;
          return (
            <Bubble key={m.id} from={m.role === "user" ? "user" : "assistant"}>
              {text}
            </Bubble>
          );
        })}
        {waitingForReply && (
          <div className="flex justify-start" aria-label="Assistant is typing">
            <span className="flex gap-1.5 rounded-2xl rounded-bl-md bg-white px-4 py-3.5 shadow-sm ring-1 ring-slate-200">
              <span className="night-dot size-1.5 rounded-full bg-slate-400" />
              <span className="night-dot size-1.5 rounded-full bg-slate-400 [animation-delay:.15s]" />
              <span className="night-dot size-1.5 rounded-full bg-slate-400 [animation-delay:.3s]" />
            </span>
          </div>
        )}
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

      <p className="bg-white pb-2 text-center text-[10px] text-slate-400">Powered by SupportAI</p>
    </div>
  );
}

function Bubble({ from, children }: { from: "user" | "assistant"; children: string }) {
  return from === "user" ? (
    <div className="night-pop flex justify-end">
      <p className="max-w-[82%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-(--brand) px-3.5 py-2.5 text-[14px] leading-relaxed text-(--on-brand)">
        {children}
      </p>
    </div>
  ) : (
    <div className="night-pop flex justify-start">
      <p className="max-w-[86%] whitespace-pre-wrap break-words rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 text-[14px] leading-relaxed text-slate-700 shadow-sm ring-1 ring-slate-200">
        {children}
      </p>
    </div>
  );
}

function ChatInput({ onSend, disabled }: { onSend: (text: string) => void; disabled: boolean }) {
  const [value, setValue] = useState("");
  return (
    <form
      className="flex items-center gap-2 border-t border-slate-200 bg-white px-3 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        onSend(value);
        setValue("");
      }}
    >
      <label htmlFor="supportai-message" className="sr-only">
        Your question
      </label>
      <input
        id="supportai-message"
        className="h-10 min-w-0 flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 text-[14px] text-slate-800 placeholder:text-slate-400 focus:border-(--brand) focus:bg-white focus:outline-none disabled:opacity-60"
        value={value}
        disabled={disabled}
        maxLength={MAX_MESSAGE_LENGTH}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Ask a question…"
        autoComplete="off"
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        aria-label="Send"
        className="grid size-10 shrink-0 place-items-center rounded-full bg-(--brand) text-(--on-brand) transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--brand) disabled:opacity-40"
      >
        <IconSend className="size-[18px]" strokeWidth={2.25} />
      </button>
    </form>
  );
}

const REASON_COPY: Record<string, string> = {
  model_requested: "This one needs a person. Leave your email and our team will follow up.",
  user_requested: "Leave your email and a person from our team will follow up.",
  quota: "Our assistant is very busy right now. Leave your email and we'll get back to you.",
  provider_exhausted: "Our assistant is very busy right now. Leave your email and we'll get back to you.",
  error: "Something went wrong on our side. Leave your email and a person will follow up.",
};

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
  // Disables Send while the request is in flight, so a double press can't
  // file two tickets before `submitted` below flips.
  const [sending, setSending] = useState(false);
  // Once true, this component renders a confirmation instead of a
  // resubmittable form — permanently, for this mounted instance — which is
  // what actually stops a second press from filing a second ticket against
  // the same conversation (createEscalationTicket has no dedupe).
  const [submitted, setSubmitted] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    let ok = false;
    try {
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
      ok = res.ok;
    } catch {
      ok = false;
    }
    if (!ok) {
      setSending(false);
      setError("Something went wrong. Please try again.");
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
      <div className="night-pop border-t border-slate-200 bg-white p-4">
        <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-emerald-500 text-white">
            <IconCheck className="size-4" strokeWidth={2.75} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-emerald-900">Thanks, you&apos;re all set</p>
            <p className="mt-0.5 break-words text-[13px] text-emerald-800">
              A person from our team will follow up at {email}.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 h-10 w-full rounded-full border border-slate-200 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Back to chat
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="night-pop space-y-2.5 border-t border-slate-200 bg-white p-4">
      <div className="flex items-start gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-(--brand) text-(--on-brand)">
          <IconHandoff className="size-4" />
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-900">Talk to a person</p>
          <p className="text-[13px] leading-snug text-slate-500">{REASON_COPY[reason] ?? REASON_COPY.user_requested}</p>
        </div>
      </div>
      <label htmlFor="supportai-email" className="sr-only">
        Email
      </label>
      <input
        id="supportai-email"
        type="email"
        required
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-[14px] placeholder:text-slate-400 focus:border-(--brand) focus:bg-white focus:outline-none"
      />
      <label htmlFor="supportai-note" className="sr-only">
        Note
      </label>
      <textarea
        id="supportai-note"
        rows={2}
        placeholder="Anything else to add? (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-[14px] placeholder:text-slate-400 focus:border-(--brand) focus:bg-white focus:outline-none"
      />
      {error && <p className="text-[13px] text-rose-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={sending}
          className="h-10 flex-1 rounded-full bg-(--brand) text-sm font-semibold text-(--on-brand) transition hover:brightness-110 disabled:opacity-60"
        >
          {sending ? "Sending…" : "Send"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="h-10 rounded-full px-4 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
        >
          No thanks, keep chatting
        </button>
      </div>
    </form>
  );
}
