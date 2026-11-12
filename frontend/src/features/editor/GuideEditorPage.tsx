import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router"

import { Banner } from "@/components/bamba/Banner"
import { DesktopEditor } from "@/features/editor/DesktopEditor"
import { PhoneEditor } from "@/features/editor/PhoneEditor"
import { GuideActionsSheet } from "@/features/editor/components/GuideActionsSheet"
import { PublishSheet } from "@/features/editor/components/Readiness"
import { isDailyChunksId, knownPageId } from "@/features/editor/guideHelpers"
import { useGuideEditor } from "@/features/editor/useGuideEditor"
import { useIsPhone } from "@/lib/useMediaQuery"

const PAGES_PREFIX = "pages/"

export function GuideEditorPage() {
  const params = useParams()
  const guideId = params.guideId ?? ""
  const rest = params["*"] ?? ""
  const navigate = useNavigate()
  const phone = useIsPhone()
  const editor = useGuideEditor(guideId)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)

  const selectedPageId = useMemo(() => {
    if (!rest.startsWith(PAGES_PREFIX)) return null
    const raw = rest.slice(PAGES_PREFIX.length)
    return raw ? decodeURIComponent(raw) : null
  }, [rest])

  const { guide, flush, refreshValidation } = editor

  const goToPage = useCallback(
    (pageId: string | null, replace: boolean) => {
      const path = pageId ? `/guides/${guideId}/pages/${encodeURIComponent(pageId)}` : `/guides/${guideId}`
      navigate(path, { replace })
    },
    [guideId, navigate],
  )

  // Keep the URL and the guide in step: a version switch, a deleted page, or a
  // daily-chunks id on a phone all land somewhere sensible.
  useEffect(() => {
    if (!guide) return
    const known = selectedPageId ? knownPageId(guide, selectedPageId) : false
    if (phone) {
      if (selectedPageId && (!known || isDailyChunksId(selectedPageId))) goToPage(null, true)
      return
    }
    if (known) return
    const first = guide.sessions[0]?.pages[0]?.id
    if (first) goToPage(first, true)
  }, [goToPage, guide, phone, selectedPageId])

  const selectPage = useCallback(
    (pageId: string) => {
      void flush()
      // The phone pushes, so the back button walks back through the guide.
      goToPage(pageId, !phone)
    },
    [flush, goToPage, phone],
  )

  const openPublish = useCallback(() => {
    void flush().then(() => refreshValidation())
    setPublishOpen(true)
  }, [flush, refreshValidation])

  if (editor.error) {
    return (
      <main className="min-h-dvh bg-bamba-bg p-6 text-bamba-ink">
        <Banner tone="warn" role="alert">
          {editor.error}
        </Banner>
      </main>
    )
  }
  if (!guide) {
    return <main className="min-h-dvh bg-bamba-bg p-6 text-sm text-bamba-muted">Loading editor...</main>
  }

  const banners = (
    <>
      {editor.actionError ? (
        <Banner tone="warn" role="alert" onDismiss={() => editor.setActionError(null)}>
          {editor.actionError}
        </Banner>
      ) : null}
      {editor.published ? (
        <Banner role="status" onDismiss={() => editor.setPublished(null)}>
          <p>
            Published to <code className="font-mono text-xs break-all">{editor.published.path}</code>
            {editor.published.link ? (
              <>
                {" "}
                and linked from <code className="font-mono text-xs break-all">{editor.published.link}</code>
              </>
            ) : null}
            .
          </p>
          {editor.published.warnings.map((warning) => (
            <p key={warning} className="mt-1 text-bamba-warn-ink">
              {warning}
            </p>
          ))}
          <p className="mt-1 text-bamba-muted">
            Next: commit and push on the MacBook, then advance the content pin in Bamba and run its sync tool.
          </p>
        </Banner>
      ) : null}
      {editor.readOnly ? (
        <Banner>This is a saved version, so it is read only. Use it as the latest to edit it again.</Banner>
      ) : null}
    </>
  )

  const sheets = (
    <>
      <GuideActionsSheet
        open={actionsOpen}
        onOpenChange={setActionsOpen}
        guide={guide}
        versions={editor.versions}
        onSaveVersion={() => void editor.saveCurrentVersion()}
        onRestoreLatest={() => void editor.restoreAsLatest()}
        onExport={() => void editor.exportGuide()}
        onMarkInReview={() => editor.markInReview()}
        onSelectVersion={(versionGuideId) => navigate(`/guides/${versionGuideId}`)}
      />
      <PublishSheet
        open={publishOpen}
        onOpenChange={setPublishOpen}
        guide={guide}
        checks={editor.checks}
        warnings={editor.warnings}
        ready={editor.ready}
        canApprove={editor.canApprove}
        readOnly={editor.readOnly}
        onApprove={() => {
          setPublishOpen(false)
          editor.approve()
        }}
        onPublish={() => {
          setPublishOpen(false)
          void editor.publishGuide()
        }}
        onRaiseVersion={editor.raiseVersion}
      />
    </>
  )

  if (phone) {
    return (
      <>
        <PhoneEditor
          editor={editor}
          guide={guide}
          selectedPageId={selectedPageId}
          onSelectPage={selectPage}
          onBack={() => {
            void flush()
            goToPage(null, false)
          }}
          onOpenActions={() => setActionsOpen(true)}
          onOpenPublish={openPublish}
          banners={banners}
        />
        {sheets}
      </>
    )
  }

  return (
    <>
      <DesktopEditor
        editor={editor}
        guide={guide}
        selectedPageId={selectedPageId}
        onSelectPage={selectPage}
        onOpenActions={() => setActionsOpen(true)}
        onOpenPublish={openPublish}
        banners={
          editor.actionError || editor.published || editor.readOnly ? (
            <div className="flex shrink-0 flex-col gap-2 border-b border-bamba-border bg-bamba-bg px-5 py-3">{banners}</div>
          ) : null
        }
      />
      {sheets}
    </>
  )
}
