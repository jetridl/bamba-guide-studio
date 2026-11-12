import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router"

import { api } from "@/lib/api"
import type {
  GuideDetail,
  GuidePage,
  GuideVersionSummary,
  PublishResult,
  ReviewComment,
  ValidationResult,
} from "@/lib/types"
import {
  openComments,
  patchGuidePage,
  patchGuideSession,
  readinessChecks,
  replaceSessionPages,
  warningCount,
} from "@/features/editor/guideHelpers"

export type SaveState = "idle" | "saving" | "saved" | "error"

const SAVE_DELAY = 600

const UNSAVED = "Your last edits have not reached the Studio yet. Check the connection, then try again."

type PendingMap = Map<string, Record<string, unknown>>

/** Later edits win, but nothing a merge drops is lost. */
function merge(map: PendingMap, id: string, payload: Record<string, unknown>) {
  map.set(id, { ...(map.get(id) ?? {}), ...payload })
}

/** Put failed edits back, without overwriting anything typed since. */
function restore(map: PendingMap, entries: [string, Record<string, unknown>][]) {
  for (const [id, payload] of entries) {
    map.set(id, { ...payload, ...(map.get(id) ?? {}) })
  }
}

export function useGuideEditor(guideId: string) {
  const navigate = useNavigate()
  const [guide, setGuide] = useState<GuideDetail | null>(null)
  const [versions, setVersions] = useState<GuideVersionSummary[]>([])
  const [comments, setComments] = useState<ReviewComment[]>([])
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [saving, setSaving] = useState<SaveState>("idle")
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [published, setPublished] = useState<PublishResult | null>(null)

  const pendingPages = useRef<PendingMap>(new Map())
  const pendingSessions = useRef<PendingMap>(new Map())
  const timer = useRef<number | null>(null)
  const inFlight = useRef<Promise<boolean>>(Promise.resolve(true))

  const refreshValidation = useCallback(async (id: string) => {
    try {
      setValidation(await api.validateGuide(id))
    } catch {
      setValidation(null)
    }
  }, [])

  const load = useCallback(async () => {
    setError(null)
    try {
      const [guideData, commentData] = await Promise.all([api.getGuide(guideId), api.listReviewComments(guideId)])
      const versionData = await api.listGuideVersions(guideData.id)
      setGuide(guideData)
      setVersions(versionData)
      setComments(commentData)
      void refreshValidation(guideData.id)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load guide.")
    }
  }, [guideId, refreshValidation])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * Send every queued edit at once. Called on a pause, a move, and on leaving.
   * Returns false when the send failed, so the caller can stop instead of
   * acting on text the Studio has not stored.
   */
  const flush = useCallback((): Promise<boolean> => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
    // One send at a time: two in flight can arrive out of order, and the older
    // text would win.
    const next = inFlight.current.catch(() => false).then(async () => {
      const pages = [...pendingPages.current.entries()]
      const sessions = [...pendingSessions.current.entries()]
      if (pages.length === 0 && sessions.length === 0) return true
      pendingPages.current.clear()
      pendingSessions.current.clear()
      setSaving("saving")
      try {
        await Promise.all([
          ...pages.map(([pageId, payload]) => api.patchPage(pageId, payload)),
          ...sessions.map(([sessionId, payload]) => api.patchSession(sessionId, payload)),
        ])
        setSaving("saved")
        setSavedAt(Date.now())
        void refreshValidation(guideId)
        return true
      } catch {
        restore(pendingPages.current, pages)
        restore(pendingSessions.current, sessions)
        setSaving("error")
        return false
      }
    })
    inFlight.current = next
    return next
  }, [guideId, refreshValidation])

  const schedule = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void flush(), SAVE_DELAY)
  }, [flush])

  // A phone can be locked or switched away at any moment, so send what is queued.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush()
    }
    const onLeave = () => void flush()
    const onOnline = () => void flush()
    window.addEventListener("visibilitychange", onHide)
    window.addEventListener("pagehide", onLeave)
    // Back on the network: send what is still waiting, without a keystroke.
    window.addEventListener("online", onOnline)
    return () => {
      window.removeEventListener("visibilitychange", onHide)
      window.removeEventListener("pagehide", onLeave)
      window.removeEventListener("online", onOnline)
      void flush()
    }
  }, [flush])

  const updatePage = useCallback(
    (pageId: string, payload: Record<string, unknown>) => {
      setGuide((current) => current && patchGuidePage(current, pageId, payload))
      merge(pendingPages.current, pageId, payload)
      schedule()
    },
    [schedule],
  )

  const updateSession = useCallback(
    (sessionId: string, payload: Record<string, unknown>) => {
      setGuide((current) => current && patchGuideSession(current, sessionId, payload))
      merge(pendingSessions.current, sessionId, payload)
      schedule()
    },
    [schedule],
  )

  const runAction = useCallback(
    async (action: () => Promise<unknown>) => {
      setActionError(null)
      // Never act on a guide whose newest words are still on this device.
      if (!(await flush())) {
        setActionError(UNSAVED)
        return
      }
      try {
        await action()
        await load()
      } catch (caught) {
        setActionError(caught instanceof Error ? caught.message : "Action failed.")
      }
    },
    [flush, load],
  )

  const reorderPages = useCallback(
    async (sessionId: string, pages: GuidePage[]) => {
      setGuide((current) => current && replaceSessionPages(current, sessionId, pages))
      await api.reorderPages(
        sessionId,
        pages.map((page, index) => ({ id: page.id, orderIndex: index })),
      )
      await load()
    },
    [load],
  )

  const saveCurrentVersion = useCallback(async () => {
    if (!guide) return
    setActionError(null)
    if (!(await flush())) {
      setActionError(UNSAVED)
      return
    }
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
  }, [flush, guide, load, navigate])

  const restoreAsLatest = useCallback(async () => {
    if (!guide) return
    setActionError(null)
    try {
      const latest = await api.restoreLatest(guide.id)
      navigate(`/guides/${latest.id}`)
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Could not restore version.")
    }
  }, [guide, navigate])

  const publishGuide = useCallback(async () => {
    if (!guide) return
    setPublished(null)
    await runAction(async () => setPublished(await api.publishGuide(guide.id)))
  }, [guide, runAction])

  const exportGuide = useCallback(async () => {
    if (!guide) return
    await runAction(async () => {
      const blob = await api.exportGuide(guide.id)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `${guide.poem.externalId}_guided_plan.json`
      anchor.click()
      URL.revokeObjectURL(url)
    })
  }, [guide, runAction])

  const readOnly = Boolean(guide && guide.version > 0)
  const unanswered = useMemo(() => openComments(comments), [comments])
  const checks = useMemo(
    () => (guide ? readinessChecks(guide, validation, comments) : []),
    [comments, guide, validation],
  )
  const ready = checks.length > 0 && checks.every((check) => check.ok)
  const canApprove = Boolean(
    guide && !readOnly && guide.status !== "approved" && guide.status !== "exported" &&
      checks.filter((check) => check.key !== "approved").every((check) => check.ok),
  )

  return {
    guide,
    versions,
    comments,
    unanswered,
    validation,
    warnings: warningCount(validation),
    checks,
    ready,
    canApprove,
    readOnly,
    saving,
    savedAt,
    error,
    actionError,
    setActionError,
    published,
    setPublished,
    load,
    flush,
    refreshValidation: () => refreshValidation(guideId),
    updatePage,
    updateSession,
    reorderPages,
    createPage: (sessionId: string) => void runAction(() => api.createPage(sessionId)),
    duplicatePage: (pageId: string) => void runAction(() => api.duplicatePage(pageId)),
    deletePage: (pageId: string) => void runAction(() => api.deletePage(pageId)),
    approve: () => guide && void runAction(() => api.approveGuide(guide.id)),
    raiseVersion: () =>
      guide && void runAction(() => api.patchGuide(guide.id, { contentVersion: guide.nextFreeVersion ?? guide.contentVersion + 1 })),
    markInReview: () => guide && void runAction(() => api.markInReview(guide.id)),
    acceptComment: (commentId: string) => void runAction(() => api.acceptComment(commentId)),
    setCommentStatus: (commentId: string, status: ReviewComment["status"]) =>
      void runAction(() => api.setCommentStatus(commentId, status)),
    publishGuide,
    exportGuide,
    saveCurrentVersion,
    restoreAsLatest,
  }
}

export type GuideEditorState = ReturnType<typeof useGuideEditor>
