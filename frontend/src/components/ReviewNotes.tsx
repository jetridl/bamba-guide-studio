import { useState } from "react"

import { ActionButton } from "@/components/bamba/Button"
import { Field, inputClass, textareaClass } from "@/components/bamba/Field"
import { SeverityPill } from "@/components/bamba/pills"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { NewReviewNote, ReviewComment } from "@/lib/types"
import { cn } from "@/lib/utils"

const BORDER: Record<ReviewComment["severity"], string> = {
  blocking: "border-bamba-block-border",
  warning: "border-bamba-warn-border",
  suggestion: "border-bamba-note-border",
  note: "border-bamba-note-border",
}

const SEVERITIES: { value: ReviewComment["severity"]; label: string }[] = [
  { value: "note", label: "Note" },
  { value: "suggestion", label: "Suggestion" },
  { value: "warning", label: "Warning" },
  { value: "blocking", label: "Blocking: stops publishing" },
]

const CATEGORIES: { value: string; label: string }[] = [
  { value: "copy", label: "Copy" },
  { value: "clarity", label: "Clarity" },
  { value: "tone", label: "Tone" },
  { value: "pacing", label: "Pacing" },
  { value: "difficulty", label: "Difficulty" },
  { value: "memorisation", label: "Memorisation" },
  { value: "literary_accuracy", label: "Literary accuracy" },
  { value: "chunking", label: "Chunking" },
  { value: "ux", label: "Layout and formatting" },
  { value: "schema", label: "Structure" },
]

const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((item) => [item.value, item.label]))

/** What a note can be about: the whole guide or Journey, a page, a poem. */
export type NoteTarget = { key: string; label: string; targetType: string; targetId?: string | null }

const NAME_KEY = "bamba.reviewerName"

function rememberedName(): string {
  try {
    return window.localStorage.getItem(NAME_KEY) ?? ""
  } catch {
    return ""
  }
}

function rememberName(name: string) {
  try {
    window.localStorage.setItem(NAME_KEY, name)
  } catch {
    // Private windows may refuse storage; the name is only a convenience.
  }
}

function formatDate(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(undefined, { day: "numeric", month: "short" })
}

/**
 * Review notes as calm cards, for guides and Journeys alike. A note stays open
 * until someone accepts, resolves or dismisses it, and approval waits for every
 * note to close. Accept is the only thing that rewrites the text, and only a
 * note with a suggested revision offers it.
 */
export function ReviewNotes({
  comments,
  readOnly,
  onAccept,
  onStatus,
  targets,
  onAdd,
  targetLabel,
  emptyText = "No notes here.",
  className,
}: {
  comments: ReviewComment[]
  readOnly: boolean
  onAccept?: (commentId: string) => void
  onStatus: (commentId: string, status: ReviewComment["status"]) => void
  // Offer "Add a note" when given: the first target is the default.
  targets?: NoteTarget[]
  onAdd?: (note: NewReviewNote) => Promise<boolean> | void
  targetLabel?: (comment: ReviewComment) => string | undefined
  emptyText?: string
  className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {comments.length === 0 ? (
        <p className="rounded-xl border border-bamba-border bg-bamba-surface p-5 text-sm text-bamba-muted">{emptyText}</p>
      ) : null}
      {comments.map((comment) => {
        const about = targetLabel?.(comment)
        const date = formatDate(comment.createdAt)
        return (
          <section key={comment.id} className={cn("rounded-xl border bg-bamba-surface p-4", BORDER[comment.severity])}>
            <div className="mb-2 flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <SeverityPill severity={comment.severity} />
              <span className="text-xs text-bamba-hint">{CATEGORY_LABEL[comment.category] ?? comment.category}</span>
              {about ? <span className="text-xs text-bamba-hint">· {about}</span> : null}
              {comment.status !== "open" ? (
                <span className="ml-auto text-xs text-bamba-hint capitalize">{comment.status}</span>
              ) : null}
            </div>
            <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{comment.comment}</p>
            {comment.suggestedRevision ? (
              <blockquote className="mt-3 rounded-lg bg-bamba-quiet-surface p-3 text-sm leading-relaxed text-bamba-quiet">
                {comment.suggestedRevision}
              </blockquote>
            ) : null}
            {comment.reviewer || date ? (
              <p className="mt-2 text-xs text-bamba-hint">{[comment.reviewer, date].filter(Boolean).join(" · ")}</p>
            ) : null}
            {!readOnly ? (
              comment.status === "open" ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {comment.suggestedRevision && onAccept ? (
                    <ActionButton
                      variant="primary"
                      size="compact"
                      className="flex-1 md:flex-none"
                      onClick={() => onAccept(comment.id)}
                    >
                      Accept
                    </ActionButton>
                  ) : null}
                  <ActionButton
                    size="compact"
                    className="flex-1 md:flex-none"
                    onClick={() => onStatus(comment.id, "resolved")}
                  >
                    Resolve
                  </ActionButton>
                  <ActionButton variant="ghost" size="compact" onClick={() => onStatus(comment.id, "dismissed")}>
                    Dismiss
                  </ActionButton>
                </div>
              ) : (
                <div className="mt-2">
                  <ActionButton variant="ghost" size="compact" onClick={() => onStatus(comment.id, "open")}>
                    Reopen
                  </ActionButton>
                </div>
              )
            ) : null}
          </section>
        )
      })}
      {!readOnly && targets?.length && onAdd ? <NoteComposer targets={targets} onAdd={onAdd} /> : null}
    </div>
  )
}

function NoteComposer({
  targets,
  onAdd,
}: {
  targets: NoteTarget[]
  onAdd: (note: NewReviewNote) => Promise<boolean> | void
}) {
  const [open, setOpen] = useState(false)
  const [targetKey, setTargetKey] = useState(targets[0].key)
  const [severity, setSeverity] = useState<ReviewComment["severity"]>("note")
  const [category, setCategory] = useState("copy")
  const [text, setText] = useState("")
  const [name, setName] = useState(rememberedName)
  const [sending, setSending] = useState(false)
  // The page or poem in view can change while the form is open.
  const target = targets.find((item) => item.key === targetKey) ?? targets[0]

  if (!open) {
    return (
      <ActionButton size="compact" className="self-start" onClick={() => setOpen(true)}>
        Add a note
      </ActionButton>
    )
  }

  const submit = async () => {
    if (!text.trim()) return
    setSending(true)
    rememberName(name.trim())
    const result = await onAdd({
      targetType: target.targetType,
      targetId: target.targetId ?? null,
      severity,
      category,
      comment: text.trim(),
      reviewer: name.trim() || undefined,
    })
    setSending(false)
    if (result !== false) {
      setText("")
      setSeverity("note")
      setOpen(false)
    }
  }

  const trigger = "h-12 w-full rounded-field border-bamba-chip-border bg-bamba-surface px-4 text-base"
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-bamba-border bg-bamba-surface p-4">
      <h3 className="font-heading text-lg font-semibold">Add a note</h3>
      {targets.length > 1 ? (
        <Field label="About">
          <Select value={target.key} onValueChange={setTargetKey}>
            <SelectTrigger className={trigger}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {targets.map((item) => (
                <SelectItem key={item.key} value={item.key}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kind">
          <Select value={severity} onValueChange={(value) => setSeverity(value as ReviewComment["severity"])}>
            <SelectTrigger className={trigger}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEVERITIES.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Topic">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className={trigger}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Note" hint="Any open note keeps the work from being approved until someone closes it.">
        <textarea
          className={cn(textareaClass, "min-h-28")}
          value={text}
          placeholder="What should change, and why?"
          onChange={(event) => setText(event.target.value)}
        />
      </Field>
      <Field label="Your name" hint="Shown on the note. This browser remembers it.">
        <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <ActionButton variant="primary" size="compact" disabled={sending || !text.trim()} onClick={() => void submit()}>
          Add note
        </ActionButton>
        <ActionButton variant="ghost" size="compact" disabled={sending} onClick={() => setOpen(false)}>
          Cancel
        </ActionButton>
      </div>
    </section>
  )
}
