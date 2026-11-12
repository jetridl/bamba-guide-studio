import { Check, ChevronRight, Circle } from "lucide-react"

import { ActionButton } from "@/components/bamba/Button"
import { Sheet } from "@/components/bamba/Sheet"
import { ListSurface } from "@/components/bamba/Surface"
import { isPublished, type ReadinessCheck } from "@/features/editor/guideHelpers"
import type { GuideDetail } from "@/lib/types"
import { cn } from "@/lib/utils"

function unsettled(checks: ReadinessCheck[]) {
  return checks.filter((check) => !check.ok)
}

/** A quiet line that says how far the guide is from being publishable. */
export function ReadinessStrip({
  checks,
  published,
  onOpen,
  className,
}: {
  checks: ReadinessCheck[]
  // The version number when exports/ holds it already.
  published?: number | null
  onOpen: () => void
  className?: string
}) {
  const open = unsettled(checks)
  const ready = open.length === 0 || published != null
  // Say what to do next, not that approval is pending: that is the last step.
  const first = open.find((check) => check.key !== "approved") ?? open[0]
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex w-full items-center gap-3 rounded-field border p-3.5 text-left transition",
        ready
          ? "border-bamba-warn-border bg-bamba-chip-fill hover:brightness-[0.99]"
          : "border-bamba-warn-border bg-bamba-warn-fill hover:brightness-[0.99]",
        className,
      )}
    >
      <span
        className={cn(
          "inline-flex size-9 shrink-0 items-center justify-center rounded-full",
          ready ? "bg-bamba-surface text-bamba-glow" : "bg-bamba-surface text-bamba-block-ink",
        )}
      >
        {ready ? <Check className="size-5" /> : <Circle className="size-5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-bamba-glow">
          {published != null
            ? `Version ${published} is published`
            : ready
              ? "Ready to publish"
              : `${open.length} ${open.length === 1 ? "thing" : "things"} to settle`}
        </span>
        <span className="mt-0.5 block truncate text-[13px] text-bamba-hint">
          {published != null
            ? "Raise the version to publish a change"
            : ready
              ? "All four checks pass"
              : (first?.detail ?? first?.label)}
        </span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-bamba-hint" />
    </button>
  )
}

export function ReadinessList({ checks }: { checks: ReadinessCheck[] }) {
  return (
    <ListSurface>
      {checks.map((check) => (
        <div key={check.key} className="flex min-h-12 items-center gap-3 px-4 py-3">
          {check.ok ? (
            <Check className="size-5 shrink-0 text-bamba-glow" />
          ) : (
            <Circle className="size-5 shrink-0 text-bamba-hint" />
          )}
          <span className={cn("flex-1 text-[15px]", check.ok ? "" : "text-bamba-muted")}>{check.label}</span>
          {check.detail ? <span className="shrink-0 text-[13px] text-bamba-hint">{check.detail}</span> : null}
        </div>
      ))}
    </ListSurface>
  )
}

/**
 * Approve and publish, with the four export conditions in front of the editor.
 * Publish writes the export on the Studio machine; Git stays a laptop job.
 */
export function PublishSheet({
  open,
  onOpenChange,
  guide,
  checks,
  warnings,
  ready,
  canApprove,
  readOnly,
  onApprove,
  onPublish,
  onRaiseVersion,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  guide: GuideDetail
  checks: ReadinessCheck[]
  warnings: number
  ready: boolean
  canApprove: boolean
  readOnly: boolean
  onApprove: () => void
  onPublish: () => void
  onRaiseVersion: () => void
}) {
  const approved = guide.status === "approved" || guide.status === "exported"
  const left = unsettled(checks).length
  const published = isPublished(guide)
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={published ? `Version ${guide.contentVersion} is published` : ready ? "Ready to publish" : "Before you publish"}
      description={
        published
          ? "A version is published once. To publish a change, raise the version first."
          : ready
            ? "All four checks pass."
            : `${left} ${left === 1 ? "check is" : "checks are"} still open. Settle them, then approve.`
      }
    >
      <ReadinessList checks={checks} />

      {warnings > 0 ? (
        <p className="mt-3 text-[13px] text-bamba-hint">
          {warnings} {warnings === 1 ? "warning" : "warnings"} do not block the export.
        </p>
      ) : null}

      <div className="mt-4 flex items-center gap-3 rounded-field border border-bamba-border p-3.5">
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">
            {published ? `exports/ holds version ${guide.publishedVersion}` : `Publishes as version ${guide.contentVersion}`}
          </span>
          <span className="mt-0.5 block text-[13px] leading-relaxed text-bamba-hint">
            {published
              ? "Raise the version, approve, and publish the new version."
              : guide.publishedVersion != null
                ? `Not published yet. exports/ holds version ${guide.publishedVersion}.`
                : "Not published yet. This is the first version in exports/."}
          </span>
        </span>
        {!readOnly ? (
          <ActionButton size="compact" onClick={onRaiseVersion}>
            Raise to {guide.nextFreeVersion ?? guide.contentVersion + 1}
          </ActionButton>
        ) : null}
      </div>

      <div className="mt-3 rounded-field bg-bamba-quiet-surface p-3.5">
        <div className="mb-1.5 text-[11px] font-semibold tracking-[0.12em] text-bamba-muted uppercase">Writes to</div>
        <div className="font-mono text-xs leading-relaxed break-all text-bamba-quiet">
          exports/curated_poems/&lt;poet&gt;--&lt;poem&gt;/guided_plan.json
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2.5">
        {!approved ? (
          <ActionButton variant="primary" size="pinned" disabled={!canApprove || readOnly} onClick={onApprove}>
            Approve
          </ActionButton>
        ) : null}
        <ActionButton variant="primary" size="pinned" disabled={!ready || readOnly || published} onClick={onPublish}>
          {published ? "Published" : "Publish"}
        </ActionButton>
      </div>

      <p className="mt-3 text-center text-[13px] leading-relaxed text-bamba-hint">
        The file lands on the Studio machine. Commit and push from the MacBook to reach the app.
      </p>
    </Sheet>
  )
}
