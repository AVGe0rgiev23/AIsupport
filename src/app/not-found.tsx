import Link from "next/link";
import { NightBackdrop } from "./_ui/backdrop";
import { IconArrowRight, IconMoon, LogoMark } from "./_ui/icons";
import { buttonStyles } from "./_ui/primitives";

export default function NotFound() {
  return (
    <div className="theme-night relative flex min-h-dvh flex-1 flex-col items-center justify-center overflow-hidden px-5 py-16 text-center">
      <NightBackdrop />
      <div className="relative">
        <IconMoon className="mx-auto size-12 text-amber-200" />
        <p className="night-gradient-text mt-6 text-7xl font-semibold tracking-tighter sm:text-8xl">404</p>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white sm:text-3xl">This page is fast asleep</h1>
        <p className="mx-auto mt-3 max-w-md text-slate-400">
          It doesn&apos;t exist, or it moved. Unlike our assistant, it won&apos;t make something up.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/" className={buttonStyles("primary", "lg")}>
            <LogoMark className="size-5" />
            Back to SupportAI
          </Link>
          <Link href="/dashboard" className={buttonStyles("secondary", "lg")}>
            Open dashboard
            <IconArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
