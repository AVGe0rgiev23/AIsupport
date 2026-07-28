import { ObjectId } from "mongodb";
import { describe, expect, it } from "vitest";
import { formatChunks, recentHistory } from "@/lib/chat/prompt";
import type { ScoredChunk } from "@/lib/db/vectorSearch";
import type { Message } from "@/lib/db/types";

function chunk(i: number, heading: string | null): ScoredChunk {
  return { _id: new ObjectId(), documentId: new ObjectId(), text: `text ${i}`, heading, position: i, score: 1 };
}

function msg(role: Message["role"], content: string): Message {
  return {
    _id: new ObjectId(),
    orgId: new ObjectId(),
    conversationId: new ObjectId(),
    role,
    content,
    citations: [],
    usage: null,
    createdAt: new Date(),
  };
}

describe("formatChunks", () => {
  it("numbers chunks 1-indexed and includes headings when present", () => {
    const out = formatChunks([chunk(0, "Refunds"), chunk(1, null)]);
    expect(out).toContain("[1] (Refunds) text 0");
    expect(out).toContain("[2] text 1");
  });
});

describe("recentHistory", () => {
  it("caps at the last N messages", () => {
    const messages = Array.from({ length: 15 }, (_, i) => msg("user", `m${i}`));
    const out = recentHistory(messages, 10);
    expect(out).toHaveLength(10);
    expect(out[0].content).toBe("m5");
    expect(out[9].content).toBe("m14");
  });

  it("drops system-role messages and maps to {role, content}", () => {
    const messages = [msg("system", "sys"), msg("user", "hi"), msg("assistant", "hello")];
    expect(recentHistory(messages)).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
  });
});
