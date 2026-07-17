import { streamText } from "ai";
import { chatModel, type ProviderName } from "@/lib/ai/provider";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const provider = (url.searchParams.get("provider") ?? undefined) as
    | ProviderName
    | undefined;
  const result = streamText({
    model: chatModel(provider),
    prompt: "Reply with exactly: SupportAI provider check OK",
  });
  return result.toTextStreamResponse();
}
