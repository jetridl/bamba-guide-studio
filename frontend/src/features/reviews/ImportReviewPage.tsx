import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Link, useNavigate, useParams } from "react-router"
import { ArrowLeft, MessagesSquare } from "lucide-react"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"

const reviewSchema = z.object({ json: z.string().min(2, "Paste review JSON.") })
type ReviewForm = z.infer<typeof reviewSchema>

export function ImportReviewPage() {
  const { guideId = "" } = useParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const form = useForm<ReviewForm>({
    resolver: zodResolver(reviewSchema),
    defaultValues: { json: "" },
  })

  async function onSubmit(values: ReviewForm) {
    setError(null)
    try {
      await api.importReview(JSON.parse(values.json) as unknown)
      navigate(`/guides/${guideId}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Review import failed.")
    }
  }

  return (
    <main className="min-h-screen bg-bamba-ivory px-8 py-8 text-bamba-ink">
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        <Button asChild variant="ghost" className="w-fit">
          <Link to={`/guides/${guideId}`}>
            <ArrowLeft />
            Back to editor
          </Link>
        </Button>
        <Card className="border-bamba-border bg-white/65">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <MessagesSquare className="size-5 text-bamba-amber" />
              Import review JSON
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4" onSubmit={form.handleSubmit(onSubmit)}>
              <Textarea className="min-h-[520px] bg-bamba-paper font-mono text-sm" {...form.register("json")} />
              {form.formState.errors.json ? (
                <p className="text-sm text-red-700">{form.formState.errors.json.message}</p>
              ) : null}
              {error ? <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">{error}</p> : null}
              <div className="flex justify-end">
                <Button disabled={form.formState.isSubmitting} type="submit">
                  Import review
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
