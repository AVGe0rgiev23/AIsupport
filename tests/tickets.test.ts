import { describe, expect, it } from "vitest";
import { parseMbox, parseTicketsCsv } from "@/lib/ingest/tickets";

describe("parseTicketsCsv", () => {
  it("maps question/answer-ish headers case-insensitively", () => {
    const csv = 'Subject,Resolution,Agent\n"Login fails","Reset via /forgot","sam"\n"Billing?","See pricing page","kim"';
    expect(parseTicketsCsv(csv)).toEqual([
      { title: "Login fails", body: "Reset via /forgot" },
      { title: "Billing?", body: "See pricing page" },
    ]);
  });

  it("falls back to the first two columns when no header matches", () => {
    const csv = "colA,colB\nhello,world";
    expect(parseTicketsCsv(csv)).toEqual([{ title: "hello", body: "world" }]);
  });

  it("skips rows with an empty title and handles quoted newlines", () => {
    const csv = 'question,answer\n"","orphan"\n"Multi\nline","ok"';
    expect(parseTicketsCsv(csv)).toEqual([{ title: "Multi\nline", body: "ok" }]);
  });
});

describe("parseMbox", () => {
  const mbox = [
    "From alice@example.com Thu Jul 16 10:00:00 2026",
    "Subject: Cannot reset password",
    "To: support@acme.com",
    "",
    "The reset link 404s.",
    "Thanks, Alice",
    "From bob@example.com Fri Jul 17 09:00:00 2026",
    "Subject: Invoice question",
    "",
    "Where do I download invoices?",
  ].join("\n");

  it("splits messages on From_ lines and extracts Subject + body", () => {
    expect(parseMbox(mbox)).toEqual([
      { title: "Cannot reset password", body: "The reset link 404s.\nThanks, Alice" },
      { title: "Invoice question", body: "Where do I download invoices?" },
    ]);
  });

  it("skips messages with no body and defaults a missing subject", () => {
    const m = "From x@y.z Thu Jul 16 10:00:00 2026\nSubject: Empty\n\n\nFrom a@b.c Thu Jul 16 11:00:00 2026\n\nBody without subject";
    expect(parseMbox(m)).toEqual([{ title: "(no subject)", body: "Body without subject" }]);
  });

  it("returns [] for non-mbox text", () => {
    expect(parseMbox("just some text")).toEqual([]);
  });
});
