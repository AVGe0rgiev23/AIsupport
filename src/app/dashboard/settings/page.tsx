import { redirect } from "next/navigation";
import { requireOrgDb } from "@/lib/auth/requireOrgDb";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const { orgDb } = await requireOrgDb();
  const apiKey = await orgDb.findOne("apiKeys");
  if (!apiKey) redirect("/dashboard");

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-4 text-xl font-semibold">Widget settings</h1>
      <section className="rounded border border-gray-300 p-4">
        <SettingsForm currentDomains={apiKey.allowedDomains} />
      </section>
    </main>
  );
}
