import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { AuthShell } from "@/app/_ui/auth-shell";
import { IconMail, IconShield, IconSparkles } from "@/app/_ui/icons";
import { Field, inputStyles } from "@/app/_ui/primitives";
import { SubmitButton } from "@/app/_ui/submit-button";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <AuthShell
      footer={
        <>
          New here? Signing in creates your account.{" "}
          <Link href="/" className="font-medium text-slate-300 underline-offset-4 hover:text-white hover:underline">
            Learn more
          </Link>
        </>
      }
    >
      <div className="text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-linear-to-br from-cyan-400/20 via-violet-400/20 to-pink-400/20 text-violet-200 ring-1 ring-white/10">
          <IconSparkles className="size-5" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-white">Welcome to SupportAI</h1>
        <p className="mt-2 text-slate-400">Sign in with a magic link. No password needed.</p>
      </div>

      <form
        action={async (formData) => {
          "use server";
          await signIn("resend", {
            email: formData.get("email"),
            redirectTo: "/dashboard",
          });
        }}
        className="mt-8 space-y-4"
      >
        <Field label="Email" htmlFor="email">
          <div className="relative">
            <IconMail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              autoFocus
              placeholder="you@company.com"
              className={`${inputStyles} pl-10`}
            />
          </div>
        </Field>
        <SubmitButton size="lg" variant="brand" pendingLabel="Sending your link…" className="w-full">
          Email me a sign-in link
        </SubmitButton>
      </form>

      <p className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-500">
        <IconShield className="size-3.5" />
        The link works once and expires in 24 hours.
      </p>
    </AuthShell>
  );
}
