"use client";

import { useActionState } from "react";
import { updateAllowedDomainsAction, type SettingsActionState } from "@/app/actions/settings";
import { IconAlert, IconCheck } from "@/app/_ui/icons";
import { Badge, buttonStyles, Callout, Field, inputStyles } from "@/app/_ui/primitives";
import { Spinner } from "@/app/_ui/submit-button";

const initialState: SettingsActionState = {};

export function SettingsForm({ currentDomains }: { currentDomains: string[] }) {
  const [state, formAction, pending] = useActionState(updateAllowedDomainsAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {currentDomains.map((d) => (
          <Badge key={d} tone={d === "localhost" ? "neutral" : "info"} dot={d !== "localhost"}>
            {d}
          </Badge>
        ))}
      </div>
      <Field
        label="Domains"
        htmlFor="allowedDomains"
        hint="Comma-separated hostnames, like acme.com. Subdomains are allowed automatically. Keep localhost while you test."
      >
        <input
          id="allowedDomains"
          name="allowedDomains"
          defaultValue={currentDomains.join(", ")}
          placeholder="acme.com, help.acme.com"
          className={`${inputStyles} font-mono text-sm`}
        />
      </Field>
      {state.error && (
        <Callout tone="danger" icon={IconAlert}>
          {state.error}
        </Callout>
      )}
      {state.ok && (
        <Callout tone="success" icon={IconCheck}>
          Saved. The widget now loads on these domains.
        </Callout>
      )}
      <div className="flex justify-end">
        <button type="submit" disabled={pending} className={buttonStyles("primary")}>
          {pending && <Spinner />}
          {pending ? "Saving…" : "Save domains"}
        </button>
      </div>
    </form>
  );
}
