import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router"
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react"

import { ActionButton, IconButton } from "@/components/bamba/Button"
import { Segmented } from "@/components/bamba/Segmented"
import { ListRow, ListSurface, SectionHeading } from "@/components/bamba/Surface"
import { CountBadge, GuideStatusPill, NotPublishedPill, Pill, StateDot } from "@/components/bamba/pills"
import { PageForm } from "@/features/editor/components/PageForm"
import { PagePreview } from "@/features/editor/components/PagePreview"
import { ReadinessStrip } from "@/features/editor/components/Readiness"
import { ReviewNotes } from "@/features/editor/components/ReviewNotes"
import { SaveState } from "@/features/editor/components/SaveState"
import {
  commentsForPage,
  findSelectedPage,
  flattenPages,
  isPublished,
  openCommentsForPage,
  pageLabel,
  versionName,
} from "@/features/editor/guideHelpers"
import type { GuideEditorState } from "@/features/editor/useGuideEditor"
import type { GuideDetail, ReviewComment } from "@/lib/types"

type Tab = "edit" | "preview" | "notes"

const BOTTOM_BAR =
  "fixed inset-x-0 bottom-0 z-30 border-t border-bamba-border bg-bamba-bg/95 px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-sm"

export function PhoneEditor({
  editor,
  guide,
  selectedPageId,
  onSelectPage,
  onBack,
  onOpenActions,
  onOpenPublish,
  banners,
}: {
  editor: GuideEditorState
  guide: GuideDetail
  selectedPageId: string | null
  onSelectPage: (pageId: string) => void
  onBack: () => void
  onOpenActions: () => void
  onOpenPublish: () => void
  banners: React.ReactNode
}) {
  const selected = findSelectedPage(guide, selectedPageId)
  if (!selected) {
    return (
      <GuideOverview
        editor={editor}
        guide={guide}
        onSelectPage={onSelectPage}
        onOpenActions={onOpenActions}
        onOpenPublish={onOpenPublish}
        banners={banners}
      />
    )
  }
  return (
    <PageScreen
      editor={editor}
      guide={guide}
      selected={selected}
      onSelectPage={onSelectPage}
      onBack={onBack}
      onOpenActions={onOpenActions}
      banners={banners}
    />
  )
}

function PhoneHeader({
  back,
  label,
  onOpenActions,
}: {
  back: { to: string } | { onClick: () => void }
  label: string
  onOpenActions: () => void
}) {
  const inner = (
    <>
      <ChevronLeft className="size-5" />
      <span className="truncate">{label}</span>
    </>
  )
  return (
    <header className="flex items-center gap-2 px-3 pt-3 pb-1">
      {"to" in back ? (
        <Link
          to={back.to}
          className="inline-flex h-11 min-w-0 flex-1 items-center gap-1.5 px-2 text-base text-bamba-quiet no-underline"
        >
          {inner}
        </Link>
      ) : (
        <button
          type="button"
          onClick={back.onClick}
          className="inline-flex h-11 min-w-0 flex-1 items-center gap-1.5 px-2 text-left text-base text-bamba-quiet"
        >
          {inner}
        </button>
      )}
      <IconButton aria-label="More actions" onClick={onOpenActions}>
        <MoreHorizontal />
      </IconButton>
    </header>
  )
}

function GuideOverview({
  editor,
  guide,
  onSelectPage,
  onOpenActions,
  onOpenPublish,
  banners,
}: {
  editor: GuideEditorState
  guide: GuideDetail
  onSelectPage: (pageId: string) => void
  onOpenActions: () => void
  onOpenPublish: () => void
  banners: React.ReactNode
}) {
  const approved = guide.status === "approved" || guide.status === "exported"
  const blocked = approved ? !editor.ready : !editor.canApprove

  return (
    <div className="min-h-dvh bg-linear-to-b from-bamba-bg-top to-bamba-bg pb-36 text-bamba-ink">
      <PhoneHeader back={{ to: "/guides" }} label="Guides" onOpenActions={onOpenActions} />

      <div className="px-5 pt-1">
        <h1 className="font-heading text-[34px] leading-tight font-semibold">{guide.poem.title}</h1>
        <p className="mt-1 text-[15px] text-bamba-muted">by {guide.poem.author}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <GuideStatusPill status={guide.status} />
          <Pill tone="neutral" className="font-normal">
            {versionName(guide)}
          </Pill>
          {guide.version === 0 && !isPublished(guide) ? <NotPublishedPill publishedVersion={guide.publishedVersion} /> : null}
          <SaveState state={editor.saving} savedAt={editor.savedAt} readOnly={editor.readOnly} onRetry={() => void editor.flush()} />
        </div>
      </div>

      <div className="flex flex-col gap-4 px-5 pt-4">
        {banners}
        <ReadinessStrip
          checks={editor.checks}
          published={isPublished(guide) ? guide.contentVersion : null}
          onOpen={onOpenPublish}
        />
      </div>

      <div className="flex flex-col gap-6 px-5 pt-6">
        {guide.sessions.map((session) => (
          <section key={session.id}>
            <SectionHeading
              title={session.title}
              meta={`Session ${session.sessionNumber} · ${session.pages.length} ${session.pages.length === 1 ? "page" : "pages"}`}
            />
            <ListSurface>
              {session.pages.map((page) => {
                const open = openCommentsForPage(editor.comments, guide, page).filter(
                  (comment) => comment.targetId === page.externalId,
                )
                const blocking = open.some((comment) => comment.severity === "blocking")
                return (
                  <ListRow key={page.id} onClick={() => onSelectPage(page.id)}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium">{pageLabel(page)}</span>
                      <span className="block truncate text-[13px] text-bamba-muted">{page.type}</span>
                    </span>
                    {open.length > 0 ? (
                      <StateDot tone={blocking ? "block" : "warn"} label={blocking ? "Blocking note" : "Note"} />
                    ) : null}
                    <ChevronRight className="size-4 shrink-0 text-bamba-hint" />
                  </ListRow>
                )
              })}
            </ListSurface>
            {session.chunkIds.length > 0 ? (
              <p className="mt-2 px-1 text-[13px] text-bamba-hint">
                {session.chunkIds.length} {session.chunkIds.length === 1 ? "chunk" : "chunks"} for this session. Change
                them on the laptop.
              </p>
            ) : null}
          </section>
        ))}
        <p className="px-1 text-[13px] leading-relaxed text-bamba-hint">
          Add, delete and reorder pages on the laptop. Here you can edit the words, settle the notes, approve and
          publish.
        </p>
      </div>

      <div className={BOTTOM_BAR}>
        <ActionButton
          variant="primary"
          size="pinned"
          disabled={blocked || editor.readOnly}
          onClick={approved ? onOpenPublish : onOpenPublish}
        >
          {approved ? "Publish" : "Approve"}
        </ActionButton>
        {blocked ? (
          <p className="mt-2 text-center text-[13px] text-bamba-hint">
            {editor.readOnly
              ? "This is a saved version. Open the latest to edit."
              : `Settle ${editor.checks.filter((check) => !check.ok && check.key !== "approved").length} open ${
                  editor.checks.filter((check) => !check.ok && check.key !== "approved").length === 1 ? "check" : "checks"
                } first.`}
          </p>
        ) : null}
      </div>
    </div>
  )
}

function PageScreen({
  editor,
  guide,
  selected,
  onSelectPage,
  onBack,
  onOpenActions,
  banners,
}: {
  editor: GuideEditorState
  guide: GuideDetail
  selected: NonNullable<ReturnType<typeof findSelectedPage>>
  onSelectPage: (pageId: string) => void
  onBack: () => void
  onOpenActions: () => void
  banners: React.ReactNode
}) {
  const [tab, setTab] = useState<Tab>("edit")
  const { session, page } = selected
  const pages = useMemo(() => flattenPages(guide), [guide])
  const index = pages.findIndex((entry) => entry.page.id === page.id)
  const previous = index > 0 ? pages[index - 1] : null
  const next = index >= 0 && index < pages.length - 1 ? pages[index + 1] : null
  const pageComments: ReviewComment[] = commentsForPage(editor.comments, guide, page)

  // A tap on Next should open the next page at its beginning.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [page.id])
  const openCount = openCommentsForPage(editor.comments, guide, page).length

  return (
    <div className="min-h-dvh bg-linear-to-b from-bamba-bg-top to-bamba-bg pb-32 text-bamba-ink">
      <PhoneHeader back={{ onClick: onBack }} label={guide.poem.title} onOpenActions={onOpenActions} />

      <div className="flex items-baseline justify-between gap-3 px-5 pt-1 pb-3 text-[13px] text-bamba-muted">
        <span className="truncate">
          Session {session.sessionNumber} · page {page.orderIndex + 1} of {session.pages.length}
        </span>
        <SaveState state={editor.saving} savedAt={editor.savedAt} readOnly={editor.readOnly} onRetry={() => void editor.flush()} />
      </div>

      <div className="px-5">
        <Segmented
          label="Edit, preview or notes"
          value={tab}
          onChange={setTab}
          options={[
            { value: "edit", label: "Edit" },
            { value: "preview", label: "Preview" },
            {
              value: "notes",
              label: "Notes",
              trailing: openCount ? <CountBadge tone="block">{openCount}</CountBadge> : undefined,
            },
          ]}
        />
      </div>

      <div className="flex flex-col gap-4 px-5 pt-5">
        {banners}
        {tab === "edit" ? (
          <PageForm
            guide={guide}
            session={session}
            page={page}
            readOnly={editor.readOnly}
            phone
            onUpdate={editor.updatePage}
          />
        ) : null}
        {tab === "preview" ? (
          <div className="overflow-hidden rounded-3xl border border-bamba-border bg-bamba-bg-top">
            <PagePreview guide={guide} session={session} page={page} />
          </div>
        ) : null}
        {tab === "notes" ? (
          <ReviewNotes
            comments={pageComments}
            readOnly={editor.readOnly}
            onAccept={editor.acceptComment}
            onStatus={editor.setCommentStatus}
          />
        ) : null}
      </div>

      <div className={BOTTOM_BAR}>
        <div className="flex items-center gap-2.5">
          <ActionButton
            className="size-14 shrink-0 p-0"
            disabled={!previous}
            onClick={() => previous && onSelectPage(previous.page.id)}
            aria-label="Previous page"
          >
            <ChevronLeft />
          </ActionButton>
          <ActionButton
            variant="primary"
            size="pinned"
            className="w-auto flex-1"
            onClick={() => (next ? onSelectPage(next.page.id) : onBack())}
          >
            {next ? "Next page" : "Back to the guide"}
          </ActionButton>
        </div>
      </div>
    </div>
  )
}
