"use client";

import { useState } from "react";
import { IconCheck, IconCopy } from "./icons";
import { cx, focusRing } from "./primitives";

export function CopyButton({
  text,
  label = "Copy",
  className,
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked (insecure context, permissions). The text
      // stays visible and selectable, so there is nothing else to do.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-white",
        focusRing,
        className,
      )}
    >
      {copied ? (
        <>
          <IconCheck className="size-3.5 text-emerald-300" strokeWidth={2.5} />
          Copied
        </>
      ) : (
        <>
          <IconCopy className="size-3.5" />
          {label}
        </>
      )}
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </button>
  );
}
