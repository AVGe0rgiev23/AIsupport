import { ObjectId } from "mongodb";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { getDb } from "@/lib/db/client";
import type { Message, Organization } from "@/lib/db/types";
import { withOrg } from "@/lib/db/withOrg";
import { searchChunks, type ScoredChunk } from "@/lib/db/vectorSearch";
import { verifyWidgetToken } from "@/lib/widgetToken";
import { getTodayUsage, incrementUsage } from "@/lib/llmUsage";
import { embedQuery } from "@/lib/ai/embeddings";
import { chatModel, fallbackProvider, type ProviderName } from "@/lib/ai/provider";
import { streamWithFallback } from "@/lib/ai/streamWithFallback";
import { escalateToHumanTool } from "@/lib/chat/escalateTool";
import { buildSystemPrompt, formatChunks, recentHistory } from "@/lib/chat/prompt";
import { parseCitations } from "@/lib/chat/citations";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

const MAX_MESSAGE_LENGTH = 4000;

function escalationStream(conversationId: ObjectId, reason: string) {
  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({ type: "data-conversationId", data: conversationId.toString() });
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

  if (!widgetToken || !message) {
    return Response.json({ error: "widgetToken and message are required" }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return Response.json({ error: "Message too long" }, { status: 400 });
  }

  const tokenPayload = verifyWidgetToken(widgetToken);
  if (!tokenPayload) {
    return Response.json({ error: "Invalid or expired widget session" }, { status: 401 });
  }

  // conversationId comes from the client: an invalid hex string makes the
  // ObjectId constructor throw, which would surface as an opaque 500.
  if (conversationIdRaw && !ObjectId.isValid(conversationIdRaw)) {
    return Response.json({ error: "Invalid conversationId" }, { status: 400 });
  }

  const orgId = new ObjectId(tokenPayload.orgId);
  const db = await getDb();
  const orgDb = withOrg(db, orgId);
  const org = await db.collection<Organization>("organizations").findOne({ _id: orgId });
  if (!org) return Response.json({ error: "Organization not found" }, { status: 404 });

  // A client-supplied conversationId is untrusted: it may be fabricated, or a
  // real id belonging to another org. withOrg's orgId stamp means no message
  // could ever leak cross-tenant, but an unverified id would still create
  // orphaned messages pointing at a conversation that isn't the visitor's.
  // Resolve it against this org first; if it doesn't resolve, silently fall
  // back to creating a fresh conversation instead of erroring or echoing the
  // unverified id back.
  let conversationId: ObjectId | null = null;
  if (conversationIdRaw) {
    const candidateId = new ObjectId(conversationIdRaw);
    const existing = await orgDb.findOne("conversations", { _id: candidateId });
    if (existing) conversationId = candidateId;
  }
  if (!conversationId) {
    const now = new Date();
    const res = await orgDb.insertOne("conversations", {
      channel: "widget",
      visitor: { email: null, name: null, pageUrl: tokenPayload.verifiedOrigin },
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

  // Read-then-increment: concurrent requests near the cap can each read the
  // same pre-increment count and slightly overshoot. Accepted — this is a soft
  // guard against one tenant draining a shared free-tier quota, not a billing
  // boundary. An atomic counter isn't worth the complexity here.
  const usedToday = await getTodayUsage(db, orgId);
  if (usedToday >= env().WIDGET_DAILY_MSG_CAP) {
    return escalationStream(conversationId, "quota");
  }

  // embedQuery/searchChunks/history hit the DB and a separate (chat-independent)
  // Gemini embedding quota — any of the three can throw even when the chat
  // provider is perfectly healthy. Never let that surface as a raw 500: fall
  // back to the same escalation stream used for the quota case.
  let chunks: ScoredChunk[];
  let history: Message[];
  try {
    const vector = await embedQuery(message);
    chunks = await searchChunks(db, orgId, vector, 8);
    history = await orgDb.find("messages", { conversationId }, { sort: { createdAt: 1 } }).toArray();
  } catch (err) {
    console.error("chat retrieval failed", {
      orgId: orgId.toString(),
      conversationId: conversationId.toString(),
      err,
    });
    return escalationStream(conversationId, "error");
  }

  const primaryName: ProviderName = (org.aiConfig.provider as ProviderName | null) ?? env().LLM_PROVIDER;
  const fallbackName = fallbackProvider(primaryName);

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
          conversationId: conversationId!,
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
          orgId,
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
          orgId: orgId.toString(),
          conversationId: conversationId!.toString(),
          providerName,
          err,
        });
      }
    },
  });

  if (!streamResult.ok) {
    return escalationStream(conversationId, "provider_exhausted");
  }

  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({ type: "data-conversationId", data: conversationId!.toString() });
        writer.merge(streamResult.result.toUIMessageStream());
      },
    }),
  });
}
