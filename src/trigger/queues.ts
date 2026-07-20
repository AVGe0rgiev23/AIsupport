import { queue } from "@trigger.dev/sdk";

// One lane for every embedding/LLM-calling task: free-tier quotas are shared
// across all tenants, so ingestion is deliberately serial. Slow is fine; 429
// storms are not.
export const ingestion = queue({ name: "ingestion", concurrencyLimit: 1 });
