import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core"
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ArrowLeft, Check, ChevronLeft, Circle, Download, Eye, GripVertical, MoreHorizontal, Save, SunMoon, Trash2 } from "lucide-react"

import { ActionList } from "@/components/bamba/ActionList"
import { Banner } from "@/components/bamba/Banner"
import { ActionButton, IconButton } from "@/components/bamba/Button"
import { Field, inputClass, textareaClass } from "@/components/bamba/Field"
import { Sheet } from "@/components/bamba/Sheet"
import { ListSurface, Panel, SectionHeading } from "@/components/bamba/Surface"
import { GuideStatusPill, Pill } from "@/components/bamba/pills"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { THEME_LABELS, useTheme } from "@/lib/theme"
import { useIsPhone } from "@/lib/useMediaQuery"
import { cn } from "@/lib/utils"
import {
  journeyApi,
  type Journey,
  type JourneyCandidate,
  type JourneyCoverImage,
  type JourneyPoem,
  type JourneyValidation,
} from "@/lib/journeyApi"

const BLANK: Journey = {
  externalId: "",
  title: "",
  subtitle: "",
  curator: "",
  version: 1,
  status: "draft",
  introduction: [],
  closing: [],
  coverImage: null,
  poems: [],
}

/** Paragraphs are separated by one or more blank lines. */
function toParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
}

export function JourneyEditorPage() {
  const { journeyId = "new" } = useParams()
  const navigate = useNavigate()
  const phone = useIsPhone()
  const isNew = journeyId === "new"
  const [journey, setJourney] = useState<Journey>(BLANK)
  const [loaded, setLoaded] = useState(isNew)
  // Bumped whenever server data replaces local edits, so paragraph boxes reset their text.
  const [revision, setRevision] = useState(0)
  const [candidates, setCandidates] = useState<JourneyCandidate[]>([])
  const [validation, setValidation] = useState<JourneyValidation | null>(null)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const { choice, cycle } = useTheme()

  const refreshValidation = useCallback(async (id: string) => {
    setValidation(await journeyApi.validate(id))
  }, [])

  const replaceFromServer = useCallback(
    (next: Journey) => {
      setJourney(next)
      setDirty(false)
      setRevision((value) => value + 1)
      if (next.id) void refreshValidation(next.id)
    },
    [refreshValidation],
  )

  useEffect(() => {
    journeyApi.candidates().then(setCandidates).catch(() => setCandidates([]))
    if (isNew) {
      setJourney(BLANK)
      setValidation(null)
      setLoaded(true)
      return
    }
    journeyApi
      .get(journeyId)
      .then((data) => {
        replaceFromServer(data)
        setLoaded(true)
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not load Journey."))
  }, [isNew, journeyId, replaceFromServer])

  function edit<K extends keyof Journey>(field: K, value: Journey[K]) {
    setJourney((current) => ({ ...current, [field]: value }))
    setDirty(true)
    setNotice(null)
  }

  function editCover(field: keyof JourneyCoverImage, value: string) {
    const next = { path: "", alt: "", ...journey.coverImage, [field]: value }
    edit("coverImage", next.path.trim() || next.alt.trim() ? next : null)
  }

  function editNote(poemId: string, note: string[]) {
    edit(
      "poems",
      journey.poems.map((poem) => (poem.poemId === poemId ? { ...poem, note } : poem)),
    )
  }

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await action()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.")
    } finally {
      setBusy(false)
    }
  }

  const save = () =>
    run(async () => {
      const saved = await journeyApi.save(journey)
      replaceFromServer(saved)
      setNotice("Saved.")
      if (isNew && saved.id) navigate(`/journeys/${saved.id}`, { replace: true })
    })

  const changeStatus = (action: "markInReview" | "approve") =>
    run(async () => {
      if (!journey.id) return
      replaceFromServer(await journeyApi[action](journey.id))
    })

  const exportJourney = () =>
    run(async () => {
      if (!journey.id) return
      const blob = await journeyApi.export(journey.id)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `${journey.externalId}_journey.json`
      anchor.click()
      URL.revokeObjectURL(url)
      replaceFromServer(await journeyApi.get(journey.id))
      setNotice("Downloaded. To send the Journey to the app, use Publish instead.")
    })

  const publishJourney = () =>
    run(async () => {
      if (!journey.id) return
      const result = await journeyApi.publish(journey.id)
      replaceFromServer(await journeyApi.get(journey.id))
      const lines = [
        `Published to ${result.path}${result.link ? ` and linked from ${result.link}` : ""}.`,
        "Commit and push exports/journeys on the MacBook, then move the Studio pin in the Bamba app.",
        ...result.warnings,
      ]
      setNotice(lines.join("\n"))
    })

  const available = useMemo(
    () => candidates.filter((candidate) => !journey.poems.some((poem) => poem.poemId === candidate.poemId)),
    [candidates, journey.poems],
  )

  if (!loaded) {
    return (
      <main className="min-h-dvh bg-bamba-bg p-6 text-sm text-bamba-muted">
        {error ? (
          <Banner tone="warn" role="alert">
            {error}
          </Banner>
        ) : (
          "Loading Journey..."
        )}
      </main>
    )
  }

  const saved = Boolean(journey.id)
  const lockedByExport = journey.status === "exported"
  const publishable = saved && !dirty && ["approved", "exported"].includes(journey.status)
  const saveState = busy ? "Working" : dirty ? "Unsaved changes" : saved ? "Saved" : "Draft"

  return (
    <div className="min-h-dvh bg-linear-to-b from-bamba-bg-top to-bamba-bg pb-32 text-bamba-ink md:pb-10">
      <header className="flex items-center gap-2 px-3 pt-3 pb-1 md:border-b md:border-bamba-border md:bg-bamba-surface md:px-5 md:py-2.5">
        <Link
          to="/journeys"
          className="inline-flex h-11 items-center gap-1.5 px-2 text-base text-bamba-quiet no-underline md:hidden"
        >
          <ChevronLeft className="size-5" />
          Journeys
        </Link>
        <IconButton asChild aria-label="Back to Journeys" className="hidden md:inline-flex">
          <Link to="/journeys">
            <ArrowLeft />
          </Link>
        </IconButton>
        <div className="hidden min-w-0 flex-1 md:block">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-heading text-2xl leading-tight font-semibold">{journey.title || "A new Journey"}</h1>
            {saved ? <GuideStatusPill status={journey.status} /> : null}
            <Pill tone="neutral" className="font-normal">
              v{journey.version}
            </Pill>
          </div>
          <p className="mt-0.5 text-[13px] text-bamba-muted">
            {saved ? `${journey.externalId} · ${journey.poems.length} poems · ${saveState}` : `Not saved yet · ${saveState}`}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ActionButton
            size="compact"
            variant={dirty ? "primary" : "quiet"}
            className="hidden md:inline-flex"
            disabled={busy || (!dirty && saved)}
            onClick={() => void save()}
          >
            <Save />
            Save
          </ActionButton>
          {saved ? (
            <ActionButton
              size="compact"
              variant="primary"
              className="hidden md:inline-flex"
              disabled={busy || !publishable}
              onClick={() => void publishJourney()}
            >
              Publish
            </ActionButton>
          ) : null}
          <IconButton aria-label="More actions" onClick={() => setMenuOpen(true)}>
            <MoreHorizontal />
          </IconButton>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl px-5 pt-2 md:pt-6">
        <div className="md:hidden">
          <h1 className="font-heading text-[32px] leading-tight font-semibold">{journey.title || "A new Journey"}</h1>
          <p className="mt-1 text-[15px] text-bamba-muted">{journey.subtitle || "No subtitle yet"}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {saved ? <GuideStatusPill status={journey.status} /> : null}
            <Pill tone="neutral" className="font-normal">
              v{journey.version}
            </Pill>
            <span className="text-[13px] text-bamba-muted">{saveState}</span>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-4">
          {error ? (
            <Banner tone="warn" role="alert">
              {error}
            </Banner>
          ) : null}
          {notice ? <Banner onDismiss={() => setNotice(null)}>{notice}</Banner> : null}
          {lockedByExport ? (
            <Banner>
              This Journey is exported. Raise the version before you save changes, so the app refreshes it.
            </Banner>
          ) : null}

          {isNew && phone ? (
            <Banner>A new Journey needs a stable ID, so start it on the laptop. You can write its words here later.</Banner>
          ) : (
            <JourneyChecks saved={saved} dirty={dirty} validation={validation} />
          )}
        </div>

        <div className="mt-6 flex flex-col gap-6">
          <Panel>
            <SectionHeading title="Journey" />
            <div className="grid gap-5 md:grid-cols-2">
              {!phone ? (
                <>
                  <Field
                    label="Stable ID"
                    hint={saved ? "Fixed after the first save." : "Letters, numbers, - and _. The app uses this ID."}
                  >
                    <input
                      className={inputClass}
                      disabled={saved}
                      placeholder="For example: romantic-poets"
                      value={journey.externalId}
                      onChange={(event) => edit("externalId", event.target.value)}
                    />
                  </Field>
                  <Field label="Version" hint="Raise it when you change an exported Journey.">
                    <input
                      className={inputClass}
                      min={1}
                      type="number"
                      value={journey.version}
                      onChange={(event) => edit("version", Math.max(1, Number(event.target.value) || 1))}
                    />
                  </Field>
                </>
              ) : null}
              <Field label="Title">
                <input className={inputClass} value={journey.title} onChange={(event) => edit("title", event.target.value)} />
              </Field>
              <Field label="Subtitle">
                <input
                  className={inputClass}
                  value={journey.subtitle}
                  onChange={(event) => edit("subtitle", event.target.value)}
                />
              </Field>
              <Field label="Curator">
                <input
                  className={inputClass}
                  value={journey.curator}
                  onChange={(event) => edit("curator", event.target.value)}
                />
              </Field>
            </div>
            {phone ? (
              <p className="mt-4 text-[13px] text-bamba-hint">
                The stable ID is <span className="font-mono">{journey.externalId || "not set"}</span>. Change the ID and
                the version on the laptop.
              </p>
            ) : null}
          </Panel>

          <Panel>
            <SectionHeading title="Cover image" />
            <p className="mb-4 text-sm leading-relaxed text-bamba-muted">
              Required to publish. Put the image file at{" "}
              <span className="font-mono text-xs break-all">
                guides/journeys/{journey.externalId || "<id>"}/{journey.coverImage?.path || "<file name>"}
              </span>
              . Publish copies it beside the Journey's <span className="font-mono text-xs">journey.json</span>.
            </p>
            <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              <Field label="Image file" hint="File name only: .png, .jpg, .jpeg or .webp.">
                <input
                  className={inputClass}
                  placeholder="For example: cover.jpg"
                  value={journey.coverImage?.path ?? ""}
                  onChange={(event) => editCover("path", event.target.value)}
                />
              </Field>
              <Field label="Image description" hint="Alt text. Say what the image shows, for readers who cannot see it.">
                <input
                  className={inputClass}
                  placeholder="For example: A lantern on a snowy path at dusk"
                  value={journey.coverImage?.alt ?? ""}
                  onChange={(event) => editCover("alt", event.target.value)}
                />
              </Field>
            </div>
          </Panel>

          <Panel>
            <SectionHeading title="Words around the poems" />
            <p className="mb-4 text-sm text-bamba-muted">Write plain paragraphs. Leave a blank line between paragraphs.</p>
            <div className="flex flex-col gap-5">
              <Field label="Journey introduction">
                <ParagraphTextarea
                  key={`intro-${revision}`}
                  rows={6}
                  value={journey.introduction}
                  onChange={(value) => edit("introduction", value)}
                />
              </Field>
              <Field label="Closing text" hint="Optional. The app shows it once, when the Journey is complete.">
                <ParagraphTextarea
                  key={`closing-${revision}`}
                  rows={4}
                  value={journey.closing}
                  onChange={(value) => edit("closing", value)}
                />
              </Field>
            </div>
          </Panel>

          <Panel>
            <SectionHeading title="Poems in order" meta={`${journey.poems.length} poems`} />
            <PoemList
              poems={journey.poems}
              phone={phone}
              revision={revision}
              onReorder={(poems) => edit("poems", poems)}
              onRemove={(poemId) => edit("poems", journey.poems.filter((poem) => poem.poemId !== poemId))}
              onNote={editNote}
            />
            {phone ? (
              <p className="mt-4 text-[13px] text-bamba-hint">Add, remove and reorder poems on the laptop.</p>
            ) : (
              <div className="mt-5 flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold tracking-[0.14em] text-bamba-muted uppercase">Add a poem</span>
                <Select
                  value=""
                  onValueChange={(poemId) => {
                    const candidate = candidates.find((item) => item.poemId === poemId)
                    if (candidate) edit("poems", [...journey.poems, { ...candidate, note: [] }])
                  }}
                >
                  <SelectTrigger className="h-12 w-full rounded-field border-bamba-chip-border bg-bamba-surface px-4 text-base" aria-label="Add a poem">
                    <SelectValue placeholder={available.length ? "Choose a poem" : "No more poems with an approved guide"} />
                  </SelectTrigger>
                  <SelectContent>
                    {available.map((candidate) => (
                      <SelectItem key={candidate.poemId} value={candidate.poemId}>
                        {candidate.title} · {candidate.author}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-[13px] text-bamba-hint">
                  Only poems with an approved or exported guide appear here.
                </span>
              </div>
            )}
          </Panel>

          <p className="px-1 pb-4 text-[13px] leading-relaxed text-bamba-hint">
            Publish writes <span className="font-mono break-all">exports/journeys/{journey.externalId || "<id>"}/journey.json</span>
            {journey.coverImage?.path ? (
              <>
                {" "}
                and copies <span className="font-mono">{journey.coverImage.path}</span> beside it
              </>
            ) : null}
            . Every poem's guide must be published first. The Bamba app picks the Journey up when you move its Studio pin.
          </p>
        </div>
      </div>

      {/* The phone keeps one action in reach: save while editing, publish when ready. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-bamba-border bg-bamba-bg/95 px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-sm md:hidden">
        {dirty || !saved ? (
          <ActionButton variant="primary" size="pinned" disabled={busy || (isNew && phone)} onClick={() => void save()}>
            Save
          </ActionButton>
        ) : (
          <ActionButton variant="primary" size="pinned" disabled={busy || !publishable} onClick={() => void publishJourney()}>
            Publish journey
          </ActionButton>
        )}
      </div>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen} title={journey.title || "A new Journey"}>
        <ActionList
          items={[
            {
              key: "save",
              icon: Save,
              title: "Save",
              description: dirty ? "Send your changes to the Studio" : "Nothing to save",
              disabled: busy || (!dirty && saved),
              onSelect: () => {
                setMenuOpen(false)
                void save()
              },
            },
            {
              key: "review",
              icon: Eye,
              title: "Mark in review",
              description: "Say that the Journey is waiting for notes",
              disabled: busy || dirty || lockedByExport || !saved,
              disabledHint: dirty ? "Save your changes first" : undefined,
              onSelect: () => {
                setMenuOpen(false)
                void changeStatus("markInReview")
              },
            },
            {
              key: "approve",
              icon: Check,
              title: "Approve",
              description: "Mark the Journey ready to publish",
              disabled: busy || dirty || lockedByExport || !saved,
              disabledHint: dirty ? "Save your changes first" : undefined,
              onSelect: () => {
                setMenuOpen(false)
                void changeStatus("approve")
              },
            },
            {
              key: "download",
              icon: Download,
              title: "Download JSON",
              description: "The Journey file, without publishing it",
              disabled: busy || dirty || !publishable,
              onSelect: () => {
                setMenuOpen(false)
                void exportJourney()
              },
            },
            {
              key: "theme",
              icon: SunMoon,
              title: "Theme",
              description: "Day, night, or follow the device",
              trailing: THEME_LABELS[choice],
              onSelect: cycle,
            },
          ]}
        />
      </Sheet>
    </div>
  )
}

/** What still stands between this Journey and a publish. */
function JourneyChecks({
  saved,
  dirty,
  validation,
}: {
  saved: boolean
  dirty: boolean
  validation: JourneyValidation | null
}) {
  if (!saved) {
    return <Banner>Save the Journey to check it.</Banner>
  }
  if (dirty) {
    return <Banner>Save your changes to check them again.</Banner>
  }
  if (validation?.valid) {
    return (
      <div className="flex items-center gap-3 rounded-field border border-bamba-warn-border bg-bamba-chip-fill p-3.5">
        <Check className="size-5 shrink-0 text-bamba-glow" />
        <span className="text-[15px] font-semibold text-bamba-glow">Ready for approval</span>
      </div>
    )
  }
  return (
    <ListSurface>
      {(validation?.issues ?? []).map((issue, index) => (
        <div key={`${issue.code}-${index}`} className="flex items-start gap-3 px-4 py-3">
          <Circle className="mt-0.5 size-4 shrink-0 text-bamba-hint" />
          <span className="text-sm leading-relaxed">{issue.message}</span>
        </div>
      ))}
    </ListSurface>
  )
}

function PoemList({
  poems,
  phone,
  revision,
  onReorder,
  onRemove,
  onNote,
}: {
  poems: JourneyPoem[]
  phone: boolean
  revision: number
  onReorder: (poems: JourneyPoem[]) => void
  onRemove: (poemId: string) => void
  onNote: (poemId: string, note: string[]) => void
}) {
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = poems.findIndex((poem) => poem.poemId === active.id)
    const to = poems.findIndex((poem) => poem.poemId === over.id)
    onReorder(arrayMove(poems, from, to))
  }

  if (poems.length === 0) {
    return (
      <p className="rounded-field border border-dashed border-bamba-border p-5 text-sm text-bamba-muted">
        No poems yet.
      </p>
    )
  }

  if (phone) {
    return (
      <div className="flex flex-col gap-4">
        {poems.map((poem, index) => (
          <PoemCard key={poem.poemId} poem={poem} index={index} revision={revision} onNote={onNote} />
        ))}
      </div>
    )
  }

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={poems.map((poem) => poem.poemId)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-4">
          {poems.map((poem, index) => (
            <SortablePoem
              key={poem.poemId}
              poem={poem}
              index={index}
              count={poems.length}
              revision={revision}
              onMove={(delta) => onReorder(arrayMove(poems, index, index + delta))}
              onRemove={() => onRemove(poem.poemId)}
              onNote={(note) => onNote(poem.poemId, note)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

function PoemHeading({ poem, index }: { poem: JourneyPoem; index: number }) {
  return (
    <>
      <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-bamba-warn-border bg-bamba-chip-fill text-[13px] font-semibold text-bamba-warn-ink">
        {index + 1}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-heading text-lg font-semibold">{poem.title ?? poem.poemId}</span>
        <span className="block truncate text-[13px] text-bamba-muted">
          {poem.author} · <span className="font-mono text-xs">{poem.poemId}</span>
        </span>
      </span>
    </>
  )
}

function PoemCard({
  poem,
  index,
  revision,
  onNote,
}: {
  poem: JourneyPoem
  index: number
  revision: number
  onNote: (poemId: string, note: string[]) => void
}) {
  return (
    <section className="rounded-xl border border-bamba-border bg-bamba-quiet-surface p-4">
      <div className="mb-3 flex items-center gap-2.5">
        <PoemHeading poem={poem} index={index} />
      </div>
      <Field label="Journey note" hint="Why this poem is here, and how it fits the path.">
        <ParagraphTextarea
          key={`note-${poem.poemId}-${revision}`}
          rows={3}
          value={poem.note}
          onChange={(note) => onNote(poem.poemId, note)}
        />
      </Field>
    </section>
  )
}

function SortablePoem({
  poem,
  index,
  count,
  revision,
  onMove,
  onRemove,
  onNote,
}: {
  poem: JourneyPoem
  index: number
  count: number
  revision: number
  onMove: (delta: number) => void
  onRemove: () => void
  onNote: (note: string[]) => void
}) {
  const sortable = useSortable({ id: poem.poemId })
  const style = { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }
  return (
    <section
      ref={sortable.setNodeRef}
      style={style}
      className="rounded-xl border border-bamba-border bg-bamba-quiet-surface p-4"
    >
      <div className="mb-3 flex items-center gap-2.5">
        <button
          className="shrink-0 cursor-grab p-1 text-bamba-hint"
          title="Drag to reorder"
          type="button"
          {...sortable.attributes}
          {...sortable.listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <PoemHeading poem={poem} index={index} />
        <div className="flex shrink-0 items-center gap-1">
          <ActionButton variant="ghost" size="compact" disabled={index === 0} onClick={() => onMove(-1)}>
            Up
          </ActionButton>
          <ActionButton variant="ghost" size="compact" disabled={index === count - 1} onClick={() => onMove(1)}>
            Down
          </ActionButton>
          <IconButton tone="plain" className="size-9" onClick={onRemove} aria-label="Remove from Journey">
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      </div>
      <Field label="Journey note" hint="Why this poem is here, and how it fits the path.">
        <ParagraphTextarea key={`note-${poem.poemId}-${revision}`} rows={3} value={poem.note} onChange={onNote} />
      </Field>
    </section>
  )
}

/** Keeps the raw text locally, so blank lines survive while the curator types. */
function ParagraphTextarea({
  value,
  rows,
  onChange,
}: {
  value: string[]
  rows: number
  onChange: (value: string[]) => void
}) {
  const [text, setText] = useState(() => value.join("\n\n"))
  return (
    <textarea
      className={cn(textareaClass, "leading-relaxed")}
      rows={rows}
      value={text}
      onChange={(event) => {
        setText(event.target.value)
        onChange(toParagraphs(event.target.value))
      }}
    />
  )
}
