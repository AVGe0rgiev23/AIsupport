import { cx } from "./primitives";

/** Decorative night-sky layers: grid, stars and drifting aurora glows. */
export function NightBackdrop({ intensity = "full" }: { intensity?: "full" | "soft" }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="night-grid absolute inset-0" />
      <div className={cx("night-stars absolute inset-0", intensity === "soft" ? "opacity-40" : "opacity-70")} />
      <div
        className={cx(
          "night-blob absolute -left-40 top-10 size-[30rem] rounded-full blur-3xl",
          intensity === "soft" ? "bg-violet-600/15" : "bg-violet-600/25",
        )}
      />
      <div
        className={cx(
          "night-blob-slow absolute -right-32 -top-24 size-[32rem] rounded-full blur-3xl",
          intensity === "soft" ? "bg-cyan-500/10" : "bg-cyan-500/20",
        )}
      />
    </div>
  );
}
