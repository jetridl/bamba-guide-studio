import type { ReactNode } from "react"
import { Link } from "react-router"

import { cn } from "@/lib/utils"

/** One shared rounded surface with hairline dividers, as in the app's Library. */
export function ListSurface({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "divide-y divide-bamba-divider overflow-hidden rounded-xl border border-bamba-border bg-bamba-surface",
        className,
      )}
    >
      {children}
    </div>
  )
}

type RowProps = {
  to?: string
  onClick?: () => void
  selected?: boolean
  className?: string
  children: ReactNode
}

/** A row in a ListSurface. A link, a button, or plain text. */
export function ListRow({ to, onClick, selected = false, className, children }: RowProps) {
  const shared = cn(
    "flex w-full items-center gap-3 px-4 py-3 text-left transition md:px-5",
    selected ? "bg-bamba-chip-fill" : "hover:bg-bamba-chip-fill/60",
    className,
  )
  if (to) {
    return (
      <Link to={to} className={cn(shared, "text-bamba-ink no-underline")}>
        {children}
      </Link>
    )
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(shared, "min-h-11 outline-none focus-visible:bg-bamba-chip-fill")}>
        {children}
      </button>
    )
  }
  return <div className={shared}>{children}</div>
}

/** A calm card: the shape used for review notes and panels. */
export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-xl border border-bamba-border bg-bamba-surface p-4", className)}>{children}</div>
  )
}

export function SectionHeading({
  title,
  meta,
  className,
}: {
  title: ReactNode
  meta?: ReactNode
  className?: string
}) {
  return (
    <div className={cn("mb-2 flex items-baseline justify-between gap-3", className)}>
      <h2 className="font-heading text-xl font-semibold">{title}</h2>
      {meta ? <span className="shrink-0 text-[13px] text-bamba-muted">{meta}</span> : null}
    </div>
  )
}
