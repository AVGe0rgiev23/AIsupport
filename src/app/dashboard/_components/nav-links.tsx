"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconGrid, IconInbox, IconLibrary, IconSliders } from "@/app/_ui/icons";
import { cx, focusRing } from "@/app/_ui/primitives";

const LINKS = [
  { href: "/dashboard", label: "Overview", icon: IconGrid, exact: true },
  { href: "/dashboard/sources", label: "Knowledge", icon: IconLibrary, exact: false },
  { href: "/dashboard/settings", label: "Widget", icon: IconSliders, exact: false },
];

export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="space-y-1">
      {LINKS.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <li key={href}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cx(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition",
                focusRing,
                active ? "bg-white/[0.07] text-white" : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-100",
              )}
            >
              {active && (
                <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-linear-to-b from-cyan-300 to-violet-400" />
              )}
              <Icon className={cx("size-[18px]", active ? "text-cyan-300" : "text-slate-500 group-hover:text-slate-300")} />
              {label}
            </Link>
          </li>
        );
      })}
      <li>
        <span
          className="flex cursor-default items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-slate-600"
          title="The team inbox is the next phase on the roadmap"
        >
          <IconInbox className="size-[18px]" />
          Inbox
          <span className="ml-auto rounded-full border border-white/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Soon
          </span>
        </span>
      </li>
    </ul>
  );
}
