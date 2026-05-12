import { useEffect, useState } from "react"
import { Link } from "react-router"
import { BookOpen, FileJson, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { api } from "@/lib/api"
import type { GuideSummary } from "@/lib/types"

export function GuideListPage() {
  const [guides, setGuides] = useState<GuideSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  useEffect(() => {
    void load()
  }, [])

  return (
    <main className="min-h-screen bg-bamba-ivory text-bamba-ink">
      <TopBar />
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-8 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-normal">Bamba Guide Studio</h1>
            <p className="mt-1 text-sm text-bamba-muted">Curated poem plans ready for editorial review.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void load()}>
              <RefreshCw />
              Refresh
            </Button>
            <Button asChild>
              <Link to="/guides/import">
                <FileJson />
                Import guide
              </Link>
            </Button>
          </div>
        </div>

        {error && <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">{error}</div>}
        {loading ? <p className="text-sm text-bamba-muted">Loading guides...</p> : null}
        {!loading && guides.length === 0 ? (
          <Card className="border-bamba-border bg-white/55">
            <CardHeader>
              <CardTitle>No guides yet</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <p className="max-w-lg text-sm text-bamba-muted">Import a draft guided-plan JSON file to begin editing.</p>
              <Button asChild>
                <Link to="/guides/import">
                  <FileJson />
                  Import JSON
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4">
          {guides.map((guide) => (
            <Link key={guide.id} to={`/guides/${guide.id}`} className="block">
              <Card className="border-bamba-border bg-white/60 transition hover:bg-white">
                <CardContent className="grid grid-cols-[1fr_auto] items-center gap-4 py-1">
                  <div className="flex items-start gap-3">
                    <div className="mt-1 flex size-9 items-center justify-center rounded-md bg-bamba-amber/15 text-bamba-amber">
                      <BookOpen className="size-4" />
                    </div>
                    <div>
                      <h2 className="text-lg font-medium">{guide.title}</h2>
                      <p className="text-sm text-bamba-muted">
                        {guide.poemTitle} by {guide.poemAuthor} · {guide.sessionCount} sessions · v{guide.version}
                      </p>
                    </div>
                  </div>
                  <GuideStatusPill status={guide.status} />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </main>
  )
}

function TopBar() {
  return (
    <header className="border-b border-bamba-border bg-bamba-paper/80 px-8 py-3">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <Link to="/guides" className="text-sm font-medium uppercase tracking-[0.18em] text-bamba-muted">
          Bamba
        </Link>
        <span className="text-sm text-bamba-muted">editorial desk</span>
      </div>
    </header>
  )
}

export function GuideStatusPill({ status }: { status: GuideSummary["status"] }) {
  const label = status.replace("_", " ")
  return (
    <Badge className="border-bamba-border bg-bamba-paper text-bamba-ink" variant="outline">
      {label}
    </Badge>
  )
}
