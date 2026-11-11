import { Field, FieldBlock, inputClass, textareaClass } from "@/components/bamba/Field"
import { Pill } from "@/components/bamba/pills"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  APP_UNSUPPORTED_PAGE_TYPES,
  GAME_PAGE_TYPES,
  PAGE_TYPES,
  getChunksByExternalIds,
} from "@/features/editor/guideHelpers"
import type { GuideDetail, GuidePage, GuideSession, PageType } from "@/lib/types"
import { cn } from "@/lib/utils"

export function PageForm({
  guide,
  session,
  page,
  readOnly,
  phone,
  onUpdate,
  className,
}: {
  guide: GuideDetail
  session: GuideSession
  page: GuidePage
  readOnly: boolean
  /** On a phone the structure is fixed: type and chunk links stay on the laptop. */
  phone: boolean
  onUpdate: (pageId: string, payload: Record<string, unknown>) => void
  className?: string
}) {
  const isGamePage = GAME_PAGE_TYPES.has(page.type)
  const isReflectionPage = page.type === "reflection"
  const showBodyMarkdown = !isGamePage && !isReflectionPage
  const gameChunkOptions = getChunksByExternalIds(guide, session.chunkIds)
  const selectedGameChunkIds = page.chunkIds.length > 0 ? page.chunkIds : session.chunkIds

  return (
    <div className={cn("flex flex-col gap-5", className)}>
      {phone ? (
        <FieldBlock label="Type" hint="Change the type on the laptop.">
          <div className="flex items-center gap-2">
            <Pill tone="warn" className="font-mono text-xs">
              {page.type}
            </Pill>
            {APP_UNSUPPORTED_PAGE_TYPES.has(page.type) ? (
              <span className="text-[13px] text-bamba-hint">Not in the app yet</span>
            ) : null}
          </div>
        </FieldBlock>
      ) : (
        <Field
          label="Type"
          hint={APP_UNSUPPORTED_PAGE_TYPES.has(page.type) ? "The app cannot render this type yet, so it blocks export." : undefined}
        >
          <Select
            disabled={readOnly}
            value={page.type}
            onValueChange={(value) => {
              const nextType = value as PageType
              onUpdate(page.id, {
                type: nextType,
                bodyMarkdown: nextType === "reflection" || GAME_PAGE_TYPES.has(nextType) ? null : page.bodyMarkdown,
                prompt: nextType === "reflection" ? page.prompt : null,
              })
            }}
          >
            <SelectTrigger className="h-12 w-full rounded-field border-bamba-chip-border bg-bamba-surface px-4 text-base">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                  {APP_UNSUPPORTED_PAGE_TYPES.has(type) ? (
                    <span className="text-bamba-muted"> · not in the app yet</span>
                  ) : null}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}

      <Field label="Title">
        <input
          className={inputClass}
          disabled={readOnly}
          value={page.title ?? ""}
          onChange={(event) => onUpdate(page.id, { title: event.target.value })}
        />
      </Field>

      {showBodyMarkdown ? (
        <Field label="Body">
          <textarea
            className={cn(textareaClass, "min-h-60 md:min-h-72")}
            disabled={readOnly}
            value={page.bodyMarkdown ?? ""}
            onChange={(event) => onUpdate(page.id, { bodyMarkdown: event.target.value })}
          />
        </Field>
      ) : null}

      {isReflectionPage ? (
        <Field label="Prompt">
          <textarea
            className={cn(textareaClass, "min-h-32")}
            disabled={readOnly}
            value={page.prompt ?? ""}
            onChange={(event) => onUpdate(page.id, { prompt: event.target.value })}
          />
        </Field>
      ) : null}

      {isGamePage ? (
        phone ? (
          <FieldBlock label="Game chunks" hint="Link chunks on the laptop.">
            <div className="flex flex-wrap gap-2">
              {getChunksByExternalIds(guide, selectedGameChunkIds).map((chunk) => (
                <Pill key={chunk.id} tone="neutral" className="font-mono text-xs">
                  {chunk.externalId}
                </Pill>
              ))}
              {selectedGameChunkIds.length === 0 ? <span className="text-[13px] text-bamba-hint">None linked.</span> : null}
            </div>
          </FieldBlock>
        ) : (
          <Field label="Game chunks">
            <ChunkSelector
              chunks={gameChunkOptions}
              selected={selectedGameChunkIds}
              disabled={readOnly}
              onChange={(chunkIds) => onUpdate(page.id, { chunkIds })}
            />
          </Field>
        )
      ) : null}
    </div>
  )
}

export function ChunkSelector({
  chunks,
  selected,
  disabled,
  onChange,
}: {
  chunks: GuideDetail["poem"]["chunks"]
  selected: string[]
  disabled: boolean
  onChange: (chunkIds: string[]) => void
}) {
  return (
    <div className="grid max-h-52 gap-1 overflow-auto rounded-field border border-bamba-chip-border bg-bamba-surface p-2">
      {chunks.length === 0 ? <p className="px-2 py-1 text-[13px] text-bamba-hint">No chunks available.</p> : null}
      {chunks.map((chunk) => {
        const checked = selected.includes(chunk.externalId)
        return (
          <label
            key={chunk.id}
            className="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-md px-2 py-2 text-[13px] hover:bg-bamba-chip-fill"
          >
            <input
              checked={checked}
              className="mt-1 accent-bamba-accent"
              disabled={disabled}
              type="checkbox"
              onChange={(event) =>
                onChange(
                  event.target.checked ? [...selected, chunk.externalId] : selected.filter((id) => id !== chunk.externalId),
                )
              }
            />
            <span>
              <span className="block font-mono text-xs font-medium">{chunk.externalId}</span>
              <span className="text-bamba-muted">{chunk.text}</span>
            </span>
          </label>
        )
      })}
    </div>
  )
}
