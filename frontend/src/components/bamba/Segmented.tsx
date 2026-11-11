import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export type SegmentedOption<T extends string> = {
  value: T
  label: string
  trailing?: ReactNode
}

/**
 * The app's Library/Journeys pill, reused for Edit / Preview / Notes.
 * Every segment is at least 44px tall.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
  label,
}: {
  value: T
  options: SegmentedOption<T>[]
  onChange: (value: T) => void
  className?: string
  label: string
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn("flex rounded-full border border-bamba-border bg-bamba-quiet-surface p-1", className)}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full px-4 text-[15px] transition outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              active ? "bg-bamba-surface font-semibold text-bamba-ink shadow-xs" : "text-bamba-quiet hover:text-bamba-ink",
            )}
          >
            {option.label}
            {option.trailing}
          </button>
        )
      })}
    </div>
  )
}

/** A single-select filter row. It scrolls sideways instead of wrapping. */
export function ChipRow<T extends string>({
  value,
  options,
  onChange,
  className,
  label,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  className?: string
  label: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 md:mx-0 md:px-0 [scrollbar-width:none]", className)}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex h-10 shrink-0 items-center rounded-full border px-4 text-sm transition outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              active
                ? "border-transparent bg-bamba-solid font-medium text-bamba-on-solid"
                : "border-bamba-chip-border bg-bamba-surface text-bamba-ink hover:bg-bamba-chip-fill",
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
