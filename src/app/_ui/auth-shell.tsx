import Link from "next/link";
import type { ReactNode } from "react";
import { NightBackdrop } from "./backdrop";
import { LogoMark } from "./icons";
import { cx, focusRing } from "./primitives";

/** Centered card on the night sky, used by sign-in, check-email and onboarding. */
export function AuthShell({
  children,
  footer,
  wide = false,
}: {
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="theme-night relative flex min-h-dvh flex-1 flex-col items-center justify-center px-5 py-14">
      <NightBackdrop />
      <Link href="/" className={cx("relative mb-8 flex items-center gap-2.5 rounded-lg", focusRing)}>
        <LogoMark className="size-9" />
        <span className="text-lg font-semibold tracking-tight text-white">SupportAI</span>
      </Link>
      <main
        className={cx(
          "night-pop relative w-full rounded-3xl border border-white/10 bg-slate-950/70 p-7 shadow-[0_40px_120px_-40px_rgba(124,58,237,0.45)] backdrop-blur-xl sm:p-10",
          wide ? "max-w-lg" : "max-w-md",
        )}
      >
        {children}
      </main>
      {footer && <div className="relative mt-6 text-center text-sm text-slate-500">{footer}</div>}
    </div>
  );
}
