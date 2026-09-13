"use client";

import { useActionState } from "react";
import {
  createOrgAction,
  type CreateOrgState,
} from "@/app/actions/orgs";
import { CopyButton } from "@/app/_ui/copy-button";
import { IconAlert, IconArrowRight, IconBuilding, IconCheck, IconKey } from "@/app/_ui/icons";
import { buttonStyles, Callout, cx, Field, inputStyles } from "@/app/_ui/primitives";
import { Spinner } from "@/app/_ui/submit-button";

function Steps({ current }: { current: 1 | 2 }) {
  const steps = ["Name it", "Save your key"];
  return (
    <ol className="flex items-center gap-3 text-xs font-medium">
      {steps.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <li key={label} className="flex items-center gap-3">
            <span className="flex items-center gap-2">
              <span
                className={cx(
                  "grid size-6 place-items-center rounded-full text-[11px] font-bold",
                  done && "bg-emerald-400 text-slate-950",
                  active && "bg-white text-slate-950",
                  !done && !active && "border border-white/15 text-slate-500",
                )}
              >
                {done ? <IconCheck className="size-3.5" strokeWidth={3} /> : n}
              </span>
              <span className={active || done ? "text-slate-200" : "text-slate-500"}>{label}</span>
            </span>
            {n < steps.length && <span className="h-px w-8 bg-white/15" />}
          </li>
        );
      })}
    </ol>
  );
}

export function CreateOrgForm() {
  const [state, formAction, pending] = useActionState<CreateOrgState, FormData>(
    createOrgAction,
    {},
  );

  if (state.siteKey) {
    return (
      <div className="night-pop">
        <Steps current={2} />
        <span className="mt-8 grid size-12 place-items-center rounded-2xl bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/30">
          <IconCheck className="size-6" strokeWidth={2.25} />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-white">{state.orgName} is ready</h1>
        <p className="mt-2 text-slate-400">
          This public site key connects the chat widget on your website to this organization.
        </p>

        <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
            <span className="flex items-center gap-2 text-xs font-medium text-slate-400">
              <IconKey className="size-3.5 text-violet-300" />
              Site key
            </span>
            <CopyButton text={state.siteKey} />
          </div>
          <code className="block break-all px-4 py-4 font-mono text-sm text-amber-200">{state.siteKey}</code>
        </div>

        <Callout tone="warning" icon={IconAlert} title="Copy it now" className="mt-4">
          It&apos;s shown only once. SupportAI stores just a hash, so it can&apos;t be displayed again.
        </Callout>

        {/* Full page load on purpose, so the dashboard re-renders with the new active organization. */}
        <a href="/dashboard" className={`${buttonStyles("brand", "lg")} mt-8 w-full`}>
          I&apos;ve saved it, open my dashboard
          <IconArrowRight className="size-4" />
        </a>
      </div>
    );
  }

  return (
    <div>
      <Steps current={1} />
      <span className="mt-8 grid size-12 place-items-center rounded-2xl bg-linear-to-br from-cyan-400/20 via-violet-400/20 to-pink-400/20 text-violet-200 ring-1 ring-white/10">
        <IconBuilding className="size-5" />
      </span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight text-white">Create your organization</h1>
      <p className="mt-2 text-slate-400">
        An organization is one business: its knowledge, its widget and its hand-offs. You can create
        more later.
      </p>

      <form action={formAction} className="mt-8 space-y-4">
        <Field label="Organization name" htmlFor="org-name" hint="Usually your company or brand name.">
          <input
            id="org-name"
            name="name"
            required
            autoFocus
            placeholder="Acme Outdoor"
            className={inputStyles}
          />
        </Field>
        {state.error && (
          <Callout tone="danger" icon={IconAlert}>
            {state.error}
          </Callout>
        )}
        <button disabled={pending} className={`${buttonStyles("brand", "lg")} w-full`}>
          {pending && <Spinner />}
          {pending ? "Creating…" : "Create organization"}
        </button>
      </form>
    </div>
  );
}
