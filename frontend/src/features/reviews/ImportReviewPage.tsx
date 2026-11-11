import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Link, useNavigate, useParams } from "react-router"
import { ChevronLeft } from "lucide-react"
import { z } from "zod"

import { Banner } from "@/components/bamba/Banner"
import { ActionButton } from "@/components/bamba/Button"
import { textareaClass } from "@/components/bamba/Field"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"

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
    <main className="min-h-dvh bg-linear-to-b from-bamba-bg-top to-bamba-bg text-bamba-ink">
      <div className="mx-auto w-full max-w-3xl px-5 pt-3 pb-10 md:px-8 md:pt-5">
        <Link
          to={`/guides/${guideId}`}
          className="inline-flex h-11 items-center gap-1.5 text-base text-bamba-quiet no-underline"
        >
          <ChevronLeft className="size-5" />
          Back to the guide
        </Link>
        <h1 className="mt-2 font-heading text-[34px] leading-tight font-bold md:text-5xl">Import a review</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-bamba-muted">
          Paste the review JSON. Its notes then appear beside the pages they are about.
        </p>

        <form className="mt-6 flex flex-col gap-4" onSubmit={form.handleSubmit(onSubmit)}>
          <textarea
            className={cn(textareaClass, "min-h-[420px] font-mono text-sm md:min-h-[520px]")}
            placeholder="{ ... review JSON ... }"
            {...form.register("json")}
          />
          {form.formState.errors.json ? (
            <p className="text-sm text-bamba-block-ink">{form.formState.errors.json.message}</p>
          ) : null}
          {error ? (
            <Banner tone="warn" role="alert">
              {error}
            </Banner>
          ) : null}
          <ActionButton variant="primary" size="pinned" disabled={form.formState.isSubmitting} type="submit">
            Import review
          </ActionButton>
        </form>
      </div>
    </main>
  )
}
