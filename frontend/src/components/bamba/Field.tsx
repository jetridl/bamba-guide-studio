import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

const LABEL = "block text-[11px] font-semibold tracking-[0.14em] text-bamba-muted uppercase"

/** A labelled control. The label wraps the field, so a tap anywhere focuses it. */
export function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string
  hint?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className={LABEL}>{label}</span>
      {children}
      {hint ? <span className="text-[13px] leading-snug text-bamba-hint">{hint}</span> : null}
    </label>
  )
}

/** The same shape for something that is not a control, such as a read-only value. */
export function FieldBlock({
  label,
  hint,
  className,
  children,
}: {
  label: string
  hint?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span className={LABEL}>{label}</span>
      {children}
      {hint ? <span className="text-[13px] leading-snug text-bamba-hint">{hint}</span> : null}
    </div>
  )
}

/** Bamba field shapes: 18px corners, 52px tall on a phone. */
export const fieldClass =
  "w-full rounded-field border border-bamba-chip-border bg-bamba-surface px-4 text-base text-bamba-ink transition outline-none placeholder:text-bamba-hint focus-visible:border-bamba-accent focus-visible:ring-3 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:bg-bamba-quiet-surface disabled:text-bamba-hint"

export const inputClass = cn(fieldClass, "h-13 md:h-12")

export const textareaClass = cn(fieldClass, "py-3.5 leading-relaxed")
