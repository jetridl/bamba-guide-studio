import { Field, inputClass, textareaClass } from "@/components/bamba/Field"
import { ChunkSelector } from "@/features/editor/components/PageForm"
import { getChunksByExternalIds } from "@/features/editor/guideHelpers"
import type { GuideDetail, GuideSession } from "@/lib/types"
import { cn } from "@/lib/utils"

/** The session's own words, and the chunks it asks for that day. Laptop work. */
export function DailyChunksForm({
  guide,
  session,
  readOnly,
  onUpdateSession,
  className,
}: {
  guide: GuideDetail
  session: GuideSession
  readOnly: boolean
  onUpdateSession: (sessionId: string, payload: Record<string, unknown>) => void
  className?: string
}) {
  const selectedChunks = getChunksByExternalIds(guide, session.chunkIds)
  return (
    <div className={cn("flex flex-col gap-5", className)}>
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Title">
          <input
            className={inputClass}
            disabled={readOnly}
            value={session.title}
            onChange={(event) => onUpdateSession(session.id, { title: event.target.value })}
          />
        </Field>
        <Field label="Subtitle">
          <input
            className={inputClass}
            disabled={readOnly}
            value={session.subtitle ?? ""}
            onChange={(event) => onUpdateSession(session.id, { subtitle: event.target.value })}
          />
        </Field>
      </div>
      <Field label="Focus summary">
        <textarea
          className={cn(textareaClass, "min-h-28")}
          disabled={readOnly}
          value={session.focusSummary ?? ""}
          onChange={(event) => onUpdateSession(session.id, { focusSummary: event.target.value })}
        />
      </Field>
      <Field label="Chunks for this session">
        <ChunkSelector
          chunks={guide.poem.chunks}
          selected={session.chunkIds}
          disabled={readOnly}
          onChange={(chunkIds) => onUpdateSession(session.id, { chunkIds })}
        />
      </Field>
      {selectedChunks.length > 0 ? (
        <div className="flex flex-col gap-2">
          {selectedChunks.map((chunk) => (
            <div key={chunk.id} className="rounded-xl border border-bamba-border bg-bamba-quiet-surface p-3">
              <div className="mb-1 font-mono text-xs text-bamba-muted">{chunk.externalId}</div>
              <p className="font-poetry text-lg leading-relaxed whitespace-pre-wrap">{chunk.text}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
