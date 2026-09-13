import { CopyButton } from "../_ui/copy-button";

/** The widget install snippet, syntax-highlighted, with a copy button. Shared
 *  by the landing page and the dashboard's widget settings. */
export function CopySnippet({ origin }: { origin: string }) {
  const snippet = `<script src="${origin}/widget.js" data-site-key="pk_your_site_key"></script>`;

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950 shadow-2xl">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-rose-400/80" />
          <span className="size-2.5 rounded-full bg-amber-300/80" />
          <span className="size-2.5 rounded-full bg-emerald-400/80" />
        </div>
        <span className="font-mono text-xs text-slate-500">index.html</span>
        <CopyButton text={snippet} />
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
