"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { IconMenu, IconX, LogoMark } from "@/app/_ui/icons";
import { cx, focusRing } from "@/app/_ui/primitives";

/** Top bar + slide-down menu for small screens. The menu body (org switcher,
 *  nav, account) is rendered on the server and passed in as children. */
export function MobileNav({ title, children }: { title: string; children: ReactNode }) {
  const pathname = usePathname();
  // Remember which path the menu was opened on: navigating anywhere else
  // closes it without an effect.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;

  return (
    <div className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#070b1a]/85 backdrop-blur-xl lg:hidden">
      <div className="flex h-14 items-center justify-between px-4">
        <Link href="/dashboard" className={cx("flex min-w-0 items-center gap-2.5 rounded-lg", focusRing)}>
          <LogoMark className="size-7" />
          <span className="truncate text-sm font-semibold text-white">{title}</span>
        </Link>
        <button
          type="button"
          onClick={() => setOpenOn(open ? null : pathname)}
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          className={cx("grid size-9 place-items-center rounded-lg text-slate-300 hover:bg-white/[0.06]", focusRing)}
        >
          {open ? <IconX className="size-5" /> : <IconMenu className="size-5" />}
        </button>
      </div>
      {open && (
        <div
          className="night-pop flex max-h-[calc(100dvh-3.5rem)] flex-col overflow-y-auto border-t border-white/[0.06] px-4 pb-5 pt-4"
          onClickCapture={(e) => {
            if ((e.target as HTMLElement).closest("a")) setOpenOn(null);
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
