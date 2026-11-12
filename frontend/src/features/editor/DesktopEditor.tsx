import { useState } from "react"
import { Link } from "react-router"
import { ArrowLeft, MoreHorizontal } from "lucide-react"

import { ActionButton, IconButton } from "@/components/bamba/Button"
import { Segmented } from "@/components/bamba/Segmented"
import { Sheet } from "@/components/bamba/Sheet"
import { CountBadge, GuideStatusPill, NotPublishedPill, Pill } from "@/components/bamba/pills"
import { DailyChunksForm } from "@/features/editor/components/DailyChunksForm"
import { PageForm } from "@/features/editor/components/PageForm"
import { PagePreview } from "@/features/editor/components/PagePreview"
import { ReviewNotes } from "@/features/editor/components/ReviewNotes"
import { SaveState } from "@/features/editor/components/SaveState"
import { SessionsNavigator } from "@/features/editor/components/SessionsNavigator"
import {
  commentsForPage,
  findSelectedDailySession,
  findSelectedPage,
  formatVersionTimestamp,
  isPublished,
  openCommentsForPage,
  versionName,
} from "@/features/editor/guideHelpers"
import type { GuideEditorState } from "@/features/editor/useGuideEditor"
import { THREE_PANE_QUERY, useMediaQuery } from "@/lib/useMediaQuery"
import type { GuideDetail } from "@/lib/types"
import { cn } from "@/lib/utils"

type Tab = "preview" | "notes"

export function DesktopEditor({
  editor,
  guide,
  selectedPageId,
  onSelectPage,
  onOpenActions,
  onOpenPublish,
  banners,
}: {
  editor: GuideEditorState
  guide: GuideDetail
  selectedPageId: string | null
  onSelectPage: (pageId: string) => void
  onOpenActions: () => void
  onOpenPublish: () => void
  banners: React.ReactNode
}) {
  const [tab, setTab] = useState<Tab>("preview")
  const [railOpen, setRailOpen] = useState(false)
  const threePane = useMediaQuery(THREE_PANE_QUERY)

  const selected = findSelectedPage(guide, selectedPageId)
  const dailySession = findSelectedDailySession(guide, selectedPageId)
  const pageComments = commentsForPage(editor.comments, guide, selected?.page ?? null)
  const openCount = openCommentsForPage(editor.comments, guide, selected?.page ?? null).length
  const currentVersion = editor.versions.find((version) => version.id === guide.id)
  const approved = guide.status === "approved" || guide.status === "exported"
  const unsettled = editor.checks.filter((check) => !check.ok).length

  const rail = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="p-4 pb-3">
        <Segmented
          label="Preview or notes"
          value={tab}
          onChange={setTab}
          options={[
            { value: "preview", label: "Preview" },
            {
              value: "notes",
              label: "Notes",
              trailing: openCount ? <CountBadge tone="block">{openCount}</CountBadge> : undefined,
            },
          ]}
        />
      </div>
      {tab === "preview" ? (
        <div className="flex min-h-0 flex-1 justify-center overflow-hidden px-4 pb-5">
          <div className="flex w-[320px] flex-col overflow-hidden rounded-[28px] border border-bamba-border bg-bamba-bg-top shadow-sm">
            <PagePreview
              guide={guide}
              session={selected?.session ?? dailySession ?? null}
              page={selected?.page ?? null}
              className="min-h-0 flex-1"
            />
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5">
          <ReviewNotes
            comments={pageComments}
            readOnly={editor.readOnly}
            onAccept={editor.acceptComment}
            onStatus={editor.setCommentStatus}
          />
        </div>
      )}
    </div>
  )

  return (
    <div className="flex h-dvh flex-col bg-bamba-bg text-bamba-ink">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-bamba-border bg-bamba-surface px-5 py-2.5">
        <IconButton asChild aria-label="Back to guides">
          <Link to="/guides">
            <ArrowLeft />
          </Link>
        </IconButton>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-heading text-2xl leading-tight font-semibold">{guide.poem.title}</h1>
            <GuideStatusPill status={guide.status} />
            <Pill tone="neutral" className="font-normal">
              {versionName(currentVersion ?? guide)}
              {currentVersion?.timestamp ? ` · ${formatVersionTimestamp(currentVersion.timestamp)}` : ""}
            </Pill>
            {guide.version === 0 && !isPublished(guide) ? <NotPublishedPill publishedVersion={guide.publishedVersion} /> : null}
          </div>
          <p className="mt-0.5 flex items-center gap-2 text-[13px] text-bamba-muted">
            {guide.poem.author}
            <span aria-hidden="true">·</span>
            <SaveState state={editor.saving} savedAt={editor.savedAt} readOnly={editor.readOnly} onRetry={() => void editor.flush()} />
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenPublish}
          className={cn(
            "inline-flex h-10 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition",
            unsettled === 0
              ? "border-bamba-warn-border bg-bamba-chip-fill text-bamba-glow"
              : "border-bamba-block-border bg-bamba-block-fill text-bamba-block-ink",
          )}
        >
          <span className={cn("size-2 rounded-full", unsettled === 0 ? "bg-bamba-glow-dot" : "bg-bamba-block-ink")} />
          {editor.checks.length - unsettled} of {editor.checks.length} checks
        </button>
        {approved ? (
          <ActionButton variant="primary" size="compact" disabled={!editor.ready || editor.readOnly} onClick={onOpenPublish}>
            Publish
          </ActionButton>
        ) : (
          <ActionButton variant="primary" size="compact" disabled={!editor.canApprove} onClick={onOpenPublish}>
            Approve
          </ActionButton>
        )}
        <IconButton aria-label="More actions" onClick={onOpenActions}>
          <MoreHorizontal />
        </IconButton>
      </header>

      {banners}

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[320px] shrink-0 overflow-y-auto border-r border-bamba-border bg-bamba-bg-top md:block">
          <SessionsNavigator
            guide={guide}
            comments={editor.comments}
            selectedPageId={selectedPageId}
            readOnly={editor.readOnly}
            onSelectPage={onSelectPage}
            onCreatePage={editor.createPage}
            onDuplicatePage={editor.duplicatePage}
            onDeletePage={editor.deletePage}
            onReorderPages={editor.reorderPages}
          />
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto max-w-2xl">
            {dailySession ? (
              <>
                <div className="mb-4 flex items-baseline justify-between gap-3">
                  <h2 className="font-heading text-2xl font-semibold">Daily chunks</h2>
                  <span className="text-[13px] text-bamba-muted">Session {dailySession.sessionNumber}</span>
                </div>
                <DailyChunksForm
                  guide={guide}
                  session={dailySession}
                  readOnly={editor.readOnly}
                  onUpdateSession={editor.updateSession}
                />
              </>
            ) : selected ? (
              <>
                <div className="mb-4 flex items-baseline justify-between gap-3">
                  <h2 className="font-heading text-2xl font-semibold">
                    Page {selected.page.orderIndex + 1} of {selected.session.pages.length}
                  </h2>
                  <span className="truncate text-[13px] text-bamba-muted">
                    {selected.session.title} · Session {selected.session.sessionNumber}
                  </span>
                </div>
                <PageForm
                  guide={guide}
                  session={selected.session}
                  page={selected.page}
                  readOnly={editor.readOnly}
                  phone={false}
                  onUpdate={editor.updatePage}
                />
              </>
            ) : (
              <p className="text-sm text-bamba-muted">Choose a page to edit.</p>
            )}
          </div>
        </main>

        {threePane ? (
          <aside className="flex w-[400px] shrink-0 flex-col border-l border-bamba-border bg-bamba-bg-top">{rail}</aside>
        ) : null}
      </div>

      {!threePane ? (
        <>
          <div className="pointer-events-none fixed right-5 bottom-5 z-30 flex justify-end">
            <div className="pointer-events-auto flex rounded-full border border-bamba-border bg-bamba-surface p-1.5 shadow-md">
              <button
                type="button"
                onClick={() => {
                  setTab("preview")
                  setRailOpen(true)
                }}
                className="inline-flex h-11 items-center rounded-full px-5 text-[15px] font-semibold"
              >
                Preview
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab("notes")
                  setRailOpen(true)
                }}
                className="inline-flex h-11 items-center gap-2 rounded-full px-5 text-[15px] text-bamba-quiet"
              >
                Notes
                {openCount ? <CountBadge tone="block">{openCount}</CountBadge> : null}
              </button>
            </div>
          </div>
          <Sheet open={railOpen} onOpenChange={setRailOpen} title={tab === "preview" ? "Preview" : "Notes"}>
            {tab === "preview" ? (
              <div className="overflow-hidden rounded-3xl border border-bamba-border bg-bamba-bg-top">
                <PagePreview
                  guide={guide}
                  session={selected?.session ?? dailySession ?? null}
                  page={selected?.page ?? null}
                />
              </div>
            ) : (
              <ReviewNotes
                comments={pageComments}
                readOnly={editor.readOnly}
                onAccept={editor.acceptComment}
                onStatus={editor.setCommentStatus}
              />
            )}
          </Sheet>
        </>
      ) : null}
    </div>
  )
}
