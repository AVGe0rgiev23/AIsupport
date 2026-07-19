import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { CreateOrgForm } from "./create-org-form";

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  return (
    <main className="mx-auto max-w-sm p-8">
      <h1 className="mb-4 text-2xl font-semibold">Create an organization</h1>
      <CreateOrgForm />
    </main>
  );
}
