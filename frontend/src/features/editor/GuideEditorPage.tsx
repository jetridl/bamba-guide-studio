import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { Link, useParams } from "react-router"
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import ReactMarkdown from "react-markdown"
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  Download,
  FileJson,
  GripVertical,
  MessageSquare,
  Plus,
  Save,
  Trash2,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { GuideStatusPill } from "@/features/guides/GuideListPage"
import { api } from "@/lib/api"
import type {
  GuideDetail,
  GuidePage,
  GuideSession,
  PageType,
  ReviewComment,
  RoundType,
  ValidationResult,
} from "@/lib/types"

const PAGE_TYPES: PageType[] = [
  "intro",
  "context",
  "poet_background",
  "poem_background",
  "recap",
  "poem_chunk",
  "commentary",
  "last_word_game",
  "first_last_word_game",
  "hidden_word_game",
  "reflection",
  "completion",
]

const ROUND_TYPES: RoundType[] = ["readThrough", "lastWord", "firstAndLast", "hiddenWord"]

export function GuideEditorPage() {
  const { guideId = "" } = useParams()
  const [guide, setGuide] = useState<GuideDetail | null>(null)
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null)
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [comments, setComments] = useState<ReviewComment[]>([])
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [error, setError] = useState<string | null>(null)
  const [pendingPagePatch, setPendingPagePatch] = useState<{ pageId: string; payload: Record<string, unknown> } | null>(null)
  const [pendingSessionPatch, setPendingSessionPatch] = useState<{ sessionId: string; payload: Record<string, unknown> } | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [guideData, validationData, commentData] = await Promise.all([
        api.getGuide(guideId),
        api.validateGuide(guideId),
        api.listReviewComments(guideId),
      ])
      setGuide(guideData)
      setValidation(validationData)
      setComments(commentData)
      setSelectedPageId((current) => current ?? guideData.sessions[0]?.pages[0]?.id ?? null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load guide.")
    }
  }, [guideId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!pendingPagePatch) return
    const timer = window.setTimeout(async () => {
      setSaving("saving")
      try {
        await api.patchPage(pendingPagePatch.pageId, pendingPagePatch.payload)
        setSaving("saved")
        setValidation(await api.validateGuide(guideId))
      } catch {
        setSaving("error")
      }
    }, 500)
    return () => window.clearTimeout(timer)
  }, [guideId, pendingPagePatch])

  useEffect(() => {
    if (!pendingSessionPatch) return
    const timer = window.setTimeout(async () => {
      setSaving("saving")
      try {
        await api.patchSession(pendingSessionPatch.sessionId, pendingSessionPatch.payload)
        setSaving("saved")
        setValidation(await api.validateGuide(guideId))
      } catch {
        setSaving("error")
      }
    }, 500)
    return () => window.clearTimeout(timer)
  }, [guideId, pendingSessionPatch])

  const selected = useMemo(() => findSelectedPage(guide, selectedPageId), [guide, selectedPageId])

  function updatePage(pageId: string, payload: Record<string, unknown>) {
    setGuide((current) => current && patchGuidePage(current, pageId, payload))
    setPendingPagePatch({ pageId, payload })
  }

  function updateSession(sessionId: string, payload: Record<string, unknown>) {
    setGuide((current) => current && patchGuideSession(current, sessionId, payload))
    setPendingSessionPatch({ sessionId, payload })
  }

  async function reloadAfter(action: () => Promise<unknown>) {
    try {
      await action()
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Action failed.")
    }
  }

  async function exportGuide() {
    if (!guide) return
    await reloadAfter(async () => {
      const blob = await api.exportGuide(guide.id)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `${guide.poem.externalId}_guided_plan.json`
      anchor.click()
      URL.revokeObjectURL(url)
    })
  }

  if (error) {
    return <main className="min-h-screen bg-bamba-ivory p-8 text-bamba-ink">{error}</main>
  }
  if (!guide) {
    return <main className="min-h-screen bg-bamba-ivory p-8 text-bamba-muted">Loading editor...</main>
  }

  return (
    <main className="flex h-screen min-w-[1180px] flex-col bg-bamba-ivory text-bamba-ink">
      <TopBar guide={guide} saving={saving} onApprove={() => void reloadAfter(() => api.approveGuide(guide.id))} onExport={() => void exportGuide()} />
      <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(480px,1fr)_420px] border-t border-bamba-border">
        <SessionsNavigator
          guide={guide}
          selectedPageId={selectedPageId}
          onSelectPage={setSelectedPageId}
          onCreatePage={(sessionId) => void reloadAfter(() => api.createPage(sessionId))}
          onDuplicatePage={(pageId) => void reloadAfter(() => api.duplicatePage(pageId))}
          onDeletePage={(pageId) => void reloadAfter(() => api.deletePage(pageId))}
          onReorderPages={async (sessionId, pages) => {
            setGuide((current) => current && replaceSessionPages(current, sessionId, pages))
            await api.reorderPages(sessionId, pages.map((page, index) => ({ id: page.id, orderIndex: index })))
            await load()
          }}
        />
        <PageEditor selected={selected} guide={guide} onUpdatePage={updatePage} onUpdateSession={updateSession} />
        <aside className="grid min-h-0 grid-rows-[1fr_1fr] border-l border-bamba-border bg-bamba-paper/70">
          <MobilePreview guide={guide} selected={selected} />
          <ReviewPanel
            guide={guide}
            comments={comments}
            selectedPage={selected?.page ?? null}
            onAccept={(commentId) => void reloadAfter(() => api.acceptComment(commentId))}
            onStatus={(commentId, status) => void reloadAfter(() => api.setCommentStatus(commentId, status))}
          />
        </aside>
      </div>
      <BottomUtilityBar guide={guide} validation={validation} onValidate={() => void reloadAfter(async () => setValidation(await api.validateGuide(guide.id)))} />
    </main>
  )
}

function TopBar({
  guide,
  saving,
  onApprove,
  onExport,
}: {
  guide: GuideDetail
  saving: "idle" | "saving" | "saved" | "error"
  onApprove: () => void
  onExport: () => void
}) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between bg-bamba-paper px-5">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link to="/guides" title="Guides">
            <ArrowLeft />
          </Link>
        </Button>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">{guide.title}</h1>
            <GuideStatusPill status={guide.status} />
          </div>
          <p className="text-xs text-bamba-muted">
            {guide.poem.title} · {guide.poem.author} · v{guide.version}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1 text-xs text-bamba-muted">
          <Save className="size-3" />
          {saving === "saving" ? "Saving" : saving === "error" ? "Save failed" : saving === "saved" ? "Saved" : "Ready"}
        </span>
        <Button asChild variant="outline">
          <Link to={`/guides/${guide.id}/reviews/import`}>
            <FileJson />
            Import review
          </Link>
        </Button>
        <Button variant="outline" onClick={onApprove}>
          <CheckCircle2 />
          Approve
        </Button>
        <Button onClick={onExport}>
          <Download />
          Export
        </Button>
      </div>
    </header>
  )
}

function SessionsNavigator({
  guide,
  selectedPageId,
  onSelectPage,
  onCreatePage,
  onDuplicatePage,
  onDeletePage,
  onReorderPages,
}: {
  guide: GuideDetail
  selectedPageId: string | null
  onSelectPage: (pageId: string) => void
  onCreatePage: (sessionId: string) => void
  onDuplicatePage: (pageId: string) => void
  onDeletePage: (pageId: string) => void
  onReorderPages: (sessionId: string, pages: GuidePage[]) => Promise<void>
}) {
  return (
    <aside className="min-h-0 border-r border-bamba-border bg-bamba-paper">
      <ScrollArea className="h-full">
        <div className="flex flex-col gap-4 p-4">
          {guide.sessions.map((session) => (
            <section key={session.id} className="rounded-lg border border-bamba-border bg-white/55 p-3">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold">{session.title}</h2>
                  <p className="text-xs text-bamba-muted">Session {session.sessionNumber}</p>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={() => onCreatePage(session.id)} title="Add page">
                  <Plus />
                </Button>
              </div>
              <SortablePages
                pages={session.pages}
                selectedPageId={selectedPageId}
                onSelectPage={onSelectPage}
                onDuplicatePage={onDuplicatePage}
                onDeletePage={onDeletePage}
                onReorder={(pages) => onReorderPages(session.id, pages)}
              />
            </section>
          ))}
        </div>
      </ScrollArea>
    </aside>
  )
}

function SortablePages({
  pages,
  selectedPageId,
  onSelectPage,
  onDuplicatePage,
  onDeletePage,
  onReorder,
}: {
  pages: GuidePage[]
  selectedPageId: string | null
  onSelectPage: (pageId: string) => void
  onDuplicatePage: (pageId: string) => void
  onDeletePage: (pageId: string) => void
  onReorder: (pages: GuidePage[]) => Promise<void>
}) {
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = pages.findIndex((page) => page.id === active.id)
    const newIndex = pages.findIndex((page) => page.id === over.id)
    await onReorder(arrayMove(pages, oldIndex, newIndex))
  }

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={(event) => void handleDragEnd(event)}>
      <SortableContext items={pages.map((page) => page.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-1">
          {pages.map((page) => (
            <SortablePageNode
              key={page.id}
              page={page}
              selected={selectedPageId === page.id}
              onSelect={() => onSelectPage(page.id)}
              onDuplicate={() => onDuplicatePage(page.id)}
              onDelete={() => onDeletePage(page.id)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

function SortablePageNode({
  page,
  selected,
  onSelect,
  onDuplicate,
  onDelete,
}: {
  page: GuidePage
  selected: boolean
  onSelect: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const sortable = useSortable({ id: page.id })
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  }
  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      className={`grid grid-cols-[24px_1fr_auto] items-center gap-1 rounded-md border px-1 py-1 text-left text-xs ${
        selected ? "border-bamba-amber bg-bamba-amber/10" : "border-transparent bg-transparent hover:bg-bamba-ivory"
      }`}
    >
      <button className="cursor-grab text-bamba-muted" {...sortable.attributes} {...sortable.listeners} title="Drag page">
        <GripVertical className="size-4" />
      </button>
      <button className="truncate text-left" onClick={onSelect}>
        <span className="block truncate font-medium">{page.title || page.type}</span>
        <span className="block truncate text-bamba-muted">{page.type}</span>
      </button>
      <div className="flex">
        <Button variant="ghost" size="icon-xs" onClick={onDuplicate} title="Duplicate page">
          <Copy />
        </Button>
        <Button variant="ghost" size="icon-xs" onClick={onDelete} title="Delete page">
          <Trash2 />
        </Button>
      </div>
    </div>
  )
}

function PageEditor({
  selected,
  guide,
  onUpdatePage,
  onUpdateSession,
}: {
  selected: { session: GuideSession; page: GuidePage } | null
  guide: GuideDetail
  onUpdatePage: (pageId: string, payload: Record<string, unknown>) => void
  onUpdateSession: (sessionId: string, payload: Record<string, unknown>) => void
}) {
  if (!selected) {
    return <section className="p-8 text-bamba-muted">Choose a page to edit.</section>
  }
  const { session, page } = selected
  return (
    <section className="min-h-0 bg-bamba-ivory">
      <ScrollArea className="h-full">
        <div className="mx-auto flex max-w-3xl flex-col gap-5 p-6">
          <Card className="border-bamba-border bg-white/65">
            <CardHeader>
              <CardTitle>Session</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <Field label="Title">
                <Input value={session.title} onChange={(event) => onUpdateSession(session.id, { title: event.target.value })} />
              </Field>
              <Field label="Subtitle">
                <Input value={session.subtitle ?? ""} onChange={(event) => onUpdateSession(session.id, { subtitle: event.target.value })} />
              </Field>
              <Field className="col-span-2" label="Focus summary">
                <Textarea
                  value={session.focusSummary ?? ""}
                  onChange={(event) => onUpdateSession(session.id, { focusSummary: event.target.value })}
                />
              </Field>
            </CardContent>
          </Card>

          <Card className="border-bamba-border bg-white/70">
            <CardHeader>
              <CardTitle>Page editor</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Type">
                  <Select value={page.type} onValueChange={(value) => onUpdatePage(page.id, { type: value })}>
                    <SelectTrigger className="w-full bg-bamba-paper">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Round type">
                  <Select value={page.roundType ?? "none"} onValueChange={(value) => onUpdatePage(page.id, { roundType: value === "none" ? null : value })}>
                    <SelectTrigger className="w-full bg-bamba-paper">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">none</SelectItem>
                      {ROUND_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label="Title">
                <Input value={page.title ?? ""} onChange={(event) => onUpdatePage(page.id, { title: event.target.value })} />
              </Field>
              <Field label="Body markdown">
                <Textarea
                  className="min-h-48"
                  value={page.bodyMarkdown ?? ""}
                  onChange={(event) => onUpdatePage(page.id, { bodyMarkdown: event.target.value })}
                />
              </Field>
              <Field label="Prompt">
                <Textarea value={page.prompt ?? ""} onChange={(event) => onUpdatePage(page.id, { prompt: event.target.value })} />
              </Field>
              <div className="grid grid-cols-[1fr_160px] gap-3">
                <Field label="Linked chunks">
                  <ChunkSelector
                    chunks={guide.poem.chunks}
                    selected={page.chunkIds}
                    onChange={(chunkIds) => onUpdatePage(page.id, { chunkIds })}
                  />
                </Field>
                <Field label="Estimated seconds">
                  <Input
                    type="number"
                    value={page.estimatedSeconds ?? ""}
                    onChange={(event) => onUpdatePage(page.id, { estimatedSeconds: Number(event.target.value) || null })}
                  />
                </Field>
              </div>
              <Field label="Metadata JSON">
                <Textarea
                  className="min-h-24 font-mono text-xs"
                  value={JSON.stringify(page.metadata ?? {}, null, 2)}
                  onChange={(event) => {
                    try {
                      onUpdatePage(page.id, { metadata: JSON.parse(event.target.value) as Record<string, unknown> })
                    } catch {
                      return
                    }
                  }}
                />
              </Field>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </section>
  )
}

function ChunkSelector({
  chunks,
  selected,
  onChange,
}: {
  chunks: GuideDetail["poem"]["chunks"]
  selected: string[]
  onChange: (chunkIds: string[]) => void
}) {
  return (
    <div className="grid max-h-44 gap-1 overflow-auto rounded-md border border-bamba-border bg-bamba-paper p-2">
      {chunks.map((chunk) => {
        const checked = selected.includes(chunk.externalId)
        return (
          <label key={chunk.id} className="flex cursor-pointer items-start gap-2 rounded px-2 py-1 text-xs hover:bg-white/70">
            <input
              checked={checked}
              className="mt-0.5"
              type="checkbox"
              onChange={(event) => {
                onChange(event.target.checked ? [...selected, chunk.externalId] : selected.filter((id) => id !== chunk.externalId))
              }}
            />
            <span>
              <span className="block font-medium">{chunk.externalId}</span>
              <span className="text-bamba-muted">{chunk.text}</span>
            </span>
          </label>
        )
      })}
    </div>
  )
}

function MobilePreview({ guide, selected }: { guide: GuideDetail; selected: { session: GuideSession; page: GuidePage } | null }) {
  const page = selected?.page
  const session = selected?.session
  const linkedChunks = page ? guide.poem.chunks.filter((chunk) => page.chunkIds.includes(chunk.externalId)) : []
  return (
    <section className="min-h-0 border-b border-bamba-border p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Mobile preview</h2>
        {session && page ? <span className="text-xs text-bamba-muted">Session {session.sessionNumber} · page {page.orderIndex + 1}</span> : null}
      </div>
      <div className="mx-auto flex h-[calc(100%-2rem)] max-h-[560px] w-72 flex-col overflow-hidden rounded-[2rem] border border-bamba-border bg-[#fffaf0] shadow-sm">
        <div className="border-b border-bamba-border px-5 py-4 text-center text-xs text-bamba-muted">{session?.title ?? "Session"}</div>
        <div className="flex-1 overflow-auto px-5 py-6">
          <h3 className="mb-3 text-xl font-semibold">{page?.title || page?.type || guide.title}</h3>
          {page?.type.includes("game") ? (
            <div className="space-y-3">
              {linkedChunks.map((chunk) => (
                <div key={chunk.id} className="rounded-md border border-bamba-border bg-white/70 p-3 text-sm">
                  {chunk.text.split(" ").map((word, index) => (
                    <span key={`${word}-${index}`} className={index % 3 === 1 ? "mx-1 rounded bg-bamba-amber/15 px-2 py-0.5" : "mr-1"}>
                      {index % 3 === 1 ? "____" : word}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          ) : page?.type === "poem_chunk" ? (
            <div className="space-y-2 text-lg leading-8">
              {linkedChunks.map((chunk) => (
                <p key={chunk.id}>{chunk.text}</p>
              ))}
            </div>
          ) : page?.type === "reflection" ? (
            <p className="text-lg leading-8">{page.prompt}</p>
          ) : (
            <div className="prose prose-sm max-w-none text-bamba-ink">
              <ReactMarkdown>{page?.bodyMarkdown ?? ""}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function ReviewPanel({
  guide,
  comments,
  selectedPage,
  onAccept,
  onStatus,
}: {
  guide: GuideDetail
  comments: ReviewComment[]
  selectedPage: GuidePage | null
  onAccept: (commentId: string) => void
  onStatus: (commentId: string, status: ReviewComment["status"]) => void
}) {
  const visibleComments = comments.filter(
    (comment) => comment.targetType === "guide" || comment.targetId === selectedPage?.externalId || comment.targetId === guide.externalId,
  )
  return (
    <section className="min-h-0 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Review</h2>
        <Badge variant="outline" className="bg-bamba-paper">
          {visibleComments.length} comments
        </Badge>
      </div>
      <ScrollArea className="h-[calc(100%-2rem)]">
        <div className="flex flex-col gap-3 pr-3">
          {visibleComments.map((comment) => (
            <Card key={comment.id} className="border-bamba-border bg-white/70" size="sm">
              <CardContent className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className={comment.severity === "blocking" ? "border-red-300 bg-red-50 text-red-800" : "bg-bamba-paper"}>
                    {comment.severity}
                  </Badge>
                  <span className="text-xs text-bamba-muted">{comment.status}</span>
                </div>
                <p className="text-sm">{comment.comment}</p>
                {comment.suggestedRevision ? (
                  <blockquote className="rounded-md bg-bamba-paper p-2 text-xs text-bamba-muted">{comment.suggestedRevision}</blockquote>
                ) : null}
                <div className="flex flex-wrap gap-1">
                  <Button size="xs" onClick={() => onAccept(comment.id)}>Accept</Button>
                  <Button size="xs" variant="outline" onClick={() => onStatus(comment.id, "resolved")}>Resolve</Button>
                  <Button size="xs" variant="ghost" onClick={() => onStatus(comment.id, "dismissed")}>Dismiss</Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {visibleComments.length === 0 ? (
            <p className="rounded-md border border-bamba-border bg-white/50 p-3 text-sm text-bamba-muted">No comments for this page.</p>
          ) : null}
        </div>
      </ScrollArea>
    </section>
  )
}

function BottomUtilityBar({ guide, validation, onValidate }: { guide: GuideDetail; validation: ValidationResult | null; onValidate: () => void }) {
  const blocking = validation?.issues.filter((issue) => issue.severity === "blocking") ?? []
  return (
    <footer className="flex h-24 shrink-0 items-center justify-between border-t border-bamba-border bg-bamba-paper px-5">
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={onValidate}>
          <MessageSquare />
          Validate
        </Button>
        <div>
          <p className="text-sm font-medium">{blocking.length === 0 ? "No blocking validation issues" : `${blocking.length} blocking issues`}</p>
          <p className="text-xs text-bamba-muted">Export path: assets/curated_poems/{guide.poem.externalId}/guided_plan.json</p>
        </div>
      </div>
      <div className="flex max-w-2xl gap-2 overflow-auto">
        {validation?.issues.slice(0, 4).map((issue) => (
          <Badge key={`${issue.code}-${issue.targetId}-${issue.message}`} variant="outline" className="bg-white/60">
            {issue.severity}: {issue.message}
          </Badge>
        ))}
      </div>
    </footer>
  )
}

function Field({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${className ?? ""}`}>
      <span className="text-xs font-medium uppercase tracking-[0.14em] text-bamba-muted">{label}</span>
      {children}
    </label>
  )
}

function findSelectedPage(guide: GuideDetail | null, pageId: string | null) {
  if (!guide || !pageId) return null
  for (const session of guide.sessions) {
    const page = session.pages.find((candidate) => candidate.id === pageId)
    if (page) return { session, page }
  }
  return null
}

function patchGuidePage(guide: GuideDetail, pageId: string, payload: Record<string, unknown>): GuideDetail {
  return {
    ...guide,
    sessions: guide.sessions.map((session) => ({
      ...session,
      pages: session.pages.map((page) => (page.id === pageId ? ({ ...page, ...payload } as GuidePage) : page)),
    })),
  }
}

function patchGuideSession(guide: GuideDetail, sessionId: string, payload: Record<string, unknown>): GuideDetail {
  return {
    ...guide,
    sessions: guide.sessions.map((session) => (session.id === sessionId ? ({ ...session, ...payload } as GuideSession) : session)),
  }
}

function replaceSessionPages(guide: GuideDetail, sessionId: string, pages: GuidePage[]): GuideDetail {
  return {
    ...guide,
    sessions: guide.sessions.map((session) =>
      session.id === sessionId
        ? { ...session, pages: pages.map((page, orderIndex) => ({ ...page, orderIndex })) }
        : session,
    ),
  }
}
