import { cn } from "@/lib/utils"
import { formatClock } from "@/features/editor/guideHelpers"
import type { SaveState as State } from "@/features/editor/useGuideEditor"

/** Always visible, on every width: the editor never hides whether work is safe. */
export function SaveState({
  state,
  savedAt,
  readOnly,
  onRetry,
  className,
}: {
  state: State
  savedAt: number | null
  readOnly?: boolean
  onRetry?: () => void
  className?: string
}) {
  if (readOnly) {
    return <span className={cn("text-[13px] text-bamba-muted", className)}>Read only</span>
  }
  if (state === "error" && onRetry) {
    return (
      <button
        type="button"
        onClick={onRetry}
        className={cn(
          "inline-flex min-h-9 items-center gap-1.5 rounded-full border border-bamba-block-border bg-bamba-block-fill px-3 text-[13px] font-semibold text-bamba-block-ink",
          className,
        )}
      >
        Save failed · Retry
      </button>
    )
  }
  const text =
    state === "saving"
      ? "Saving"
      : state === "error"
        ? "Save failed"
        : savedAt
          ? `Saved ${formatClock(savedAt)}`
          : "Ready"
  return (
    <span className={cn("text-[13px]", state === "error" ? "font-semibold text-bamba-block-ink" : "text-bamba-muted", className)}>
      {text}
    </span>
  )
}
