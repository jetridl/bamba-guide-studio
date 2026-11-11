import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router"
import { MoreHorizontal, Plus, RefreshCw } from "lucide-react"

import { PageTitle, StudioShell } from "@/components/StudioShell"
import { ActionList } from "@/components/bamba/ActionList"
import { Banner } from "@/components/bamba/Banner"
import { ActionButton, IconButton } from "@/components/bamba/Button"
import { ChipRow } from "@/components/bamba/Segmented"
import { Sheet } from "@/components/bamba/Sheet"
import { ListRow, ListSurface } from "@/components/bamba/Surface"
import { GuideStatusPill, Pill, StateDot, statusLabel, statusTone } from "@/components/bamba/pills"
import { journeyApi, type Journey } from "@/lib/journeyApi"
import type { GuideStatus } from "@/lib/types"

type Filter = "all" | GuideStatus

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "in_review", label: "In review" },
  { value: "approved", label: "Approved" },
  { value: "exported", label: "Exported" },
]

export function JourneyListPage() {
  const [journeys, setJourneys] = useState<Journey[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>("all")
  const [menuOpen, setMenuOpen] = useState(false)

  async function load() {
    setLoading(true)
    try {
      setJourneys(await journeyApi.list())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load Journeys.")
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
      const result = await journeyApi.refresh()
      const lines = [
        result.loaded.length
          ? `Added ${result.loaded.length} new ${result.loaded.length === 1 ? "Journey" : "Journeys"}: ${result.loaded.join(", ")}.`
          : "No new Journeys in guides/journeys.",
      ]
      if (result.problems.length) {
        lines.push("Could not import:", ...result.problems.map((problem) => `• ${problem}`))
      }
      setNotice(lines.join("\n"))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not check guides/journeys.")
    } finally {
      setRefreshing(false)
    }
    await load()
  }

  useEffect(() => {
    void load()
  }, [])

  const shown = useMemo(
    () => (filter === "all" ? journeys : journeys.filter((journey) => journey.status === filter)),
    [filter, journeys],
  )

  return (
    <StudioShell
      active="journeys"
      actions={
        <>
          <div className="hidden items-center gap-2 md:flex">
            <ActionButton size="compact" disabled={refreshing} onClick={() => void refresh()}>
              <RefreshCw className={refreshing ? "animate-spin" : undefined} />
              {refreshing ? "Checking" : "Refresh"}
            </ActionButton>
            <ActionButton size="compact" variant="primary" asChild>
              <Link to="/journeys/new">
                <Plus />
                New Journey
              </Link>
            </ActionButton>
          </div>
          <IconButton className="md:hidden" aria-label="More actions" onClick={() => setMenuOpen(true)}>
            <MoreHorizontal />
          </IconButton>
        </>
      }
    >
      <PageTitle title="Journeys" subtitle="Ordered paths through poems, each with a note on why it belongs." />

      <ChipRow label="Filter Journeys" value={filter} options={FILTERS} onChange={setFilter} className="mb-4" />

      <div className="mb-2.5 flex items-baseline justify-between text-[13px] text-bamba-muted">
        <span>
          {shown.length} {shown.length === 1 ? "Journey" : "Journeys"}
        </span>
      </div>

      <div className="flex flex-col gap-4">
        {notice ? <Banner onDismiss={() => setNotice(null)}>{notice}</Banner> : null}
        {error ? (
          <Banner tone="warn" role="alert">
            {error}
          </Banner>
        ) : null}
        {loading ? <p className="text-sm text-bamba-muted">Loading Journeys...</p> : null}

        {!loading && !error && journeys.length === 0 ? (
          <ListSurface>
            <div className="px-5 py-8 text-center">
              <h2 className="font-heading text-2xl font-semibold">No Journeys yet</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-bamba-muted">
                Approve a few guides first. Then gather their poems into a Journey and write a note for each.
              </p>
              <ActionButton variant="primary" className="mt-5" asChild>
                <Link to="/journeys/new">
                  <Plus />
                  New Journey
                </Link>
              </ActionButton>
            </div>
          </ListSurface>
        ) : null}

        {shown.length > 0 ? (
          <ListSurface>
            {shown.map((journey) => (
              <ListRow key={journey.id} to={`/journeys/${journey.id}`} className="items-start py-4">
                <span className="min-w-0 flex-1">
                  <span className="block font-heading text-[21px] leading-tight font-semibold">{journey.title}</span>
                  <span className="mt-0.5 block text-sm text-bamba-muted">
                    {journey.subtitle} · curated by {journey.curator} · {journey.poems.length}{" "}
                    {journey.poems.length === 1 ? "poem" : "poems"}
                  </span>
                  <span className="mt-2 flex items-center gap-2 text-[13px] font-semibold text-bamba-quiet md:hidden">
                    <StateDot tone={statusTone(journey.status)} label={statusLabel(journey.status)} />
                    {statusLabel(journey.status)} · v{journey.version}
                  </span>
                </span>
                <span className="mt-0.5 hidden items-center gap-2 md:flex">
                  <Pill tone="neutral">v{journey.version}</Pill>
                  <GuideStatusPill status={journey.status} />
                </span>
              </ListRow>
            ))}
          </ListSurface>
        ) : null}

        {!loading && journeys.length > 0 && shown.length === 0 ? (
          <p className="rounded-xl border border-bamba-border bg-bamba-surface p-5 text-sm text-bamba-muted">
            No Journey matches that filter right now.
          </p>
        ) : null}
      </div>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen} title="Journeys">
        <ActionList
          items={[
            {
              key: "refresh",
              icon: RefreshCw,
              title: refreshing ? "Checking" : "Refresh",
              description: "Look in guides/journeys for new files",
              onSelect: () => void refresh(),
            },
            { key: "new", icon: Plus, title: "New Journey", description: "Start an empty Journey", to: "/journeys/new" },
          ]}
        />
      </Sheet>
    </StudioShell>
  )
}
