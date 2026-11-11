import type { ReactNode } from "react"
import { X } from "lucide-react"

import { IconButton } from "@/components/bamba/Button"
import { cn } from "@/lib/utils"

const TONES = {
  info: "border-bamba-border bg-bamba-surface text-bamba-ink",
  warn: "border-bamba-warn-border bg-bamba-warn-fill text-bamba-ink",
  block: "border-bamba-block-border bg-bamba-block-fill text-bamba-ink",
} as const

/** A calm message. Never an alarm: no harsh red, no shouting. */
export function Banner({
  tone = "info",
  role,
  onDismiss,
  className,
  children,
}: {
  tone?: keyof typeof TONES
  role?: "alert" | "status"
  onDismiss?: () => void
  className?: string
  children: ReactNode
}) {
  return (
    <div
      role={role}
      className={cn("flex items-start gap-3 rounded-xl border p-4 text-sm leading-relaxed", TONES[tone], className)}
    >
      <div className="min-w-0 flex-1 whitespace-pre-wrap">{children}</div>
      {onDismiss ? (
        <IconButton tone="plain" className="-my-1.5 -mr-2 size-9" onClick={onDismiss} aria-label="Dismiss">
          <X className="size-4" />
        </IconButton>
      ) : null}
    </div>
  )
}
