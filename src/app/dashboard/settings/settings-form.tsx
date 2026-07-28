"use client";

import { useActionState } from "react";
import { updateAllowedDomainsAction, type SettingsActionState } from "@/app/actions/settings";

const initialState: SettingsActionState = {};

export function SettingsForm({ currentDomains }: { currentDomains: string[] }) {
  const [state, formAction, pending] = useActionState(updateAllowedDomainsAction, initialState);

  return (
    <form action={formAction} className="space-y-2">
      <label className="block text-sm font-medium">Allowed widget domains</label>
      <input
        name="allowedDomains"
        defaultValue={currentDomains.join(", ")}
        placeholder="acme.com, help.acme.com"
        className="w-full rounded border border-gray-300 p-2"
      />
      <p className="text-xs text-gray-500">Comma-separated hostnames. Subdomains are allowed automatically.</p>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.ok && <p className="text-sm text-green-600">Saved.</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-indigo-600 px-4 py-2 text-white disabled:opacity-50"
      >
        Save
      </button>
    </form>
  );
}
