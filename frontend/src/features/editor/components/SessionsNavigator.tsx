import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core"
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Copy, GripVertical, Plus, Trash2 } from "lucide-react"

import { IconButton } from "@/components/bamba/Button"
import { ListSurface } from "@/components/bamba/Surface"
import { StateDot } from "@/components/bamba/pills"
import { dailyChunksId, openCommentsForPage, pageLabel } from "@/features/editor/guideHelpers"
import type { GuideDetail, GuidePage, GuideSession, ReviewComment } from "@/lib/types"
import { cn } from "@/lib/utils"

/** The laptop navigator: sessions, pages, and the structural work. */
export function SessionsNavigator({
  guide,
  comments,
  selectedPageId,
  readOnly,
  onSelectPage,
  onCreatePage,
  onDuplicatePage,
  onDeletePage,
  onReorderPages,
}: {
  guide: GuideDetail
  comments: ReviewComment[]
  selectedPageId: string | null
  readOnly: boolean
  onSelectPage: (pageId: string) => void
  onCreatePage: (sessionId: string) => void
  onDuplicatePage: (pageId: string) => void
  onDeletePage: (pageId: string) => void
  onReorderPages: (sessionId: string, pages: GuidePage[]) => Promise<void>
}) {
  return (
    <div className="flex flex-col gap-5 p-4">
      {guide.sessions.map((session) => (
        <section key={session.id}>
          <div className="mb-2 flex items-start justify-between gap-2 px-1.5">
            <div className="min-w-0">
              <h2 className="truncate font-heading text-lg font-semibold">{session.title}</h2>
              <p className="text-xs text-bamba-muted">
                Session {session.sessionNumber} · {session.pages.length}{" "}
                {session.pages.length === 1 ? "page" : "pages"}
              </p>
            </div>
            <IconButton
              tone="plain"
              className="size-10 shrink-0"
              disabled={readOnly}
              onClick={() => onCreatePage(session.id)}
              aria-label={`Add a page to ${session.title}`}
              title="Add a page"
            >
              <Plus />
            </IconButton>
          </div>
          <SortablePages
            guide={guide}
            comments={comments}
            session={session}
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
  )
}

function SortablePages({
  guide,
  comments,
  session,
  readOnly,
  selectedPageId,
  onSelectPage,
  onDuplicatePage,
  onDeletePage,
  onReorder,
}: {
  guide: GuideDetail
  comments: ReviewComment[]
  session: GuideSession
  readOnly: boolean
  selectedPageId: string | null
  onSelectPage: (pageId: string) => void
  onDuplicatePage: (pageId: string) => void
  onDeletePage: (pageId: string) => void
  onReorder: (pages: GuidePage[]) => Promise<void>
}) {
  const pages = session.pages

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (readOnly || !over || active.id === over.id) return
    const oldIndex = pages.findIndex((page) => page.id === active.id)
    const newIndex = pages.findIndex((page) => page.id === over.id)
    await onReorder(arrayMove(pages, oldIndex, newIndex))
  }

  const dailyId = dailyChunksId(session.id)

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={(event) => void handleDragEnd(event)}>
      <SortableContext items={pages.map((page) => page.id)} strategy={verticalListSortingStrategy}>
        <ListSurface>
          <button
            type="button"
            onClick={() => onSelectPage(dailyId)}
            className={cn(
              "flex min-h-12 w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition",
              selectedPageId === dailyId ? "bg-bamba-chip-fill font-semibold" : "hover:bg-bamba-chip-fill/60",
            )}
          >
            <span className="w-4 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block truncate">Daily chunks</span>
              <span className="block text-xs text-bamba-muted">{session.chunkIds.length} linked</span>
            </span>
          </button>
          {pages.map((page) => (
            <SortablePageNode
              key={page.id}
              guide={guide}
              comments={comments}
              page={page}
              readOnly={readOnly}
              selected={selectedPageId === page.id}
              onSelect={() => onSelectPage(page.id)}
              onDuplicate={() => onDuplicatePage(page.id)}
              onDelete={() => onDeletePage(page.id)}
            />
          ))}
        </ListSurface>
      </SortableContext>
    </DndContext>
  )
}

function SortablePageNode({
  guide,
  comments,
  page,
  readOnly,
  selected,
  onSelect,
  onDuplicate,
  onDelete,
}: {
  guide: GuideDetail
  comments: ReviewComment[]
  page: GuidePage
  readOnly: boolean
  selected: boolean
  onSelect: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const sortable = useSortable({ id: page.id, disabled: readOnly })
  const style = { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }
  const open = openCommentsForPage(comments, guide, page).filter((comment) => comment.targetId === page.externalId)
  const blocking = open.some((comment) => comment.severity === "blocking")

  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      className={cn(
        "flex min-h-12 items-center gap-1.5 px-3 py-2 text-sm transition",
        selected ? "bg-bamba-chip-fill" : "hover:bg-bamba-chip-fill/60",
      )}
    >
      <button
        type="button"
        className="shrink-0 cursor-grab p-1 text-bamba-hint disabled:cursor-default disabled:opacity-40"
        disabled={readOnly}
        aria-label={`Reorder ${pageLabel(page)}`}
        {...sortable.attributes}
        {...sortable.listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <button type="button" className="min-w-0 flex-1 truncate py-1 text-left" onClick={onSelect}>
        <span className={cn("block truncate", selected && "font-semibold")}>{pageLabel(page)}</span>
        <span className="block truncate text-xs text-bamba-muted">{page.type}</span>
      </button>
      {open.length > 0 ? (
        <StateDot
          tone={blocking ? "block" : "warn"}
          label={blocking ? "Has a blocking note" : "Has a note"}
          className="mr-1 shrink-0"
        />
      ) : null}
      <IconButton
        tone="plain"
        className="size-9 shrink-0"
        disabled={readOnly}
        onClick={onDuplicate}
        aria-label={`Duplicate ${pageLabel(page)}`}
        title="Duplicate"
      >
        <Copy className="size-4" />
      </IconButton>
      <IconButton
        tone="plain"
        className="size-9 shrink-0"
        disabled={readOnly}
        onClick={onDelete}
        aria-label={`Delete ${pageLabel(page)}`}
        title="Delete"
      >
        <Trash2 className="size-4" />
      </IconButton>
    </div>
  )
}
