"use client";

import Link from "next/link";
import { IconAlert, IconRefresh } from "@/app/_ui/icons";
import { buttonStyles, Card } from "@/app/_ui/primitives";

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Card className="mx-auto mt-10 max-w-lg p-8 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-rose-400/10 text-rose-300 ring-1 ring-rose-400/25">
        <IconAlert className="size-5" />
      </span>
      <h1 className="mt-5 text-xl font-semibold text-white">Something went wrong</h1>
      <p className="mt-2 text-slate-400">
        This page couldn&apos;t load. It&apos;s usually a temporary connection problem.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={reset} className={buttonStyles("primary")}>
          <IconRefresh className="size-4" />
          Try again
        </button>
        <Link href="/dashboard" className={buttonStyles("secondary")}>
          Back to overview
        </Link>
      </div>
    </Card>
  );
}
