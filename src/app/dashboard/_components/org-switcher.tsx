"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { setActiveOrgAction } from "@/app/actions/orgs";
import { IconCheck, IconChevronsUpDown, IconPlus } from "@/app/_ui/icons";
import { cx, focusRing } from "@/app/_ui/primitives";
import { Spinner } from "@/app/_ui/submit-button";

export interface OrgOption {
  id: string;
  name: string;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function OrgAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cx(
        "grid shrink-0 place-items-center rounded-lg bg-linear-to-br from-cyan-400 via-violet-400 to-pink-400 font-bold text-slate-950",
        className ?? "size-8 text-xs",
      )}
    >
      {initials(name) || "?"}
    </span>
  );
}

export function OrgSwitcher({ orgs, activeId }: { orgs: OrgOption[]; activeId: string }) {
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const active = orgs.find((o) => o.id === activeId) ?? orgs[0];

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function switchTo(id: string) {
    const fd = new FormData();
    fd.set("orgId", id);
    setPendingId(id);
    startTransition(async () => {
      await setActiveOrgAction(fd);
      // The action revalidates /dashboard; refreshing covers every other
      // dashboard route (sources, settings) that reads the active org.
      router.refresh();
      setOpen(false);
      setPendingId(null);
    });
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cx(
          "flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-2 text-left transition hover:border-white/20 hover:bg-white/[0.06]",
          focusRing,
        )}
      >
        <OrgAvatar name={active.name} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-white">{active.name}</span>
          <span className="block text-[11px] text-slate-500">
            {orgs.length} organization{orgs.length === 1 ? "" : "s"}
          </span>
        </span>
        <IconChevronsUpDown className="size-4 text-slate-500" />
      </button>

      {open && (
        <div className="night-pop absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-white/10 bg-[#0c1127] shadow-2xl">
          <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Switch organization
          </p>
          <ul role="listbox" aria-label="Organizations" className="max-h-64 overflow-y-auto p-1.5">
            {orgs.map((org) => {
              const isActive = org.id === activeId;
              return (
                <li key={org.id} role="option" aria-selected={isActive}>
                  <button
                    type="button"
                    disabled={isActive || isPending}
                    onClick={() => switchTo(org.id)}
                    className={cx(
                      "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition disabled:cursor-default",
                      focusRing,
                      isActive ? "text-white" : "text-slate-300 hover:bg-white/[0.06] hover:text-white",
                    )}
                  >
                    <OrgAvatar name={org.name} className="size-6 text-[10px]" />
                    <span className="min-w-0 flex-1 truncate">{org.name}</span>
                    {pendingId === org.id ? (
                      <Spinner className="size-3.5 text-slate-400" />
                    ) : (
                      isActive && <IconCheck className="size-4 text-cyan-300" strokeWidth={2.25} />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-white/10 p-1.5">
            <Link
              href="/onboarding"
              className={cx(
                "flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-slate-300 transition hover:bg-white/[0.06] hover:text-white",
                focusRing,
              )}
            >
              <span className="grid size-6 place-items-center rounded-md border border-dashed border-white/20">
                <IconPlus className="size-3.5" />
              </span>
              Create organization
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
