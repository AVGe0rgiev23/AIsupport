import { tasks } from "@trigger.dev/sdk";
import type { helloWorld } from "@/trigger/hello-world";

export const dynamic = "force-dynamic";

export async function GET() {
  const handle = await tasks.trigger<typeof helloWorld>("hello-world", {
    name: "SupportAI",
  });
  return Response.json({ runId: handle.id });
}
