import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "@/auth";
import { IconArrowRight, IconLogOut, LogoMark } from "@/app/_ui/icons";
import { cx, focusRing } from "@/app/_ui/primitives";
import { MobileNav } from "./_components/mobile-nav";
import { NavLinks } from "./_components/nav-links";
import { OrgSwitcher, type OrgOption } from "./_components/org-switcher";
import { getDashboardContext } from "./_lib/context";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const ctx = await getDashboardContext();
  const orgs: OrgOption[] = ctx.orgs.map((o) => ({ id: o._id.toString(), name: o.name }));
  const activeId = ctx.activeOrgId.toString();

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/signin" });
  }

  const body = (
    <SidebarBody orgs={orgs} activeId={activeId} email={ctx.email} signOutAction={signOutAction} />
  );

  return (
    <div className="theme-night flex min-h-dvh flex-1">
      <aside className="sticky top-0 hidden h-dvh w-[17rem] shrink-0 flex-col border-r border-white/[0.06] bg-[#060918] px-4 pb-4 pt-5 lg:flex">
        <Link href="/" className={cx("mb-6 flex items-center gap-2.5 rounded-lg px-1", focusRing)}>
          <LogoMark className="size-8" />
          <span className="text-[17px] font-semibold tracking-tight text-white">SupportAI</span>
        </Link>
        {body}
      </aside>

      <div className="relative flex min-w-0 flex-1 flex-col">
        <MobileNav title={ctx.activeOrg.name}>{body}</MobileNav>
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-80 overflow-hidden">
          <div className="night-blob absolute -top-40 left-1/3 size-[34rem] rounded-full bg-violet-600/10 blur-3xl" />
        </div>
        <main className="relative flex-1 px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

function SidebarBody({
  orgs,
  activeId,
  email,
  signOutAction,
}: {
  orgs: OrgOption[];
  activeId: string;
  email: string;
  signOutAction: () => Promise<void>;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <OrgSwitcher orgs={orgs} activeId={activeId} />

      <nav aria-label="Dashboard" className="mt-7">
        <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-600">Workspace</p>
        <NavLinks />
      </nav>

      <div className="mt-8 space-y-3 lg:mt-auto">
        <Link
          href="/dashboard/settings"
          className={cx(
            "group block rounded-xl border border-white/10 bg-linear-to-br from-violet-500/10 to-cyan-500/5 p-3.5 transition hover:border-white/20",
            focusRing,
          )}
        >
          <p className="text-sm font-semibold text-white">Install the widget</p>
          <p className="mt-0.5 text-xs text-slate-400">One line on any website.</p>
          <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-cyan-300">
            Get the snippet
            <IconArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
          </span>
        </Link>

        <div className="flex items-center gap-2.5 rounded-xl px-1.5 py-1">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/[0.08] text-xs font-semibold uppercase text-slate-200">
            {email.slice(0, 1) || "?"}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm text-slate-300" title={email}>
            {email}
          </span>
          <form action={signOutAction}>
            <button
              type="submit"
              title="Sign out"
              aria-label="Sign out"
              className={cx(
                "grid size-8 place-items-center rounded-lg text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-200",
                focusRing,
              )}
            >
              <IconLogOut className="size-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
