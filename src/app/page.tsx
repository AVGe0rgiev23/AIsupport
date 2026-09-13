import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { AnswerGame } from "./_landing/answer-game";
import { CopySnippet } from "./_landing/copy-snippet";
import { HeroDemo } from "./_landing/hero-demo";
import {
  IconActivity,
  IconArrowRight,
  IconBookCheck,
  IconBuilding,
  IconChat,
  IconCheck,
  IconChevronDown,
  IconCode,
  IconEyeOff,
  IconFilter,
  IconGauge,
  IconHandoff,
  IconLifebuoy,
  IconLock,
  IconMoon,
  IconRefresh,
  IconShield,
  IconShuffle,
  IconUpload,
  IconX,
  IconZap,
  LogoMark,
} from "./_ui/icons";

export const metadata: Metadata = {
  title: "SupportAI · The support teammate that never sleeps",
  description:
    "An AI chat widget that answers customers from your own help docs in seconds, at any hour, and hands tricky questions to your team.",
};

// Baked in at build time. On Vercel this is the production origin, so the
// install snippet shows the real widget.js URL.
const APP_ORIGIN = (process.env.APP_URL ?? "https://your-app.vercel.app").replace(/\/$/, "");
const GITHUB_URL = "https://github.com/AVGe0rgiev23/AIsupport";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300";

export default function Home() {
  return (
    <div className="theme-night flex-1 font-sans antialiased">
      <Nav />
      <main>
        <Hero />
        <Stats />
        <HowItWorks />
        <Features />
        <TryIt />
        <Security />
        <Install />
        <Roadmap />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Nav() {
  const links = [
    ["How it works", "#how-it-works"],
    ["Features", "#features"],
    ["Try it", "#try-it"],
    ["Security", "#security"],
    ["FAQ", "#faq"],
  ];
  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-[#070b1a]/75 backdrop-blur-xl">
      <nav className="mx-auto flex h-16 max-w-[76rem] items-center justify-between px-5 sm:px-8">
        <a href="#top" className={`flex items-center gap-2.5 rounded-lg ${focusRing}`}>
          <LogoMark className="size-8" />
          <span className="text-[17px] font-semibold tracking-tight text-white">SupportAI</span>
        </a>
        <ul className="hidden items-center gap-1 md:flex">
          {links.map(([label, href]) => (
            <li key={href}>
              <a
                href={href}
                className={`rounded-full px-3.5 py-2 text-sm text-slate-400 transition hover:text-white ${focusRing}`}
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2">
          <Link
            href="/signin"
            className={`hidden rounded-full px-4 py-2 text-sm font-medium text-slate-300 transition hover:text-white sm:inline-flex ${focusRing}`}
          >
            Sign in
          </Link>
          <Link
            href="/signin"
            className={`inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-100 ${focusRing}`}
          >
            Get started
            <IconArrowRight className="size-4" />
          </Link>
        </div>
      </nav>
    </header>
  );
}

function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      <div className="night-grid pointer-events-none absolute inset-0" />
      <div className="night-stars pointer-events-none absolute inset-0 opacity-70" />
      <div className="night-blob pointer-events-none absolute -left-32 top-24 size-[28rem] rounded-full bg-violet-600/30 blur-3xl" />
      <div className="night-blob-slow pointer-events-none absolute -right-24 -top-20 size-[30rem] rounded-full bg-cyan-500/20 blur-3xl" />

      <div className="relative mx-auto grid max-w-[76rem] items-center gap-14 px-5 pb-24 pt-16 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pb-32 lg:pt-24">
        <div>
          <p className="inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-indigo-200">
            <span className="relative flex size-2">
              <span className="night-ping absolute inline-flex size-full rounded-full bg-emerald-400" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
            </span>
            Online 24/7 · answers from your own docs
          </p>

          <h1 className="mt-6 text-balance text-5xl font-semibold leading-[1.02] tracking-[-0.035em] text-white sm:text-6xl lg:text-7xl">
            The support teammate that <span className="night-gradient-text">never sleeps.</span>
          </h1>

          <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-slate-400">
            SupportAI reads your help docs, website and past tickets, then answers customers in
            seconds, at any hour. When a question needs a person, it hands off with the
            customer’s email and the full conversation.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              href="/signin"
              className={`inline-flex items-center gap-2 rounded-full bg-linear-to-r from-cyan-400 via-violet-400 to-pink-400 px-6 py-3 text-[15px] font-semibold text-slate-950 shadow-[0_10px_40px_-10px_rgba(167,139,250,0.7)] transition hover:brightness-110 ${focusRing}`}
            >
              Get started free
              <IconArrowRight className="size-4" />
            </Link>
            <a
              href="#try-it"
              className={`inline-flex items-center gap-2 rounded-full border border-white/15 px-6 py-3 text-[15px] font-medium text-white transition hover:border-white/30 hover:bg-white/5 ${focusRing}`}
            >
              Play “Would it answer this?”
            </a>
          </div>

          <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500">
            {["One-line install", "No per-seat pricing", "Hands off to humans"].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <IconCheck className="size-4 text-emerald-400" strokeWidth={2.25} />
                {t}
              </li>
            ))}
          </ul>
        </div>

        <HeroDemo />
      </div>
    </section>
  );
}

function Stats() {
  const stats = [
    { value: "24/7", label: "Always answering, even at 2 AM" },
    { value: "8", label: "Passages checked before every answer" },
    { value: "2", label: "AI providers, with automatic failover" },
    { value: "$0", label: "Monthly bill on free tiers" },
  ];
  return (
    <section aria-label="At a glance" className="border-y border-white/5 bg-white/[0.02]">
      <dl className="mx-auto grid max-w-[76rem] grid-cols-2 gap-y-10 px-5 py-12 sm:px-8 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.value} className="px-2 text-center lg:border-l lg:border-white/5 lg:first:border-l-0">
            <dt className="sr-only">{s.label}</dt>
            <dd className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">{s.value}</dd>
            <dd className="mx-auto mt-2 max-w-[14rem] text-sm text-slate-400">{s.label}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function SectionHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-300">{eyebrow}</p>
      <h2 className="mt-3 text-balance text-4xl font-semibold tracking-[-0.03em] text-white sm:text-5xl">
        {title}
      </h2>
      {children && <p className="mt-5 text-pretty text-lg text-slate-400">{children}</p>}
    </div>
  );
}

function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 px-5 py-24 sm:px-8 lg:py-32">
      <div className="mx-auto max-w-6xl">
        <SectionHeading eyebrow="How it works" title="Live on your site in three steps">
          No scripts to write and no decision trees to maintain. Give it your knowledge, paste one
          line, and it takes the night shift.
        </SectionHeading>

        <ol className="mt-16 grid gap-5 lg:grid-cols-3">
          <StepCard n={1} accent="from-cyan-400 to-cyan-300" title="Feed it your knowledge">
            <p>
              Upload PDFs, Word docs, Markdown or text. Point it at your help center. Import past
              tickets from CSV or mbox. It re-reads your site daily or weekly.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {["PDF", "DOCX", "Markdown", "Website", "CSV tickets", "mbox"].map((t) => (
                <span
                  key={t}
                  className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-xs text-slate-300"
                >
                  {t}
                </span>
              ))}
            </div>
          </StepCard>

          <StepCard n={2} accent="from-violet-400 to-violet-300" title="Paste one line">
            <p>
              Add a single script tag to your website. Your branded chat appears, and it only runs
              on domains you approve.
            </p>
            <pre className="mt-6 overflow-x-auto rounded-xl border border-white/10 bg-slate-950 p-4 font-mono text-[12px] leading-6 text-slate-400">
              <span className="text-pink-400">&lt;script</span>{" "}
              <span className="text-cyan-300">src</span>=
              <span className="text-amber-200">&quot;…/widget.js&quot;</span>
              {"\n  "}
              <span className="text-cyan-300">data-site-key</span>=
              <span className="text-amber-200">&quot;pk_…&quot;</span>
              <span className="text-pink-400">&gt;&lt;/script&gt;</span>
            </pre>
          </StepCard>

          <StepCard n={3} accent="from-pink-400 to-pink-300" title="It handles the rest">
            <p>
              Customers get answers in seconds, grounded in your docs. Anything tricky goes to your
              team with the customer’s email and the full chat.
            </p>
            <div className="mt-6 space-y-2">
              <div className="flex items-center gap-2.5 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.07] px-3 py-2.5 text-sm text-emerald-200">
                <IconCheck className="size-4" strokeWidth={2.25} />
                Answered from your docs
              </div>
              <div className="flex items-center gap-2.5 rounded-xl border border-amber-400/25 bg-amber-400/[0.07] px-3 py-2.5 text-sm text-amber-200">
                <IconHandoff className="size-4" />
                Tricky one? Ticket for your team
              </div>
            </div>
          </StepCard>
        </ol>
      </div>
    </section>
  );
}

function StepCard({
  n,
  accent,
  title,
  children,
}: {
  n: number;
  accent: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <li className="relative flex flex-col rounded-3xl border border-white/10 bg-linear-to-b from-white/[0.05] to-white/[0.01] p-7 text-[15px] leading-relaxed text-slate-400">
      <span
        className={`grid size-10 place-items-center rounded-full bg-linear-to-br ${accent} text-base font-bold text-slate-950`}
      >
        {n}
      </span>
      <h3 className="mb-3 mt-5 text-xl font-semibold text-white">{title}</h3>
      {children}
    </li>
  );
}

function Features() {
  const features = [
    {
      icon: IconUpload,
      title: "Learns from anything",
      body: "PDF, Word, Markdown and text files, whole websites via sitemap crawling, and past tickets. Scanned PDFs fall back to AI text extraction.",
    },
    {
      icon: IconRefresh,
      title: "Stays up to date",
      body: "Scheduled daily or weekly re-crawls. Unchanged pages are skipped by content hash, so no quota is wasted re-learning.",
    },
    {
      icon: IconZap,
      title: "Streams answers live",
      body: "Words appear as they’re written, like a person typing, instead of a spinner and a wall of text.",
    },
    {
      icon: IconBookCheck,
      title: "Grounded and cited",
      body: "Answers come only from the most relevant passages, and every citation is stored with the reply for review.",
    },
    {
      icon: IconHandoff,
      title: "Graceful hand-off",
      body: "When the AI asks for a human, a provider is busy or the daily cap is hit, the visitor leaves an email and a ticket opens.",
    },
    {
      icon: IconShuffle,
      title: "Two AI brains",
      body: "Google Gemini leads. If it’s rate-limited, Groq’s Llama 3.3 takes over before the visitor sees a single word.",
    },
    {
      icon: IconBuilding,
      title: "Multi-company from day one",
      body: "One install serves many businesses. Every record and every search is scoped to a single company.",
    },
    {
      icon: IconActivity,
      title: "Live ingestion dashboard",
      body: "Watch uploads, crawls and imports get processed in real time. Retry or delete a source in one click.",
    },
    {
      icon: IconChat,
      title: "Branded, isolated widget",
      body: "Each company’s colour, greeting and position. It runs in an iframe, so it never clashes with your site’s styles.",
    },
  ];
  return (
    <section id="features" className="scroll-mt-20 border-t border-white/5 px-5 py-24 sm:px-8 lg:py-32">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="Features"
          title={
            <>
              Everything a great support rep does. <span className="text-slate-400">Minus the coffee.</span>
            </>
          }
        />
        <div className="mt-16 grid gap-px overflow-hidden rounded-3xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, body }) => (
            <div key={title} className="group bg-[#0a0f22] p-7 transition hover:bg-[#0d1330]">
              <span className="grid size-11 place-items-center rounded-xl border border-white/10 bg-white/5 text-cyan-300 transition group-hover:border-cyan-300/40 group-hover:text-cyan-200">
                <Icon className="size-5" />
              </span>
              <h3 className="mt-5 text-lg font-semibold text-white">{title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-slate-400">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TryIt() {
  return (
    <section id="try-it" className="relative scroll-mt-20 overflow-hidden border-t border-white/5 px-5 py-24 sm:px-8 lg:py-32">
      <div className="night-blob pointer-events-none absolute left-1/2 top-10 size-[36rem] -translate-x-1/2 rounded-full bg-violet-700/15 blur-3xl" />
      <div className="relative mx-auto max-w-6xl">
        <SectionHeading eyebrow="A quick game" title="Would it answer this?">
          Six things a customer might type. Guess what SupportAI does, then see if you were right.
        </SectionHeading>
        <div className="mt-14">
          <AnswerGame />
        </div>
      </div>
    </section>
  );
}

function Security() {
  const items = [
    {
      icon: IconBuilding,
      title: "Companies never see each other",
      body: "Every search is pre-filtered by company inside the database, and every query goes through one tenant-scoped data layer.",
    },
    {
      icon: IconLock,
      title: "Only your domains",
      body: "The server checks where the widget is embedded, then issues a signed pass that expires in an hour.",
    },
    {
      icon: IconShield,
      title: "Prompt-injection resistant",
      body: "Documents and messages are fenced off as data, and attempts to fake that fence are defused first.",
    },
    {
      icon: IconGauge,
      title: "Abuse and quota controls",
      body: "A per-caller throttle and a per-company daily cap stop anyone from draining the shared AI quota.",
    },
    {
      icon: IconLifebuoy,
      title: "Never a raw error",
      body: "If anything fails, the visitor gets the hand-off form or a polite message. Never a stack trace.",
    },
    {
      icon: IconEyeOff,
      title: "Plain-text replies",
      body: "The widget renders text only, so injected content has no images or links to exfiltrate data with.",
    },
  ];
  const checks = [
    "Type checks · 4,000-character cap",
    "Same-site origin only",
    "Signed widget pass (HMAC, 1 hour)",
    "Daily cap · per-minute throttle",
    "Search scoped to this company",
  ];
  return (
    <section id="security" className="scroll-mt-20 border-t border-white/5 px-5 py-24 sm:px-8 lg:py-32">
      <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-300">Security</p>
          <h2 className="mt-3 text-balance text-4xl font-semibold tracking-[-0.03em] text-white sm:text-5xl">
            Built like a vault
          </h2>
          <p className="mt-5 max-w-xl text-lg text-slate-400">
            A public chat widget is an open door on the internet, so every request is treated like
            it came from a stranger.
          </p>
          <div className="mt-10 grid gap-x-8 gap-y-7 sm:grid-cols-2">
            {items.map(({ icon: Icon, title, body }) => (
              <div key={title}>
                <Icon className="size-5 text-cyan-300" />
                <h3 className="mt-3 font-semibold text-white">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-6 font-mono text-[13px] shadow-2xl sm:p-8">
          <div className="flex items-center gap-2 text-slate-500">
            <IconFilter className="size-4" />
            every visitor message
          </div>
          <p className="mt-4 text-slate-200">
            <span className="text-violet-300">POST</span> /api/chat
          </p>
          <ol className="mt-5 space-y-3">
            {checks.map((c) => (
              <li key={c} className="flex items-start gap-3 text-slate-300">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-emerald-400/15 text-emerald-300">
                  <IconCheck className="size-3" strokeWidth={3} />
                </span>
                {c}
              </li>
            ))}
          </ol>
          <div className="mt-6 flex items-center gap-3 border-t border-white/10 pt-5 text-cyan-300">
            <IconArrowRight className="size-4" />
            stream a grounded answer
          </div>
          <div className="mt-3 flex items-center gap-3 text-rose-300">
            <IconX className="size-4" strokeWidth={2.25} />
            anything else: rejected before AI or database work
          </div>
        </div>
      </div>
    </section>
  );
}


function Install() {
  return (
    <section id="install" className="scroll-mt-20 border-t border-white/5 px-5 py-24 sm:px-8 lg:py-32">
      <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-2">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-300">Install</p>
          <h2 className="mt-3 text-balance text-4xl font-semibold tracking-[-0.03em] text-white sm:text-5xl">
            One line. Any website.
          </h2>
          <p className="mt-5 text-lg text-slate-400">
            Works with WordPress, Shopify themes, Webflow, or plain HTML. If you can paste a tag
            before <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-sm text-slate-200">&lt;/body&gt;</code>, you can install SupportAI.
          </p>
          <ol className="mt-8 space-y-4">
            {[
              ["Create your company", "and copy the site key. It’s shown once and stored only as a hash."],
              ["Add your knowledge", "by uploading files, crawling your help center or importing tickets."],
              ["Approve your domains", "then paste the snippet. Done."],
            ].map(([strong, rest], i) => (
              <li key={strong} className="flex gap-4">
                <span className="grid size-7 shrink-0 place-items-center rounded-full border border-white/15 text-xs font-semibold text-slate-300">
                  {i + 1}
                </span>
                <p className="pt-0.5 text-slate-400">
                  <span className="font-medium text-white">{strong}</span> {rest}
                </p>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <CopySnippet origin={APP_ORIGIN} />
          <p className="mt-4 flex items-center gap-2 text-sm text-slate-500">
            <IconCode className="size-4" />
            Replace <code className="font-mono text-slate-400">pk_your_site_key</code> with the key from
            onboarding.
          </p>
        </div>
      </div>
    </section>
  );
}

function Roadmap() {
  const shipped = [
    "Knowledge intake: uploads, crawling, ticket import",
    "Streaming chat widget with citations stored",
    "Human hand-off, provider failover, abuse controls",
  ];
  const next = [
    "Team inbox with email notifications",
    "Email channel: AI replies to support emails",
    "Self-writing knowledge base, human-approved",
    "Analytics and quota dashboard",
  ];
  return (
    <section className="border-t border-white/5 px-5 py-24 sm:px-8 lg:py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHeading eyebrow="Roadmap" title="Shipped, and what’s next" />
        <div className="mt-14 grid gap-5 md:grid-cols-2">
          <div className="rounded-3xl border border-emerald-400/20 bg-emerald-400/[0.04] p-7">
            <p className="text-sm font-semibold text-emerald-300">Live today</p>
            <ul className="mt-5 space-y-3.5">
              {shipped.map((s) => (
                <li key={s} className="flex items-start gap-3 text-slate-200">
                  <IconCheck className="mt-0.5 size-5 shrink-0 text-emerald-400" strokeWidth={2.25} />
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-7">
            <p className="text-sm font-semibold text-amber-300">Coming next</p>
            <ul className="mt-5 space-y-3.5">
              {next.map((s) => (
                <li key={s} className="flex items-start gap-3 text-slate-400">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-amber-300/70" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function Faq() {
  const faqs = [
    {
      q: "Will it make things up?",
      a: "No AI can promise never to, so SupportAI stacks the odds in your favour. It only sees passages retrieved from your documents, it’s instructed to answer from them alone, and it hands off whenever it isn’t confident. Citations are stored with every reply so answers can be audited.",
    },
    {
      q: "Will it replace my support team?",
      a: "No. It takes the repetitive questions off their plate and sends everything that needs judgment (refunds, legal questions, frustrated customers) straight to them, with the customer’s email and the full conversation.",
    },
    {
      q: "Do I need to be technical?",
      a: "Setting up your own installation needs someone comfortable with a terminal and a few free cloud accounts. After that, adding knowledge means uploading a file or pasting a URL, and installing the widget means pasting one line.",
    },
    {
      q: "Where does my data live?",
      a: "In your own MongoDB Atlas database and Vercel Blob store. To write an answer, the visitor’s question and the matching passages are sent to the AI provider (Google Gemini, or Groq as the fallback).",
    },
    {
      q: "What does it cost?",
      a: "It’s designed to run on free tiers. Free AI quotas are shared across every company on an installation and have their own data policies, so busy or sensitive deployments should move to a paid provider. That’s a small change in one file.",
    },
  ];
  return (
    <section id="faq" className="scroll-mt-20 border-t border-white/5 px-5 py-24 sm:px-8 lg:py-32">
      <div className="mx-auto max-w-3xl">
        <SectionHeading eyebrow="FAQ" title="Questions, answered" />
        <div className="mt-14 divide-y divide-white/10 rounded-3xl border border-white/10 bg-white/[0.02]">
          {faqs.map((f) => (
            <details key={f.q} className="group px-6 py-1 [&_summary::-webkit-details-marker]:hidden">
              <summary
                className={`flex cursor-pointer list-none items-center justify-between gap-6 rounded-lg py-5 text-left text-lg font-medium text-white ${focusRing}`}
              >
                {f.q}
                <IconChevronDown className="size-5 shrink-0 text-slate-500 transition group-open:rotate-180" />
              </summary>
              <p className="pb-6 pr-10 leading-relaxed text-slate-400">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="px-5 pb-24 sm:px-8 lg:pb-32">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] border border-white/10 bg-linear-to-br from-[#16123f] via-[#0d1330] to-[#062a3a] px-6 py-16 text-center sm:px-12 lg:py-20">
        <div className="night-stars pointer-events-none absolute inset-0 opacity-80" />
        <div className="night-blob pointer-events-none absolute -bottom-40 left-1/2 size-[30rem] -translate-x-1/2 rounded-full bg-violet-600/30 blur-3xl" />
        <div className="relative">
          <IconMoon className="mx-auto size-10 text-amber-200" />
          <h2 className="mx-auto mt-6 max-w-2xl text-balance text-4xl font-semibold tracking-[-0.03em] text-white sm:text-5xl">
            Your 2 AM customers are already asking.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-slate-300">
            Give them answers tonight, and give your team a quieter morning.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link
              href="/signin"
              className={`inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-[15px] font-semibold text-slate-950 transition hover:bg-cyan-100 ${focusRing}`}
            >
              Get started free
              <IconArrowRight className="size-4" />
            </Link>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-2 rounded-full border border-white/20 px-6 py-3 text-[15px] font-medium text-white transition hover:bg-white/10 ${focusRing}`}
            >
              <IconCode className="size-4" />
              View the code
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/5 px-5 py-10 sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 sm:flex-row">
        <div className="flex items-center gap-2.5">
          <LogoMark className="size-7" />
          <span className="font-semibold text-white">SupportAI</span>
          <span className="text-sm text-slate-500">· © {new Date().getFullYear()}</span>
        </div>
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-400">
          <a href="#how-it-works" className={`rounded hover:text-white ${focusRing}`}>
            How it works
          </a>
          <a href="#security" className={`rounded hover:text-white ${focusRing}`}>
            Security
          </a>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className={`rounded hover:text-white ${focusRing}`}>
            GitHub
          </a>
          <Link href="/signin" className={`rounded hover:text-white ${focusRing}`}>
            Sign in
          </Link>
        </nav>
      </div>
    </footer>
  );
}
