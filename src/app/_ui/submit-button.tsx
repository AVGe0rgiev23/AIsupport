"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { buttonStyles, cx, type ButtonSize, type ButtonVariant } from "./primitives";

/** A submit button that shows its own pending state for plain server-action
 *  forms (the ones that don't already use useActionState). */
export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  size = "md",
  className,
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={cx(buttonStyles(variant, size), className)}>
      {pending && <Spinner />}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx("inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent", className)}
    />
  );
}
