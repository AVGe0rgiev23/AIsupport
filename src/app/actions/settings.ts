"use server";

import { revalidatePath } from "next/cache";
import { requireOrgDb } from "@/lib/auth/requireOrgDb";
import { normalizeDomains } from "@/lib/siteKeys";

export type SettingsActionState = { ok?: boolean; error?: string };

export async function updateAllowedDomainsAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const { orgDb } = await requireOrgDb();
  const domains = normalizeDomains(String(formData.get("allowedDomains") ?? ""));
  if (domains.length === 0) return { error: "Enter at least one domain" };

  // Exactly one apiKeys row exists per org today (created once at org creation;
  // no multi-key UI exists yet), so an unfiltered update targets it unambiguously.
  await orgDb.updateOne("apiKeys", {}, { $set: { allowedDomains: domains } });
  revalidatePath("/dashboard/settings");
  return { ok: true };
}
