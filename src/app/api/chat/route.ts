import { ObjectId } from "mongodb";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { getDb } from "@/lib/db/client";
import type { Organization } from "@/lib/db/types";
import { searchChunks } from "@/lib/db/vectorSearch";
import { getTodayUsage, incrementUsage } from "@/lib/llmUsage";
import { embedQuery } from "@/lib/ai/embeddings";
import { chatModel, fallbackProvider, type ProviderName } from "@/lib/ai/provider";
import { streamWithFallback } from "@/lib/ai/streamWithFallback";
import { escalateToHumanTool } from "@/lib/chat/escalateTool";
import { buildSystemPrompt, formatChunks, recentHistory } from "@/lib/chat/prompt";
import { parseCitations } from "@/lib/chat/citations";
import { consumeRateLimit, rateLimitBucket } from "@/lib/chat/rateLimit";
import { authorizeWidgetRequest, MAX_VISITOR_TEXT_LENGTH } from "@/lib/chat/widgetRequest";
import { withOrg } from "@/lib/db/withOrg";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

// The embedding call is a Gemini request too. Recording it means getTodayUsage
// reflects real consumption of the single GLOBAL API key instead of
// undercounting it by ~2x, and — because it is charged BEFORE any document is
// written — it also makes WIDGET_DAILY_MSG_CAP a hard ceiling on how many
// documents an anonymous caller can cause this org to write in a day.
const EMBEDDING_PROVIDER = "google";

function escalationStream(conversationId: ObjectId | null, reason: string) {
  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: ({ writer }) => {
        // May legitimately be null: a request rejected by the daily cap must
        // persist NOTHING, so there is no conversation to name. The widget
        // still shows LeadCapture, and createEscalationTicket accepts a null
        // conversationId by design, so the lead is captured either way.
        if (conversationId) {
          writer.write({ type: "data-conversationId", data: conversationId.toString() });
        }
        writer.write({ type: "data-escalate", data: { reason } });
      },
    }),
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const widgetToken = body?.widgetToken as string | undefined;
  const conversationIdRaw = body?.conversationId as string | null | undefined;
  const message = body?.message as string | undefined;

  // Both fields are attacker-controlled JSON: an unchecked `as string` cast
  // erases at runtime. A non-string widgetToken would otherwise reach
  // verifyWidgetToken() and throw on token.split(...); a non-string message
  // (e.g. a number) would pass `!message`, then `message.length` reads as
  // `undefined`, silently skipping the length guard and flowing into the DB
  // insert and embedQuery.
  if (typeof widgetToken !== "string" || typeof message !== "string") {
    return Response.json({ error: "widgetToken and message are required" }, { status: 400 });
  }
  if (!widgetToken || !message) {
    return Response.json({ error: "widgetToken and message are required" }, { status: 400 });
  }
  if (message.length > MAX_VISITOR_TEXT_LENGTH) {
    return Response.json({ error: "Message too long" }, { status: 400 });
  }
  // conversationId comes from the client: an invalid hex string makes the
  // ObjectId constructor throw.
  if (conversationIdRaw && !ObjectId.isValid(conversationIdRaw)) {
    return Response.json({ error: "Invalid conversationId" }, { status: 400 });
  }

  // ONE guard around everything after the cheap, provably-total 400 checks
  // above. "A throwable expression escaped outside the guard" has been found
  // and fixed four separate times in this handler by reviewing it hunk by
  // hunk; the structural fix is to stop having an outside. Everything below
  // can throw — env() on any invalid environment variable (including inside
  // authorizeWidgetRequest and buildSystemPrompt's caller), getDb()'s Mongo
  // connection, any query, embedQuery's Gemini call, org.aiConfig on a
  // document written without it, streamWithFallback — and none of it may ever
  // surface as a raw 500 to an anonymous visitor.
  let conversationId: ObjectId | null = null;
  let orgId: ObjectId | null = null;
  try {
    const auth = authorizeWidgetRequest(req, widgetToken);
    if (!auth.ok) return auth.response;
    orgId = auth.orgId;

    const db = await getDb();
    const orgDb = withOrg(db, orgId);

    // A client-supplied conversationId is untrusted: it may be fabricated, or a
    // real id belonging to another org. withOrg's orgId stamp means no message
    // could ever leak cross-tenant, but an unverified id would still create
    // orphaned messages pointing at a conversation that isn't the visitor's.
    // Resolve it against this org first; if it doesn't resolve, silently fall
    // back to creating a fresh conversation instead of erroring or echoing the
    // unverified id back. Read-only — safe to run before the cap check.
    if (conversationIdRaw) {
      const candidateId = new ObjectId(conversationIdRaw);
      const existing = await orgDb.findOne("conversations", { _id: candidateId });
      if (existing) conversationId = candidateId;
    }

    // The daily cap gates the DATABASE, not just the LLM. It used to sit below
    // the conversation and 4000-char message inserts, so a capped org still
    // wrote two documents for every request forever — on a 512 MB M0 shared by
    // every tenant, a scripted caller could fill the cluster and take all
    // tenants down while never touching a provider. A capped request must
    // persist nothing at all.
    //
    // Read-then-increment: concurrent requests near the cap can each read the
    // same pre-increment count and slightly overshoot. Accepted — this is a
    // soft guard against one tenant draining a shared free-tier quota, not a
    // billing boundary.
    const usedToday = await getTodayUsage(db, orgId);
    if (usedToday >= env().WIDGET_DAILY_MSG_CAP) {
      return escalationStream(conversationId, "quota");
    }

    // Coarse per-caller throttle. The widget token is not a barrier — /widget
    // derives the origin from browser-sent Origin/Referer headers, both freely
    // settable by a non-browser client, and the site key is public by design,
    // so one curl with a spoofed Referer mints a valid token. Same Mongo
    // counter pattern as llmUsage; no new service.
    const bucket = rateLimitBucket(req.headers, widgetToken);
    const allowed = await consumeRateLimit(
      db,
      orgId,
      bucket,
      env().WIDGET_RATE_LIMIT_PER_MIN,
    );
    if (!allowed) {
      // Not a raw error: the widget's onError handler degrades any non-OK
      // response to the same human-handoff LeadCapture form.
      return Response.json({ error: "Too many requests" }, { status: 429 });
    }

    // organizations is the tenant ROOT, not a tenant-owned document, so it is
    // deliberately looked up directly rather than through withOrg.
    const org = await db.collection<Organization>("organizations").findOne({ _id: orgId });
    if (!org) return Response.json({ error: "Organization not found" }, { status: 404 });

    // Charged before any write, so every request that reaches the inserts below
    // has already consumed one unit of the daily cap. That is what bounds how
    // many documents an anonymous flood can create even if every downstream
    // chat completion fails (onFinish, and therefore its incrementUsage, never
    // runs in that case).
    const vector = await embedQuery(message);
    await incrementUsage(db, orgId, EMBEDDING_PROVIDER, 0);

    if (!conversationId) {
      const now = new Date();
      const res = await orgDb.insertOne("conversations", {
        channel: "widget",
        visitor: { email: null, name: null, pageUrl: auth.payload.verifiedOrigin },
        status: "open",
        resolution: null,
        createdAt: now,
        updatedAt: now,
      });
      conversationId = res.insertedId as ObjectId;
    }

    await orgDb.insertOne("messages", {
      conversationId,
      role: "user",
      content: message,
      citations: [],
      usage: null,
      createdAt: new Date(),
    });

    const chunks = await searchChunks(db, orgId, vector, 8);
    const history = await orgDb
      .find("messages", { conversationId }, { sort: { createdAt: 1 } })
      .toArray();

    const primaryName: ProviderName =
      (org.aiConfig.provider as ProviderName | null) ?? env().LLM_PROVIDER;
    const fallbackName = fallbackProvider(primaryName);
    const streamConversationId = conversationId;

    const streamResult = await streamWithFallback({
      primary: { name: primaryName, model: chatModel(primaryName) },
      fallback: { name: fallbackName, model: chatModel(fallbackName) },
      system: `${buildSystemPrompt(org.aiConfig.tone)}\n\n${formatChunks(chunks)}`,
      messages: recentHistory(history),
      tools: { escalate_to_human: escalateToHumanTool },
      onFinish: async (event, providerName) => {
        try {
          const citations = parseCitations(event.text, chunks);
          await orgDb.insertOne("messages", {
            conversationId: streamConversationId,
            role: "assistant",
            content: event.text,
            citations,
            usage: {
              provider: providerName,
              inputTokens: event.usage.inputTokens ?? 0,
              outputTokens: event.usage.outputTokens ?? 0,
            },
            createdAt: new Date(),
          });
          await incrementUsage(
            db,
            orgId!,
            providerName,
            (event.usage.inputTokens ?? 0) + (event.usage.outputTokens ?? 0),
          );
        } catch (err) {
          // The visitor has already received the full reply by the time
          // onFinish runs — rethrowing here would hard-error the stream tail
          // via the SDK's internal flush (controller.error(...)). Losing this
          // message/usage write is the accepted lesser evil; the log is what
          // makes it detectable.
          console.error("chat onFinish persistence failed", {
            orgId: orgId!.toString(),
            conversationId: streamConversationId.toString(),
            providerName,
            err,
          });
        }
      },
    });

    if (!streamResult.ok) {
      return escalationStream(streamConversationId, "provider_exhausted");
    }

    return createUIMessageStreamResponse({
      stream: createUIMessageStream({
        execute: ({ writer }) => {
          writer.write({
            type: "data-conversationId",
            data: streamConversationId.toString(),
          });
          writer.merge(streamResult.result.toUIMessageStream());
        },
      }),
    });
  } catch (err) {
    console.error("chat request failed", {
      orgId: orgId ? orgId.toString() : null,
      conversationId: conversationId ? conversationId.toString() : null,
      err,
    });
    // With a conversationId the visitor still gets the lead-capture handoff via
    // the escalation stream; without one there is no conversation for a ticket
    // to attach to, so a plain 503 is returned — the widget's onError handling
    // degrades that to the same lead-capture form, so the visitor ends up with
    // a human handoff either way.
    if (conversationId) {
      return escalationStream(conversationId, "error");
    }
    return Response.json({ error: "Temporarily unavailable" }, { status: 503 });
  }
}
