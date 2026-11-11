import type { ReactNode } from "react"

import { cn } from "@/lib/utils"
import type { GuideStatus, ReviewComment } from "@/lib/types"

export type PillTone = "neutral" | "warn" | "glow" | "solid" | "block"

const TONES: Record<PillTone, { pill: string; dot: string }> = {
  neutral: {
    pill: "border-bamba-note-border bg-bamba-note-fill text-bamba-note-ink",
    dot: "bg-bamba-paused-dot",
  },
  warn: {
    pill: "border-bamba-warn-border bg-bamba-warn-fill text-bamba-warn-ink",
    dot: "bg-bamba-accent",
  },
  glow: {
    pill: "border-bamba-warn-border bg-bamba-chip-fill text-bamba-glow",
    dot: "bg-bamba-glow-dot",
  },
  solid: {
    pill: "border-transparent bg-bamba-solid text-bamba-on-solid",
    dot: "bg-bamba-on-solid",
  },
  block: {
    pill: "border-bamba-block-border bg-bamba-block-fill text-bamba-block-ink",
    dot: "bg-bamba-block-ink",
  },
}

export function Pill({
  tone = "neutral",
  withDot = false,
  className,
  children,
}: {
  tone?: PillTone
  withDot?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-2 rounded-full border px-3 text-[13px] font-semibold whitespace-nowrap",
        TONES[tone].pill,
        className,
      )}
    >
      {withDot ? <span className={cn("size-2 rounded-full", TONES[tone].dot)} /> : null}
      {children}
    </span>
  )
}

/** A quiet marker on a list row: a dot alone, with a name for screen readers. */
export function StateDot({ tone, label, className }: { tone: PillTone; label: string; className?: string }) {
  return <span role="img" aria-label={label} className={cn("size-2 shrink-0 rounded-full", TONES[tone].dot, className)} />
}

const STATUS: Record<GuideStatus, { label: string; tone: PillTone }> = {
  draft: { label: "Draft", tone: "neutral" },
  in_review: { label: "In review", tone: "warn" },
  approved: { label: "Approved", tone: "glow" },
  exported: { label: "Exported", tone: "solid" },
}

export function statusTone(status: GuideStatus): PillTone {
  return STATUS[status]?.tone ?? "neutral"
}

export function statusLabel(status: GuideStatus): string {
  return STATUS[status]?.label ?? status.replace("_", " ")
}

export function GuideStatusPill({ status, className }: { status: GuideStatus; className?: string }) {
  return (
    <Pill tone={statusTone(status)} withDot={status !== "exported"} className={className}>
      {statusLabel(status)}
    </Pill>
  )
}

const SEVERITY: Record<ReviewComment["severity"], { label: string; tone: PillTone }> = {
  blocking: { label: "Blocking", tone: "block" },
  warning: { label: "Warning", tone: "warn" },
  suggestion: { label: "Suggestion", tone: "neutral" },
  note: { label: "Note", tone: "neutral" },
}

export function severityTone(severity: ReviewComment["severity"]): PillTone {
  return SEVERITY[severity]?.tone ?? "neutral"
}

export function SeverityPill({ severity }: { severity: ReviewComment["severity"] }) {
  const entry = SEVERITY[severity] ?? SEVERITY.note
  return (
    <Pill tone={entry.tone} className="h-6 px-2.5 text-xs">
      {entry.label}
    </Pill>
  )
}

/** A small count, used on the Notes tab and beside a session. */
export function CountBadge({ tone = "neutral", children }: { tone?: PillTone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full border px-1.5 text-xs font-semibold",
        TONES[tone].pill,
      )}
    >
      {children}
    </span>
  )
}
