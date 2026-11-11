import { ActionButton } from "@/components/bamba/Button"
import { SeverityPill } from "@/components/bamba/pills"
import type { ReviewComment } from "@/lib/types"
import { cn } from "@/lib/utils"

const BORDER: Record<ReviewComment["severity"], string> = {
  blocking: "border-bamba-block-border",
  warning: "border-bamba-warn-border",
  suggestion: "border-bamba-note-border",
  note: "border-bamba-note-border",
}

/** Review notes as calm cards. Accept is the only thing that rewrites the guide. */
export function ReviewNotes({
  comments,
  readOnly,
  onAccept,
  onStatus,
  className,
}: {
  comments: ReviewComment[]
  readOnly: boolean
  onAccept: (commentId: string) => void
  onStatus: (commentId: string, status: ReviewComment["status"]) => void
  className?: string
}) {
  if (comments.length === 0) {
    return (
      <p className={cn("rounded-xl border border-bamba-border bg-bamba-surface p-5 text-sm text-bamba-muted", className)}>
        No notes on this page.
      </p>
    )
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {comments.map((comment) => (
        <section key={comment.id} className={cn("rounded-xl border bg-bamba-surface p-4", BORDER[comment.severity])}>
          <div className="mb-2 flex items-center gap-2.5">
            <SeverityPill severity={comment.severity} />
            <span className="text-xs text-bamba-hint">{comment.category}</span>
            {comment.status !== "open" ? (
              <span className="ml-auto text-xs text-bamba-hint capitalize">{comment.status}</span>
            ) : null}
          </div>
          <p className="text-[15px] leading-relaxed">{comment.comment}</p>
          {comment.suggestedRevision ? (
            <blockquote className="mt-3 rounded-lg bg-bamba-quiet-surface p-3 text-sm leading-relaxed text-bamba-quiet">
              {comment.suggestedRevision}
            </blockquote>
          ) : null}
          {comment.status === "open" && !readOnly ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <ActionButton
                variant="primary"
                size="compact"
                className="flex-1 md:flex-none"
                onClick={() => onAccept(comment.id)}
              >
                Accept
              </ActionButton>
              <ActionButton size="compact" className="flex-1 md:flex-none" onClick={() => onStatus(comment.id, "resolved")}>
                Resolve
              </ActionButton>
              <ActionButton variant="ghost" size="compact" onClick={() => onStatus(comment.id, "dismissed")}>
                Dismiss
              </ActionButton>
            </div>
          ) : null}
        </section>
      ))}
    </div>
  )
}
