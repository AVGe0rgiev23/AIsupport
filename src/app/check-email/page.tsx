import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/app/_ui/auth-shell";
import { IconArrowRight, IconMail } from "@/app/_ui/icons";
import { buttonStyles } from "@/app/_ui/primitives";

export const metadata: Metadata = { title: "Check your email" };

export default function CheckEmailPage() {
  return (
    <AuthShell>
      <div className="text-center">
        <span className="relative mx-auto grid size-16 place-items-center">
          <span className="night-ping absolute inset-2 rounded-full bg-violet-400/30" />
          <span className="relative grid size-16 place-items-center rounded-2xl bg-linear-to-br from-cyan-400 via-violet-400 to-pink-400 text-slate-950 shadow-lg">
            <IconMail className="size-7" strokeWidth={2} />
          </span>
        </span>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-white">Check your inbox</h1>
        <p className="mt-2 text-slate-400">
          We sent you a sign-in link. It works once and expires in 24 hours.
        </p>
      </div>

      <ul className="mt-8 space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-400">
        <li className="flex gap-3">
          <span className="font-mono text-cyan-300">1</span>
          Open the email from SupportAI.
        </li>
        <li className="flex gap-3">
          <span className="font-mono text-cyan-300">2</span>
          Click <span className="font-medium text-slate-200">Sign in</span>. You can close this tab.
        </li>
        <li className="flex gap-3">
          <span className="font-mono text-cyan-300">3</span>
          Nothing there after a minute? Check your spam folder.
        </li>
      </ul>

      <Link href="/signin" className={`${buttonStyles("secondary", "lg")} mt-6 w-full`}>
        Use a different email
        <IconArrowRight className="size-4" />
      </Link>
    </AuthShell>
  );
}
