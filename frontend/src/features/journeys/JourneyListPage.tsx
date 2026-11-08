import { useEffect, useState } from "react"
import { Link } from "react-router"
import { Plus, RefreshCw, Route } from "lucide-react"

import { StudioTopBar } from "@/components/StudioTopBar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { GuideStatusPill } from "@/features/guides/GuideListPage"
import { journeyApi, type Journey } from "@/lib/journeyApi"

export function JourneyListPage() {
  const [journeys, setJourneys] = useState<Journey[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

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

  return (
    <main className="min-h-screen bg-bamba-ivory text-bamba-ink">
      <StudioTopBar />
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-8 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-normal">Guided Journeys</h1>
            <p className="mt-1 text-sm text-bamba-muted">Ordered paths through poems, each with a note on why it belongs.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" disabled={refreshing} onClick={() => void refresh()}>
              <RefreshCw className={refreshing ? "animate-spin" : undefined} />
              {refreshing ? "Checking..." : "Refresh"}
            </Button>
            <Button asChild>
              <Link to="/journeys/new">
                <Plus />
                New Journey
              </Link>
            </Button>
          </div>
        </div>

        {notice ? (
          <div className="whitespace-pre-wrap rounded-md border border-bamba-border bg-bamba-paper p-3 text-sm text-bamba-ink">
            {notice}
          </div>
        ) : null}
        {error ? <div className="whitespace-pre-wrap rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">{error}</div> : null}
        {loading ? <p className="text-sm text-bamba-muted">Loading Journeys...</p> : null}
        {!loading && !error && journeys.length === 0 ? (
          <Card className="border-bamba-border bg-white/55">
            <CardHeader>
              <CardTitle>No Journeys yet</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <p className="max-w-lg text-sm text-bamba-muted">
                Approve a few guides first. Then gather their poems into a Journey and write a note for each.
              </p>
              <Button asChild>
                <Link to="/journeys/new">
                  <Plus />
                  New Journey
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4">
          {journeys.map((journey) => (
            <Link key={journey.id} to={`/journeys/${journey.id}`} className="block">
              <Card className="border-bamba-border bg-white/60 transition hover:bg-white">
                <CardContent className="grid grid-cols-[1fr_auto] items-center gap-4 py-1">
                  <div className="flex items-start gap-3">
                    <div className="mt-1 flex size-9 items-center justify-center rounded-md bg-bamba-amber/15 text-bamba-amber">
                      <Route className="size-4" />
                    </div>
                    <div>
                      <h2 className="text-lg font-medium">{journey.title}</h2>
                      <p className="text-sm text-bamba-muted">
                        {journey.subtitle} · curated by {journey.curator} · {journey.poems.length}{" "}
                        {journey.poems.length === 1 ? "poem" : "poems"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-bamba-paper">
                      v{journey.version}
                    </Badge>
                    <GuideStatusPill status={journey.status} />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </main>
  )
}
