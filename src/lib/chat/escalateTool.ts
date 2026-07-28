import { tool } from "ai";
import { z } from "zod";

// No `execute`: this is a client-side/confirmation tool (AI SDK v5's
// human-in-the-loop pattern). streamText's tool-calling machinery still
// emits the tool-call part normally — it just never auto-resolves it.
// The chat route never handles this server-side; the widget detects the
// call in `message.parts` (type "tool-escalate_to_human", state
// "input-available") and shows LeadCapture.
export const escalateToHumanTool = tool({
  description:
    "Escalate this conversation to a human when you cannot answer confidently from the knowledge base, the visitor explicitly asks for a human, or the topic is billing/legal/account-specific.",
  inputSchema: z.object({
    reason: z.string().describe("Short reason a human should take over"),
  }),
});
