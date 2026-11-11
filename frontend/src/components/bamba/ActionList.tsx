import type { ComponentType, ReactNode } from "react"
import { Link } from "react-router"

import { ListSurface } from "@/components/bamba/Surface"
import { cn } from "@/lib/utils"

export type ActionItem = {
  key: string
  icon: ComponentType<{ className?: string }>
  title: string
  description?: string
  /** Shown on the right: a current value, a count, a version. */
  trailing?: ReactNode
  to?: string
  onSelect?: () => void
  disabled?: boolean
  /** Why the item cannot be used here. Replaces the description when disabled. */
  disabledHint?: string
}

/** The app's actions menu: an icon, a title, and a line that says what it does. */
export function ActionList({ items, className }: { items: ActionItem[]; className?: string }) {
  return (
    <ListSurface className={className}>
      {items.map((item) => {
        const Icon = item.icon
        const description = item.disabled ? (item.disabledHint ?? item.description) : item.description
        const body = (
          <>
            <Icon className={cn("size-5 shrink-0", item.disabled ? "text-bamba-hint" : "text-bamba-quiet")} />
            <span className="min-w-0 flex-1">
              <span className={cn("block text-[15px] font-medium", item.disabled && "text-bamba-hint")}>{item.title}</span>
              {description ? <span className="mt-0.5 block text-[13px] text-bamba-hint">{description}</span> : null}
            </span>
            {item.trailing ? <span className="shrink-0 text-[13px] text-bamba-muted">{item.trailing}</span> : null}
          </>
        )
        const shared = "flex w-full min-h-14 items-center gap-3.5 px-4 py-3 text-left transition"
        if (item.disabled) {
          return (
            <div key={item.key} className={cn(shared, "cursor-not-allowed")} aria-disabled="true">
              {body}
            </div>
          )
        }
        if (item.to) {
          return (
            <Link key={item.key} to={item.to} className={cn(shared, "text-bamba-ink no-underline hover:bg-bamba-chip-fill")}>
              {body}
            </Link>
          )
        }
        return (
          <button
            key={item.key}
            type="button"
            onClick={item.onSelect}
            className={cn(shared, "outline-none hover:bg-bamba-chip-fill focus-visible:bg-bamba-chip-fill")}
          >
            {body}
          </button>
        )
      })}
    </ListSurface>
  )
}
