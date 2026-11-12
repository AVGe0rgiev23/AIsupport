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
    "Hand this conversation to a person. Only when the visitor asks for a person, when the documents don't contain what they need and they want it anyway (a quote, a booking, their specific case), or when it's about their own account, invoices, refunds or a legal matter. Don't use it for questions the documents answer, even partly.",
  inputSchema: z.object({
    reason: z.string().describe("Short reason a human should take over"),
  }),
});
