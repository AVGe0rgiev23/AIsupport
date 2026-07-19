import { logger, task } from "@trigger.dev/sdk";

export const helloWorld = task({
  id: "hello-world",
  run: async (payload: { name: string }) => {
    logger.info("hello-world running", { payload });
    return { greeting: `Hello, ${payload.name}!` };
  },
});
