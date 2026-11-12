import { useState } from "react"
import { ArrowLeft, Check, Download, Eye, FileJson, History, Save, SunMoon } from "lucide-react"

import { ActionList, type ActionItem } from "@/components/bamba/ActionList"
import { ActionButton } from "@/components/bamba/Button"
import { Sheet } from "@/components/bamba/Sheet"
import { ListRow, ListSurface } from "@/components/bamba/Surface"
import { THEME_LABELS, useTheme } from "@/lib/theme"
import { formatVersionTimestamp, versionName } from "@/features/editor/guideHelpers"
import type { GuideDetail, GuideVersionSummary } from "@/lib/types"
import { statusLabel } from "@/components/bamba/pills"

/**
 * Everything the header used to carry, as a Bamba actions menu:
 * an icon, a title, and a line that says what it does.
 */
export function GuideActionsSheet({
  open,
  onOpenChange,
  guide,
  versions,
  onSaveVersion,
  onRestoreLatest,
  onExport,
  onMarkInReview,
  onSelectVersion,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  guide: GuideDetail
  versions: GuideVersionSummary[]
  onSaveVersion: () => void
  onRestoreLatest: () => void
  onExport: () => void
  onMarkInReview: () => void
  onSelectVersion: (guideId: string) => void
}) {
  const [view, setView] = useState<"menu" | "versions">("menu")
  const { choice, cycle } = useTheme()
  const isLatest = guide.version === 0

  function close() {
    onOpenChange(false)
    setView("menu")
  }

  const items: ActionItem[] = [
    {
      key: "versions",
      icon: History,
      title: "Version history",
      description: "Read any version Studio holds",
      trailing: versions.length > 1 ? `${versions.length}` : undefined,
      onSelect: () => setView("versions"),
    },
    isLatest
      ? {
          key: "save-version",
          icon: Save,
          title: "Save version",
          description: `Keep this copy as version ${guide.contentVersion}`,
          onSelect: () => {
            close()
            onSaveVersion()
          },
        }
      : {
          key: "restore",
          icon: Save,
          title: "Use as latest",
          description: "Edit this version. Studio keeps the latest copy as a version first",
          onSelect: () => {
            close()
            onRestoreLatest()
          },
        },
    {
      key: "mark-in-review",
      icon: Eye,
      title: "Mark in review",
      description: "Say that the guide is waiting for notes",
      disabled: guide.status !== "draft",
      disabledHint: guide.status === "draft" ? undefined : "Only a draft can go into review",
      onSelect: () => {
        close()
        onMarkInReview()
      },
    },
    {
      key: "download",
      icon: Download,
      title: "Download JSON",
      description: "The guide file, without publishing it",
      onSelect: () => {
        close()
        onExport()
      },
    },
    {
      key: "import-review",
      icon: FileJson,
      title: "Import review",
      description: "Load a review JSON file",
      to: `/guides/${guide.id}/reviews/import`,
    },
    {
      key: "theme",
      icon: SunMoon,
      title: "Theme",
      description: "Day, night, or follow the device",
      trailing: THEME_LABELS[choice],
      onSelect: cycle,
    },
  ]

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setView("menu")
      }}
      title={view === "menu" ? guide.poem.title : "Version history"}
      description={view === "menu" ? guide.poem.author : "Older versions open read only."}
    >
      {view === "menu" ? (
        <ActionList items={items} />
      ) : (
        <>
          <ListSurface>
            {versions.map((version) => (
              <ListRow
                key={version.id}
                selected={version.id === guide.id}
                onClick={() => {
                  close()
                  onSelectVersion(version.id)
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium">{versionName(version)}</span>
                  <span className="block text-[13px] text-bamba-muted">
                    {statusLabel(version.status)} · {formatVersionTimestamp(version.timestamp)}
                  </span>
                </span>
                {version.id === guide.id ? <Check className="size-5 shrink-0 text-bamba-glow" /> : null}
              </ListRow>
            ))}
          </ListSurface>
          <ActionButton className="mt-4 w-full" onClick={() => setView("menu")}>
            <ArrowLeft />
            Back
          </ActionButton>
        </>
      )}
    </Sheet>
  )
}
