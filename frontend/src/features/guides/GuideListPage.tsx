import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router"
import { FileJson, MoreHorizontal, RefreshCw } from "lucide-react"

import { PageTitle, StudioShell } from "@/components/StudioShell"
import { ActionList } from "@/components/bamba/ActionList"
import { Banner } from "@/components/bamba/Banner"
import { ActionButton, IconButton } from "@/components/bamba/Button"
import { ChipRow } from "@/components/bamba/Segmented"
import { Sheet } from "@/components/bamba/Sheet"
import { ListRow, ListSurface } from "@/components/bamba/Surface"
import { GuideStatusPill, StateDot, statusLabel, statusTone } from "@/components/bamba/pills"
import { api } from "@/lib/api"
import type { GuideStatus, GuideSummary } from "@/lib/types"

type Filter = "all" | GuideStatus

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "in_review", label: "In review" },
  { value: "approved", label: "Approved" },
  { value: "draft", label: "Draft" },
  { value: "exported", label: "Exported" },
]

export function GuideListPage() {
  const [guides, setGuides] = useState<GuideSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>("all")
  const [menuOpen, setMenuOpen] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setGuides(await api.listGuides())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load guides.")
    } finally {
      setLoading(false)
    }
  }

  async function refresh() {
    setMenuOpen(false)
    setRefreshing(true)
    setError(null)
    setNotice(null)
    try {
      const result = await api.refreshGuides()
      const parts = [
        result.loaded.length
          ? `Added ${result.loaded.length} new ${result.loaded.length === 1 ? "guide" : "guides"}: ${result.loaded.join(", ")}.`
          : "No new guides in guides/json.",
      ]
      if (result.failed.length) {
        parts.push(`Could not import: ${result.failed.join(", ")}. See the backend log for details.`)
      }
      setNotice(parts.join(" "))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not check guides/json.")
    } finally {
      setRefreshing(false)
    }
    await load()
  }

  const shown = useMemo(
    () => (filter === "all" ? guides : guides.filter((guide) => guide.status === filter)),
    [filter, guides],
  )

  useEffect(() => {
    void load()
  }, [])

  return (
    <StudioShell
      active="guides"
      actions={
        <>
          <div className="hidden items-center gap-2 md:flex">
            <ActionButton size="compact" disabled={refreshing} onClick={() => void refresh()}>
              <RefreshCw className={refreshing ? "animate-spin" : undefined} />
              {refreshing ? "Checking" : "Refresh"}
            </ActionButton>
            <ActionButton size="compact" variant="primary" asChild>
              <Link to="/guides/import">
                <FileJson />
                Import guide
              </Link>
            </ActionButton>
          </div>
          <IconButton className="md:hidden" aria-label="More actions" onClick={() => setMenuOpen(true)}>
            <MoreHorizontal />
          </IconButton>
        </>
      }
    >
      <PageTitle title="Guides" subtitle="Curated poem plans, ready to read through." />

      <ChipRow label="Filter guides" value={filter} options={FILTERS} onChange={setFilter} className="mb-4" />

      <div className="mb-2.5 flex items-baseline justify-between text-[13px] text-bamba-muted">
        <span>
          {shown.length} {shown.length === 1 ? "guide" : "guides"}
          {filter === "all" ? "" : ` · ${statusLabel(filter).toLowerCase()}`}
        </span>
        <span>Newest first</span>
      </div>

      <div className="flex flex-col gap-4">
        {notice ? <Banner onDismiss={() => setNotice(null)}>{notice}</Banner> : null}
        {error ? (
          <Banner tone="warn" role="alert">
            {error}
          </Banner>
        ) : null}
        {loading ? <p className="text-sm text-bamba-muted">Loading guides...</p> : null}

        {!loading && guides.length === 0 && !error ? (
          <ListSurface>
            <div className="px-5 py-8 text-center">
              <h2 className="font-heading text-2xl font-semibold">Nothing here yet</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-bamba-muted">
                Import a draft guided-plan JSON file to begin editing.
              </p>
              <ActionButton variant="primary" className="mt-5" asChild>
                <Link to="/guides/import">
                  <FileJson />
                  Import JSON
                </Link>
              </ActionButton>
            </div>
          </ListSurface>
        ) : null}

        {shown.length > 0 ? (
          <ListSurface>
            {shown.map((guide) => (
              <ListRow key={guide.id} to={`/guides/${guide.id}`} className="items-start py-4">
                <span className="min-w-0 flex-1">
                  <span className="block font-heading text-[21px] leading-tight font-semibold">{guide.title}</span>
                  <span className="mt-0.5 block text-sm text-bamba-muted">
                    {guide.poemTitle} by {guide.poemAuthor} · {guide.sessionCount}{" "}
                    {guide.sessionCount === 1 ? "session" : "sessions"}
                    {guide.savedVersionCount ? ` · ${guide.savedVersionCount} saved` : ""}
                  </span>
                  <span className="mt-2 flex items-center gap-2 text-[13px] font-semibold text-bamba-quiet md:hidden">
                    <StateDot tone={statusTone(guide.status)} label={statusLabel(guide.status)} />
                    {statusLabel(guide.status)}
                  </span>
                </span>
                <GuideStatusPill status={guide.status} className="mt-0.5 hidden md:inline-flex" />
              </ListRow>
            ))}
          </ListSurface>
        ) : null}

        {!loading && guides.length > 0 && shown.length === 0 ? (
          <p className="rounded-xl border border-bamba-border bg-bamba-surface p-5 text-sm text-bamba-muted">
            No guide matches that filter right now.
          </p>
        ) : null}
      </div>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen} title="Guides">
        <ActionList
          items={[
            {
              key: "refresh",
              icon: RefreshCw,
              title: refreshing ? "Checking" : "Refresh",
              description: "Look in guides/json for new drafts",
              onSelect: () => void refresh(),
            },
            {
              key: "import",
              icon: FileJson,
              title: "Import guide",
              description: "Paste or pick a guided-plan JSON file",
              to: "/guides/import",
            },
          ]}
        />
      </Sheet>
    </StudioShell>
  )
}
