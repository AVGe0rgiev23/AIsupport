"use client";

import { useActionState } from "react";
import {
  createOrgAction,
  type CreateOrgState,
} from "@/app/actions/orgs";

export function CreateOrgForm() {
  const [state, formAction, pending] = useActionState<CreateOrgState, FormData>(
    createOrgAction,
    {},
  );

  if (state.siteKey) {
    return (
      <div className="rounded border border-gray-300 p-4">
        <h2 className="font-semibold">{state.orgName} created</h2>
        <p className="mt-2 text-sm text-gray-600">
          Your public site key — copy it now, it is shown only once:
        </p>
        <code className="mt-2 block break-all rounded bg-gray-100 p-2 text-sm">
          {state.siteKey}
        </code>
        <a
          href="/dashboard"
          className="mt-4 inline-block rounded bg-indigo-600 px-3 py-2 text-white"
        >
          Go to dashboard
        </a>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input
        name="name"
        required
        placeholder="Organization name"
        className="rounded border border-gray-300 p-2"
      />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        disabled={pending}
        className="rounded bg-indigo-600 p-2 text-white disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create organization"}
      </button>
    </form>
  );
}
