"use client";

import { useState } from "react";
import { IconCheck, IconCopy } from "./icons";

export function CopySnippet({ origin }: { origin: string }) {
  const [copied, setCopied] = useState(false);
  const snippet = `<script src="${origin}/widget.js" data-site-key="pk_your_site_key"></script>`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked (insecure context, permissions). The snippet
      // stays visible and selectable, so there is nothing else to do.
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950 shadow-2xl">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-rose-400/80" />
          <span className="size-2.5 rounded-full bg-amber-300/80" />
          <span className="size-2.5 rounded-full bg-emerald-400/80" />
        </div>
        <span className="font-mono text-xs text-slate-500">index.html</span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-cyan-300"
        >
          {copied ? (
            <>
              <IconCheck className="size-3.5 text-emerald-300" strokeWidth={2.5} />
              Copied
            </>
          ) : (
            <>
              <IconCopy className="size-3.5" />
              Copy
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-7">
        <code>
          <span className="text-pink-400">&lt;script</span>
          {"\n  "}
          <span className="text-cyan-300">src</span>
          <span className="text-slate-500">=</span>
          <span className="text-amber-200">&quot;{origin}/widget.js&quot;</span>
          {"\n  "}
          <span className="text-cyan-300">data-site-key</span>
          <span className="text-slate-500">=</span>
          <span className="text-amber-200">&quot;pk_your_site_key&quot;</span>
          <span className="text-pink-400">&gt;</span>
          {"\n"}
          <span className="text-pink-400">&lt;/script&gt;</span>
        </code>
      </pre>
    </div>
  );
}
