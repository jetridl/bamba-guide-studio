import type { GuideDetail, GuidePage, GuideSession, PageType, ReviewComment, ValidationResult } from "@/lib/types"

export const PAGE_TYPES: PageType[] = [
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
export const APP_UNSUPPORTED_PAGE_TYPES = new Set<PageType>(["recap_previous", "whole_poem", "full_chunk_typing_game"])

export const GAME_PAGE_TYPES = new Set<PageType>([
  "first_letter_game",
  "first_word_game",
  "full_chunk_typing_game",
  "last_word_game",
  "first_last_word_game",
  "hidden_word_game",
])

const DAILY_PREFIX = "daily-chunks:"

export function dailyChunksId(sessionId: string) {
  return `${DAILY_PREFIX}${sessionId}`
}

export function isDailyChunksId(id: string | null): boolean {
  return Boolean(id?.startsWith(DAILY_PREFIX))
}

export function findSelectedPage(guide: GuideDetail | null, pageId: string | null) {
  if (!guide || !pageId) return null
  for (const session of guide.sessions) {
    const page = session.pages.find((candidate) => candidate.id === pageId)
    if (page) return { session, page }
  }
  return null
}

export function findSelectedDailySession(guide: GuideDetail | null, pageId: string | null) {
  if (!guide || !pageId) return null
  return guide.sessions.find((session) => pageId === dailyChunksId(session.id)) ?? null
}

/** Every page of every session, in reading order, for the page stepper. */
export function flattenPages(guide: GuideDetail | null): { session: GuideSession; page: GuidePage }[] {
  if (!guide) return []
  return guide.sessions.flatMap((session) => session.pages.map((page) => ({ session, page })))
}

export function knownPageId(guide: GuideDetail | null, pageId: string | null): boolean {
  if (!guide || !pageId) return false
  return Boolean(findSelectedPage(guide, pageId) || findSelectedDailySession(guide, pageId))
}

export function getChunksByExternalIds(guide: GuideDetail, chunkIds: string[]) {
  const chunkIdSet = new Set(chunkIds)
  return guide.poem.chunks.filter((chunk) => chunkIdSet.has(chunk.externalId))
}

export function getEffectiveChunks(guide: GuideDetail, session: GuideSession, page: GuidePage) {
  const chunkIds =
    (page.type === "poem_chunk" || GAME_PAGE_TYPES.has(page.type)) && page.chunkIds.length === 0
      ? session.chunkIds
      : page.chunkIds
  const chunkIdSet = new Set(chunkIds)
  return guide.poem.chunks.filter((chunk) => chunkIdSet.has(chunk.externalId))
}

export function patchGuidePage(guide: GuideDetail, pageId: string, payload: Record<string, unknown>): GuideDetail {
  return {
    ...guide,
    sessions: guide.sessions.map((session) => ({
      ...session,
      pages: session.pages.map((page) => (page.id === pageId ? ({ ...page, ...payload } as GuidePage) : page)),
    })),
  }
}

export function patchGuideSession(guide: GuideDetail, sessionId: string, payload: Record<string, unknown>): GuideDetail {
  return {
    ...guide,
    sessions: guide.sessions.map((session) => (session.id === sessionId ? ({ ...session, ...payload } as GuideSession) : session)),
  }
}

export function replaceSessionPages(guide: GuideDetail, sessionId: string, pages: GuidePage[]): GuideDetail {
  return {
    ...guide,
    sessions: guide.sessions.map((session) =>
      session.id === sessionId ? { ...session, pages: pages.map((page, orderIndex) => ({ ...page, orderIndex })) } : session,
    ),
  }
}

export function formatVersionTimestamp(timestamp?: string | null) {
  if (!timestamp) return "unsaved"
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp))
}

export function formatClock(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp))
}

/** Notes that still need an answer. */
export function openComments(comments: ReviewComment[]): ReviewComment[] {
  return comments.filter((comment) => comment.status === "open")
}

/** The notes for one page, plus the ones written about the whole guide. */
export function commentsForPage(
  comments: ReviewComment[],
  guide: GuideDetail,
  page: GuidePage | null,
): ReviewComment[] {
  return comments.filter(
    (comment) =>
      comment.targetType === "guide" || comment.targetId === page?.externalId || comment.targetId === guide.externalId,
  )
}

export function openCommentsForPage(comments: ReviewComment[], guide: GuideDetail, page: GuidePage | null) {
  return openComments(commentsForPage(comments, guide, page))
}

export type ReadinessCheck = {
  key: "approved" | "schema" | "issues" | "notes"
  label: string
  ok: boolean
  detail?: string
}

const SCHEMA_CODES = new Set(["schema", "export_build_failed"])
const COMMENT_CODE = "open_blocking_review_comment"

/**
 * The four conditions AGENTS.md puts on an export, read straight from the
 * backend's own validation result, so the Studio never claims more than it knows.
 */
export function readinessChecks(
  guide: GuideDetail,
  validation: ValidationResult | null,
  comments: ReviewComment[],
): ReadinessCheck[] {
  const blocking = (validation?.issues ?? []).filter((issue) => issue.severity === "blocking")
  const schemaIssues = blocking.filter((issue) => SCHEMA_CODES.has(issue.code))
  const commentIssues = blocking.filter((issue) => issue.code === COMMENT_CODE)
  const otherIssues = blocking.filter((issue) => !SCHEMA_CODES.has(issue.code) && issue.code !== COMMENT_CODE)
  const openBlocking = openComments(comments).filter((comment) => comment.severity === "blocking")
  const checked = validation !== null
  const approved = guide.status === "approved" || guide.status === "exported"

  return [
    {
      key: "approved",
      label: "Status is approved",
      ok: approved,
      detail: approved ? undefined : "Approve the guide when the rest is settled",
    },
    {
      key: "schema",
      label: "Schema check passes",
      ok: checked && schemaIssues.length === 0,
      detail: !checked ? "Checking" : schemaIssues.length ? `${schemaIssues.length} to fix` : undefined,
    },
    {
      key: "issues",
      label: "No blocking issues",
      ok: checked && otherIssues.length === 0,
      detail: !checked ? "Checking" : otherIssues.length ? `${otherIssues.length} to fix` : undefined,
    },
    {
      key: "notes",
      label: "No open blocking notes",
      ok: checked ? commentIssues.length === 0 && openBlocking.length === 0 : openBlocking.length === 0,
      detail: openBlocking.length ? `${openBlocking.length} still open` : undefined,
    },
  ]
}

export function warningCount(validation: ValidationResult | null): number {
  return (validation?.issues ?? []).filter((issue) => issue.severity === "warning").length
}

export function pageLabel(page: GuidePage): string {
  return page.title?.trim() || page.type
}

/** "Latest · v3" for the copy you edit, "v2" for a saved version. */
/** exports/ holds this version or a later one, so it cannot be published again. */
export function isPublished(item: { contentVersion: number; publishedVersion?: number | null }) {
  return item.publishedVersion != null && item.contentVersion <= item.publishedVersion
}

export function versionName(item: { version: number; contentVersion: number }) {
  return item.version === 0 ? `Latest · v${item.contentVersion}` : `v${item.version}`
}
