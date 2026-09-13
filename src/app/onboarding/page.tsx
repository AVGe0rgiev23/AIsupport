import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthShell } from "@/app/_ui/auth-shell";
import { CreateOrgForm } from "./create-org-form";

export const metadata: Metadata = { title: "Create your organization" };

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  return (
    <AuthShell
      wide
      footer={
        <Link href="/dashboard" className="underline-offset-4 hover:text-slate-300 hover:underline">
          Back to dashboard
        </Link>
      }
    >
      <CreateOrgForm />
    </AuthShell>
  );
}
