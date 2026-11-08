import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { Link, useNavigate, useParams } from "react-router"
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
  BookUp,
  CheckCircle2,
  Copy,
  Download,
  FileJson,
  GripVertical,
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
  GuideVersionSummary,
  PageType,
  PublishResult,
  ReviewComment,
} from "@/lib/types"

const PAGE_TYPES: PageType[] = [
  "intro",
  "context",
  "poet_background",
  "poem_background",
  "recap",
  "recap_previous",
  "poem_chunk",
  "whole_poem",
  "commentary",
  "first_letter_game",
  "first_word_game",
  "full_chunk_typing_game",
  "last_word_game",
  "first_last_word_game",
  "hidden_word_game",
  "reflection",
  "completion",
]

// The Bamba app cannot render these yet, so the backend blocks export when a guide uses them.
const APP_UNSUPPORTED_PAGE_TYPES = new Set<PageType>(["recap_previous", "whole_poem", "full_chunk_typing_game"])

const GAME_PAGE_TYPES = new Set<PageType>([
  "first_letter_game",
  "first_word_game",
  "full_chunk_typing_game",
  "last_word_game",
  "first_last_word_game",
  "hidden_word_game",
])

export function GuideEditorPage() {
  const { guideId = "" } = useParams()
  const navigate = useNavigate()
  const [guide, setGuide] = useState<GuideDetail | null>(null)
  const [versions, setVersions] = useState<GuideVersionSummary[]>([])
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null)
  const [comments, setComments] = useState<ReviewComment[]>([])
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [error, setError] = useState<string | null>(null)
  // Failed actions (approve, export, save version) show as a banner and keep the editor open.
  const [actionError, setActionError] = useState<string | null>(null)
  const [published, setPublished] = useState<PublishResult | null>(null)
  const [pendingPagePatch, setPendingPagePatch] = useState<{ pageId: string; payload: Record<string, unknown> } | null>(null)
  const [pendingSessionPatch, setPendingSessionPatch] = useState<{ sessionId: string; payload: Record<string, unknown> } | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [guideData, commentData] = await Promise.all([
        api.getGuide(guideId),
        api.listReviewComments(guideId),
      ])
      const versionData = await api.listGuideVersions(guideData.id)
      setGuide(guideData)
      setVersions(versionData)
      setComments(commentData)
      setSelectedPageId((current) =>
        guideData.sessions.some((session) => session.pages.some((page) => page.id === current) || current === dailyChunksId(session.id))
          ? current
          : guideData.sessions[0]?.pages[0]?.id ?? null,
      )
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
      } catch {
        setSaving("error")
      }
    }, 500)
    return () => window.clearTimeout(timer)
  }, [guideId, pendingSessionPatch])

  const selected = useMemo(() => findSelectedPage(guide, selectedPageId), [guide, selectedPageId])
  const selectedDailySession = useMemo(() => findSelectedDailySession(guide, selectedPageId), [guide, selectedPageId])
  const readOnly = Boolean(guide && guide.version > 0)
  const hasReview = comments.length > 0

  function updatePage(pageId: string, payload: Record<string, unknown>) {
    setGuide((current) => current && patchGuidePage(current, pageId, payload))
    setPendingPagePatch({ pageId, payload })
  }

  function updateSession(sessionId: string, payload: Record<string, unknown>) {
    setGuide((current) => current && patchGuideSession(current, sessionId, payload))
    setPendingSessionPatch({ sessionId, payload })
  }

  async function reloadAfter(action: () => Promise<unknown>) {
    setActionError(null)
    try {
      await action()
      await load()
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Action failed.")
    }
  }

  async function saveCurrentVersion() {
    if (!guide) return
    try {
      const nextGuide = await api.saveVersion(guide.id)
      if (nextGuide.id !== guide.id) {
        navigate(`/guides/${nextGuide.id}`)
        return
      }
      await load()
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Could not save version.")
    }
  }

  async function restoreAsLatest() {
    if (!guide) return
    try {
      const latest = await api.restoreLatest(guide.id)
      navigate(`/guides/${latest.id}`)
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Could not restore version.")
    }
  }

  async function publishGuide() {
    if (!guide) return
    setPublished(null)
    await reloadAfter(async () => setPublished(await api.publishGuide(guide.id)))
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
      <TopBar
        guide={guide}
        versions={versions}
        saving={saving}
        onApprove={() => void reloadAfter(() => api.approveGuide(guide.id))}
        onPublish={() => void publishGuide()}
        onExport={() => void exportGuide()}
        onSaveVersion={() => void saveCurrentVersion()}
        onRestoreLatest={() => void restoreAsLatest()}
        onSelectVersion={(versionGuideId) => navigate(`/guides/${versionGuideId}`)}
      />
      {actionError ? (
        <div role="alert" className="flex items-start justify-between gap-4 border-t border-amber-300 bg-amber-50 px-5 py-3 text-sm">
          <p className="whitespace-pre-wrap">{actionError}</p>
          <Button size="xs" variant="ghost" onClick={() => setActionError(null)}>
            Dismiss
          </Button>
        </div>
      ) : null}
      {published ? (
        <div role="status" className="flex items-start justify-between gap-4 border-t border-bamba-border bg-bamba-amber/10 px-5 py-3 text-sm">
          <div className="space-y-1">
            <p>
              Published to <code className="font-mono text-xs">{published.path}</code>
              {published.link ? (
                <>
                  {" "}and linked from <code className="font-mono text-xs">{published.link}</code>
                </>
              ) : null}
              .
            </p>
            {published.warnings.map((warning) => (
              <p key={warning} className="text-amber-800">
                {warning}
              </p>
            ))}
            <p className="text-bamba-muted">
              Next: commit and push, then advance the content pin in Bamba and run its sync tool.
            </p>
          </div>
          <Button size="xs" variant="ghost" onClick={() => setPublished(null)}>
            Dismiss
          </Button>
        </div>
      ) : null}
      <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(480px,1fr)_420px] border-t border-bamba-border">
        <SessionsNavigator
          guide={guide}
          selectedPageId={selectedPageId}
          onSelectPage={setSelectedPageId}
          readOnly={readOnly}
          onCreatePage={(sessionId) => void reloadAfter(() => api.createPage(sessionId))}
          onDuplicatePage={(pageId) => void reloadAfter(() => api.duplicatePage(pageId))}
          onDeletePage={(pageId) => void reloadAfter(() => api.deletePage(pageId))}
          onReorderPages={async (sessionId, pages) => {
            if (readOnly) return
            setGuide((current) => current && replaceSessionPages(current, sessionId, pages))
            await api.reorderPages(sessionId, pages.map((page, index) => ({ id: page.id, orderIndex: index })))
            await load()
          }}
        />
        {selectedDailySession ? (
          <DailyChunksEditor
            guide={guide}
            session={selectedDailySession}
            readOnly={readOnly}
            onUpdateSession={updateSession}
          />
        ) : (
          <PageEditor selected={selected} guide={guide} readOnly={readOnly} onUpdatePage={updatePage} />
        )}
        <aside className={`grid min-h-0 border-l border-bamba-border bg-bamba-paper/70 ${hasReview ? "grid-rows-[1fr_1fr]" : "grid-rows-1"}`}>
          <MobilePreview guide={guide} selected={selected} showDivider={hasReview} />
          {hasReview ? (
            <ReviewPanel
              guide={guide}
              comments={comments}
              selectedPage={selected?.page ?? null}
              onAccept={(commentId) => void reloadAfter(() => api.acceptComment(commentId))}
              onStatus={(commentId, status) => void reloadAfter(() => api.setCommentStatus(commentId, status))}
            />
          ) : null}
        </aside>
      </div>
    </main>
  )
}

function TopBar({
  guide,
  versions,
  saving,
  onApprove,
  onPublish,
  onExport,
  onSaveVersion,
  onRestoreLatest,
  onSelectVersion,
}: {
  guide: GuideDetail
  versions: GuideVersionSummary[]
  saving: "idle" | "saving" | "saved" | "error"
  onApprove: () => void
  onPublish: () => void
  onExport: () => void
  onSaveVersion: () => void
  onRestoreLatest: () => void
  onSelectVersion: (guideId: string) => void
}) {
  const latestSaved = versions.find((version) => !version.isLatest)
  const currentVersion = versions.find((version) => version.id === guide.id)
  const versionDisplay =
    guide.version === 0 && latestSaved
      ? `latest · saved ${latestSaved.versionLabel}`
      : currentVersion?.versionLabel ?? guide.versionLabel

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
            <Badge variant="outline" className="bg-bamba-paper">
              {versionDisplay}
            </Badge>
          </div>
          <p className="text-xs text-bamba-muted">
            {guide.poem.title} · {guide.poem.author}
            {currentVersion?.timestamp ? ` · ${formatVersionTimestamp(currentVersion.timestamp)}` : ""}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Select value={guide.id} onValueChange={onSelectVersion}>
          <SelectTrigger className="h-9 w-64 bg-bamba-paper">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {versions.map((version) => (
              <SelectItem key={version.id} value={version.id}>
                {version.versionLabel} · {formatVersionTimestamp(version.timestamp)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        {guide.version === 0 ? (
          <Button variant="outline" onClick={onSaveVersion}>
            <Save />
            Save version
          </Button>
        ) : (
          <Button variant="outline" onClick={onRestoreLatest}>
            <Save />
            Use as latest
          </Button>
        )}
        <Button variant="outline" onClick={onApprove}>
          <CheckCircle2 />
          Approve
        </Button>
        <Button variant="outline" onClick={onExport} title="Download the guide JSON without publishing it">
          <Download />
          Download
        </Button>
        <Button onClick={onPublish} title="Write the guide to exports/curated_poems for the Bamba app">
          <BookUp />
          Publish
        </Button>
      </div>
    </header>
  )
}

function SessionsNavigator({
  guide,
  selectedPageId,
  readOnly,
  onSelectPage,
  onCreatePage,
  onDuplicatePage,
  onDeletePage,
  onReorderPages,
}: {
  guide: GuideDetail
  selectedPageId: string | null
  readOnly: boolean
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
                <Button disabled={readOnly} variant="ghost" size="icon-sm" onClick={() => onCreatePage(session.id)} title="Add page">
                  <Plus />
                </Button>
              </div>
              <SortablePages
                session={session}
                pages={session.pages}
                readOnly={readOnly}
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
  session,
  pages,
  readOnly,
  selectedPageId,
  onSelectPage,
  onDuplicatePage,
  onDeletePage,
  onReorder,
}: {
  session: GuideSession
  pages: GuidePage[]
  readOnly: boolean
  selectedPageId: string | null
  onSelectPage: (pageId: string) => void
  onDuplicatePage: (pageId: string) => void
  onDeletePage: (pageId: string) => void
  onReorder: (pages: GuidePage[]) => Promise<void>
}) {
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (readOnly) return
    if (!over || active.id === over.id) return
    const oldIndex = pages.findIndex((page) => page.id === active.id)
    const newIndex = pages.findIndex((page) => page.id === over.id)
    await onReorder(arrayMove(pages, oldIndex, newIndex))
  }

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={(event) => void handleDragEnd(event)}>
      <SortableContext items={pages.map((page) => page.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-1">
          <button
            className={`grid grid-cols-[24px_1fr_auto] items-center gap-1 rounded-md border px-1 py-1 text-left text-xs ${
              selectedPageId === dailyChunksId(session.id)
                ? "border-bamba-amber bg-bamba-amber/10"
                : "border-transparent bg-transparent hover:bg-bamba-ivory"
            }`}
            onClick={() => onSelectPage(dailyChunksId(session.id))}
          >
            <span />
            <span className="truncate">
              <span className="block truncate font-medium">Daily chunks</span>
              <span className="block truncate text-bamba-muted">{session.chunkIds.length} linked</span>
            </span>
            <Badge variant="outline" className="bg-bamba-paper text-[10px]">
              day
            </Badge>
          </button>
          {pages.map((page) => (
            <SortablePageNode
              key={page.id}
              page={page}
              readOnly={readOnly}
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
  readOnly,
  selected,
  onSelect,
  onDuplicate,
  onDelete,
}: {
  page: GuidePage
  readOnly: boolean
  selected: boolean
  onSelect: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const sortable = useSortable({ id: page.id, disabled: readOnly })
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
      <button className="cursor-grab text-bamba-muted disabled:cursor-default disabled:opacity-50" disabled={readOnly} {...sortable.attributes} {...sortable.listeners} title="Drag page">
        <GripVertical className="size-4" />
      </button>
      <button className="truncate text-left" onClick={onSelect}>
        <span className="block truncate font-medium">{page.title || page.type}</span>
        <span className="block truncate text-bamba-muted">{page.type}</span>
      </button>
      <div className="flex">
        <Button disabled={readOnly} variant="ghost" size="icon-xs" onClick={onDuplicate} title="Duplicate page">
          <Copy />
        </Button>
        <Button disabled={readOnly} variant="ghost" size="icon-xs" onClick={onDelete} title="Delete page">
          <Trash2 />
        </Button>
      </div>
    </div>
  )
}

function PageEditor({
  selected,
  guide,
  readOnly,
  onUpdatePage,
}: {
  selected: { session: GuideSession; page: GuidePage } | null
  guide: GuideDetail
  readOnly: boolean
  onUpdatePage: (pageId: string, payload: Record<string, unknown>) => void
}) {
  if (!selected) {
    return <section className="p-8 text-bamba-muted">Choose a page to edit.</section>
  }
  const { session, page } = selected
  const isGamePage = GAME_PAGE_TYPES.has(page.type)
  const isReflectionPage = page.type === "reflection"
  const showBodyMarkdown = !isGamePage && !isReflectionPage
  const gameChunkOptions = getChunksByExternalIds(guide, session.chunkIds)
  const selectedGameChunkIds = page.chunkIds.length > 0 ? page.chunkIds : session.chunkIds
  return (
    <section className="min-h-0 bg-bamba-ivory">
      <ScrollArea className="h-full">
        <div className="mx-auto flex max-w-3xl flex-col gap-5 p-6">
          <Card className="border-bamba-border bg-white/70">
            <CardHeader>
              <CardTitle>Page editor</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-3">
                <Field label="Type">
                  <Select
                    disabled={readOnly}
                    value={page.type}
                    onValueChange={(value) => {
                      const nextType = value as PageType
                      onUpdatePage(page.id, {
                        type: nextType,
                        bodyMarkdown: nextType === "reflection" || GAME_PAGE_TYPES.has(nextType) ? null : page.bodyMarkdown,
                        prompt: nextType === "reflection" ? page.prompt : null,
                      })
                    }}
                  >
                    <SelectTrigger className="w-full bg-bamba-paper">
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
              </div>
              <Field label="Title">
                <Input disabled={readOnly} value={page.title ?? ""} onChange={(event) => onUpdatePage(page.id, { title: event.target.value })} />
              </Field>
              {showBodyMarkdown ? (
                <Field label="Body markdown">
                  <Textarea
                    className="min-h-48"
                    disabled={readOnly}
                    value={page.bodyMarkdown ?? ""}
                    onChange={(event) => onUpdatePage(page.id, { bodyMarkdown: event.target.value })}
                  />
                </Field>
              ) : null}
              {isReflectionPage ? (
                <Field label="Prompt">
                  <Textarea disabled={readOnly} value={page.prompt ?? ""} onChange={(event) => onUpdatePage(page.id, { prompt: event.target.value })} />
                </Field>
              ) : null}
              <div className="grid grid-cols-[1fr_160px] gap-3">
                {isGamePage ? (
                  <Field label="Game chunks">
                    <ChunkSelector
                      chunks={gameChunkOptions}
                      selected={selectedGameChunkIds}
                      disabled={readOnly}
                      onChange={(chunkIds) => onUpdatePage(page.id, { chunkIds })}
                    />
                  </Field>
                ) : (
                  <div />
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </section>
  )
}

function DailyChunksEditor({
  guide,
  session,
  readOnly,
  onUpdateSession,
}: {
  guide: GuideDetail
  session: GuideSession
  readOnly: boolean
  onUpdateSession: (sessionId: string, payload: Record<string, unknown>) => void
}) {
  const selectedChunks = getChunksByExternalIds(guide, session.chunkIds)
  return (
    <section className="min-h-0 bg-bamba-ivory">
      <ScrollArea className="h-full">
        <div className="mx-auto flex max-w-3xl flex-col gap-5 p-6">
          <Card className="border-bamba-border bg-white/70">
            <CardHeader>
              <CardTitle>Daily chunks</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Title">
                  <Input disabled={readOnly} value={session.title} onChange={(event) => onUpdateSession(session.id, { title: event.target.value })} />
                </Field>
                <Field label="Subtitle">
                  <Input disabled={readOnly} value={session.subtitle ?? ""} onChange={(event) => onUpdateSession(session.id, { subtitle: event.target.value })} />
                </Field>
                <Field className="col-span-2" label="Focus summary">
                  <Textarea
                    value={session.focusSummary ?? ""}
                    disabled={readOnly}
                    onChange={(event) => onUpdateSession(session.id, { focusSummary: event.target.value })}
                  />
                </Field>
              </div>
              <ChunkSelector
                chunks={guide.poem.chunks}
                selected={session.chunkIds}
                disabled={readOnly}
                onChange={(chunkIds) => onUpdateSession(session.id, { chunkIds })}
              />
              <div className="grid gap-2">
                {selectedChunks.map((chunk) => (
                  <div key={chunk.id} className="rounded-md border border-bamba-border bg-bamba-paper p-3 text-sm">
                    <div className="mb-1 text-xs font-medium text-bamba-muted">{chunk.externalId}</div>
                    <p className="leading-6">{chunk.text}</p>
                  </div>
                ))}
              </div>
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
  disabled,
  onChange,
}: {
  chunks: GuideDetail["poem"]["chunks"]
  selected: string[]
  disabled: boolean
  onChange: (chunkIds: string[]) => void
}) {
  return (
    <div className="grid max-h-44 gap-1 overflow-auto rounded-md border border-bamba-border bg-bamba-paper p-2">
      {chunks.length === 0 ? <p className="px-2 py-1 text-xs text-bamba-muted">No chunks available.</p> : null}
      {chunks.map((chunk) => {
        const checked = selected.includes(chunk.externalId)
        return (
          <label key={chunk.id} className="flex cursor-pointer items-start gap-2 rounded px-2 py-1 text-xs hover:bg-white/70">
            <input
              checked={checked}
              className="mt-0.5"
              disabled={disabled}
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

function formatVersionTimestamp(timestamp?: string | null) {
  if (!timestamp) return "unsaved"
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp))
}

function MobilePreview({
  guide,
  selected,
  showDivider,
}: {
  guide: GuideDetail
  selected: { session: GuideSession; page: GuidePage } | null
  showDivider: boolean
}) {
  const page = selected?.page
  const session = selected?.session
  const linkedChunks = page && session ? getEffectiveChunks(guide, session, page) : []
  return (
    <section className={`min-h-0 p-4 ${showDivider ? "border-b border-bamba-border" : ""}`}>
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
                <div key={chunk.id} className="overflow-hidden rounded-md border border-bamba-border bg-white/70 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
                  {chunk.text.split(" ").map((word, index) => (
                    <span
                      key={`${word}-${index}`}
                      className={
                        page.type === "full_chunk_typing_game" || index % 3 === 1
                          ? "inline-flex h-8 min-w-16 max-w-full shrink-0 items-center justify-center rounded-md bg-bamba-amber/15 px-3 font-mono"
                          : "min-w-0 max-w-full break-words leading-8"
                      }
                    >
                      {page.type === "full_chunk_typing_game" || index % 3 === 1 ? "____" : word}
                    </span>
                  ))}
                  </div>
                </div>
              ))}
            </div>
          ) : page?.type === "poem_chunk" ? (
            <div className="space-y-2 text-lg leading-8">
              {linkedChunks.map((chunk) => (
                <p key={chunk.id}>{chunk.text}</p>
              ))}
            </div>
          ) : page?.type === "recap_previous" ? (
            <div className="space-y-4">
              {linkedChunks.length > 0 ? (
                <div className="space-y-2 text-base leading-7">
                  {linkedChunks.map((chunk) => (
                    <p key={chunk.id}>{chunk.text}</p>
                  ))}
                </div>
              ) : null}
              <div className="prose prose-sm max-w-none text-bamba-ink">
                <ReactMarkdown>{page.bodyMarkdown ?? ""}</ReactMarkdown>
              </div>
            </div>
          ) : page?.type === "whole_poem" ? (
            <div className="whitespace-pre-wrap text-base leading-7">{guide.poem.text}</div>
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

function findSelectedDailySession(guide: GuideDetail | null, pageId: string | null) {
  if (!guide || !pageId) return null
  return guide.sessions.find((session) => pageId === dailyChunksId(session.id)) ?? null
}

function dailyChunksId(sessionId: string) {
  return `daily-chunks:${sessionId}`
}

function getChunksByExternalIds(guide: GuideDetail, chunkIds: string[]) {
  const chunkIdSet = new Set(chunkIds)
  return guide.poem.chunks.filter((chunk) => chunkIdSet.has(chunk.externalId))
}

function getEffectiveChunks(guide: GuideDetail, session: GuideSession, page: GuidePage) {
  const chunkIds =
    (page.type === "poem_chunk" || GAME_PAGE_TYPES.has(page.type)) && page.chunkIds.length === 0
      ? session.chunkIds
      : page.chunkIds
  const chunkIdSet = new Set(chunkIds)
  return guide.poem.chunks.filter((chunk) => chunkIdSet.has(chunk.externalId))
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
