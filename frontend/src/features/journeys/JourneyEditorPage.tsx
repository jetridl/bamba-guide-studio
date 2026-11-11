import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core"
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ArrowLeft, BookUp, CheckCircle2, CircleCheck, Download, Eye, GripVertical, Save, Trash2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { GuideStatusPill } from "@/features/guides/GuideListPage"
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
        "Commit and push exports/journeys, then move the Studio pin in the Bamba app.",
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
      <main className="min-h-screen bg-bamba-ivory p-8 text-bamba-muted">
        {error ? <p className="whitespace-pre-wrap text-bamba-ink">{error}</p> : "Loading Journey..."}
      </main>
    )
  }

  const saved = Boolean(journey.id)
  const lockedByExport = journey.status === "exported"

  return (
    <main className="flex min-h-screen min-w-[1100px] flex-col bg-bamba-ivory text-bamba-ink">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-bamba-border bg-bamba-paper px-5">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link to="/journeys" title="Journeys">
              <ArrowLeft />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold">{journey.title || "A new Journey"}</h1>
              {saved ? <GuideStatusPill status={journey.status} /> : null}
              <Badge variant="outline" className="bg-bamba-paper">
                v{journey.version}
              </Badge>
            </div>
            <p className="text-xs text-bamba-muted">
              {saved ? `${journey.externalId} · ${journey.poems.length} poems` : "Not saved yet"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-xs text-bamba-muted">
            <Save className="size-3" />
            {busy ? "Working" : dirty ? "Unsaved changes" : saved ? "Saved" : "Draft"}
          </span>
          <Button disabled={busy || (!dirty && saved)} onClick={() => void save()}>
            <Save />
            Save
          </Button>
          {saved ? (
            <>
              <Button variant="outline" disabled={busy || dirty || lockedByExport} onClick={() => void changeStatus("markInReview")}>
                <Eye />
                Mark in review
              </Button>
              <Button variant="outline" disabled={busy || dirty || lockedByExport} onClick={() => void changeStatus("approve")}>
                <CheckCircle2 />
                Approve
              </Button>
              <Button
                variant="outline"
                disabled={busy || dirty || !["approved", "exported"].includes(journey.status)}
                onClick={() => void exportJourney()}
                title="Download the Journey JSON without publishing it"
              >
                <Download />
                Download
              </Button>
              <Button
                disabled={busy || dirty || !["approved", "exported"].includes(journey.status)}
                onClick={() => void publishJourney()}
                title="Write the Journey and its cover to exports/journeys for the Bamba app"
              >
                <BookUp />
                Publish
              </Button>
            </>
          ) : null}
        </div>
      </header>

      <div className="grid flex-1 grid-cols-[minmax(560px,1fr)_380px]">
        <ScrollArea className="h-[calc(100vh-4rem)]">
          <div className="mx-auto flex max-w-3xl flex-col gap-5 p-6">
            {error ? (
              <div role="alert" className="whitespace-pre-wrap rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
                {error}
              </div>
            ) : null}
            {notice ? (
              <div className="whitespace-pre-wrap rounded-md border border-bamba-border bg-white/60 p-3 text-sm">{notice}</div>
            ) : null}
            {lockedByExport ? (
              <div className="rounded-md border border-bamba-border bg-bamba-paper p-3 text-sm text-bamba-muted">
                This Journey has been exported. Raise the version before you save changes, so the app refreshes it.
              </div>
            ) : null}

            <Card className="border-bamba-border bg-white/70">
              <CardHeader>
                <CardTitle>Journey</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <Field label="Stable ID" hint={saved ? "Fixed after the first save." : "Letters, numbers, - and _. The app uses this ID."}>
                  <Input
                    disabled={saved}
                    placeholder="For example: romantic-poets"
                    value={journey.externalId}
                    onChange={(event) => edit("externalId", event.target.value)}
                  />
                </Field>
                <Field label="Version" hint="Raise it when you change an exported Journey.">
                  <Input
                    min={1}
                    type="number"
                    value={journey.version}
                    onChange={(event) => edit("version", Math.max(1, Number(event.target.value) || 1))}
                  />
                </Field>
                <Field label="Title">
                  <Input value={journey.title} onChange={(event) => edit("title", event.target.value)} />
                </Field>
                <Field label="Subtitle">
                  <Input value={journey.subtitle} onChange={(event) => edit("subtitle", event.target.value)} />
                </Field>
                <Field label="Curator">
                  <Input value={journey.curator} onChange={(event) => edit("curator", event.target.value)} />
                </Field>
              </CardContent>
            </Card>

            <Card className="border-bamba-border bg-white/70">
              <CardHeader>
                <CardTitle>Cover image</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <p className="text-sm text-bamba-muted">
                  Required to publish. Put the image file at{" "}
                  <span className="font-mono">
                    guides/journeys/{journey.externalId || "<id>"}/{journey.coverImage?.path || "<file name>"}
                  </span>
                  . Publish copies it beside the Journey's <span className="font-mono">journey.json</span>.
                </p>
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-4">
                  <Field label="Image file" hint="File name only: .png, .jpg, .jpeg or .webp.">
                    <Input
                      placeholder="For example: cover.jpg"
                      value={journey.coverImage?.path ?? ""}
                      onChange={(event) => editCover("path", event.target.value)}
                    />
                  </Field>
                  <Field label="Image description" hint="Alt text. Say what the image shows, for readers who cannot see it.">
                    <Input
                      placeholder="For example: A lantern on a snowy path at dusk"
                      value={journey.coverImage?.alt ?? ""}
                      onChange={(event) => editCover("alt", event.target.value)}
                    />
                  </Field>
                </div>
              </CardContent>
            </Card>

            <Card className="border-bamba-border bg-white/70">
              <CardHeader>
                <CardTitle>Words around the poems</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <p className="text-sm text-bamba-muted">Write plain paragraphs. Leave a blank line between paragraphs.</p>
                <Field label="Journey Introduction">
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
              </CardContent>
            </Card>

            <Card className="border-bamba-border bg-white/70">
              <CardHeader>
                <CardTitle>Poems in order</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <SortablePoems
                  poems={journey.poems}
                  revision={revision}
                  onReorder={(poems) => edit("poems", poems)}
                  onRemove={(poemId) => edit("poems", journey.poems.filter((poem) => poem.poemId !== poemId))}
                  onNote={editNote}
                />
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium uppercase tracking-[0.14em] text-bamba-muted">Add a poem</span>
                  <Select
                    value=""
                    onValueChange={(poemId) => {
                      const candidate = candidates.find((item) => item.poemId === poemId)
                      if (candidate) edit("poems", [...journey.poems, { ...candidate, note: [] }])
                    }}
                  >
                    <SelectTrigger className="w-full bg-bamba-paper" aria-label="Add a poem">
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
                  <span className="text-xs text-bamba-muted">Only poems with an approved or exported guide appear here.</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </ScrollArea>

        <aside className="border-l border-bamba-border bg-bamba-paper/70 p-4">
          <h2 className="mb-3 text-sm font-semibold">Validation</h2>
          {!saved ? (
            <p className="rounded-md border border-bamba-border bg-white/50 p-3 text-sm text-bamba-muted">
              Save the Journey to check it.
            </p>
          ) : dirty ? (
            <p className="rounded-md border border-bamba-border bg-white/50 p-3 text-sm text-bamba-muted">
              Save your changes to check them again.
            </p>
          ) : validation?.valid ? (
            <p className="flex items-center gap-2 rounded-md border border-bamba-border bg-white/60 p-3 text-sm">
              <CircleCheck className="size-4 text-bamba-amber" />
              Ready for approval.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {validation?.issues.map((issue, index) => (
                <div key={`${issue.code}-${index}`} className="rounded-md border border-bamba-border bg-white/70 p-3 text-sm">
                  {issue.message}
                </div>
              ))}
            </div>
          )}
          <p className="mt-6 text-xs leading-5 text-bamba-muted">
            Publish writes{" "}
            <span className="font-mono">exports/journeys/{journey.externalId || "<id>"}/journey.json</span>
            {journey.coverImage?.path ? (
              <>
                {" "}and copies <span className="font-mono">{journey.coverImage.path}</span> beside it
              </>
            ) : null}
            . Every poem's guide must be published first. The Bamba app picks the Journey up when you move its Studio
            pin.
          </p>
        </aside>
      </div>
    </main>
  )
}

function SortablePoems({
  poems,
  revision,
  onReorder,
  onRemove,
  onNote,
}: {
  poems: JourneyPoem[]
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
    return <p className="rounded-md border border-dashed border-bamba-border p-4 text-sm text-bamba-muted">No poems yet.</p>
  }

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={poems.map((poem) => poem.poemId)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-3">
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
    <section ref={sortable.setNodeRef} style={style} className="rounded-lg border border-bamba-border bg-bamba-paper/60 p-3">
      <div className="mb-2 flex items-center gap-2">
        <button className="cursor-grab text-bamba-muted" title="Drag to reorder" type="button" {...sortable.attributes} {...sortable.listeners}>
          <GripVertical className="size-4" />
        </button>
        <span className="flex size-6 items-center justify-center rounded-full bg-bamba-amber/15 text-xs font-medium text-bamba-ink">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{poem.title ?? poem.poemId}</h3>
          <p className="truncate text-xs text-bamba-muted">
            {poem.author} · <span className="font-mono">{poem.poemId}</span>
          </p>
        </div>
        <Button size="xs" variant="ghost" disabled={index === 0} onClick={() => onMove(-1)} title="Move up">
          Up
        </Button>
        <Button size="xs" variant="ghost" disabled={index === count - 1} onClick={() => onMove(1)} title="Move down">
          Down
        </Button>
        <Button size="icon-xs" variant="ghost" onClick={onRemove} title="Remove from Journey">
          <Trash2 />
        </Button>
      </div>
      <Field label="Journey Note" hint="Why this poem is here, and how it fits the path.">
        <ParagraphTextarea key={`note-${poem.poemId}-${revision}`} rows={3} value={poem.note} onChange={onNote} />
      </Field>
    </section>
  )
}

/** Keeps the raw text locally, so blank lines survive while the curator types. */
function ParagraphTextarea({ value, rows, onChange }: { value: string[]; rows: number; onChange: (value: string[]) => void }) {
  const [text, setText] = useState(() => value.join("\n\n"))
  return (
    <Textarea
      className="bg-white/80 leading-6"
      rows={rows}
      value={text}
      onChange={(event) => {
        setText(event.target.value)
        onChange(toParagraphs(event.target.value))
      }}
    />
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs font-medium uppercase tracking-[0.14em] text-bamba-muted">{label}</span>
      {children}
      {hint ? <span className="text-xs text-bamba-muted">{hint}</span> : null}
    </label>
  )
}
