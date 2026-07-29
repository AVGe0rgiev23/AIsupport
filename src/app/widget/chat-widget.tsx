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
    // leaving the visitor with a dead input box.
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
        />
      ) : (
        <ChatInput onSend={(text) => sendMessage({ text })} disabled={status === "streaming"} />
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
}: {
  widgetToken: string;
  // Passed as the ref object itself (not dereferenced) so the parent's JSX
  // return never reads `.current` during render — the actual read happens
  // below, inside `submit`, a real event handler invoked later, which is
  // the textbook "outside of render" case refs are meant for.
  conversationIdRef: React.RefObject<string | null>;
  reason: string;
  onSubmitted: () => void;
}) {
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

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
    onSubmitted();
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
      <button type="submit">Send</button>
    </form>
  );
}
