import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Link, useNavigate } from "react-router"
import { ChevronLeft, Upload } from "lucide-react"
import { z } from "zod"

import { Banner } from "@/components/bamba/Banner"
import { ActionButton } from "@/components/bamba/Button"
import { textareaClass } from "@/components/bamba/Field"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"

const importSchema = z.object({
  json: z.string().min(2, "Paste guided-plan JSON."),
})

type ImportForm = z.infer<typeof importSchema>

export function ImportGuidePage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const form = useForm<ImportForm>({
    resolver: zodResolver(importSchema),
    defaultValues: { json: "" },
  })

  async function onSubmit(values: ImportForm) {
    setError(null)
    try {
      const payload = JSON.parse(values.json) as unknown
      const guide = await api.importGuide(payload)
      navigate(`/guides/${guide.id}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Import failed.")
    }
  }

  async function onFileChange(file: File | undefined) {
    if (!file) return
    setError(null)
    try {
      const text = await file.text()
      JSON.parse(text)
      form.setValue("json", text, { shouldDirty: true, shouldValidate: true })
    } catch {
      setError("That file is not valid JSON.")
    }
  }

  return (
    <main className="min-h-dvh bg-linear-to-b from-bamba-bg-top to-bamba-bg text-bamba-ink">
      <div className="mx-auto w-full max-w-3xl px-5 pt-3 pb-10 md:px-8 md:pt-5">
        <Link to="/guides" className="inline-flex h-11 items-center gap-1.5 text-base text-bamba-quiet no-underline">
          <ChevronLeft className="size-5" />
          Guides
        </Link>
        <h1 className="mt-2 font-heading text-[34px] leading-tight font-bold md:text-5xl">Import a guide</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-bamba-muted">
          Pick a guided-plan JSON file, or paste it below. Importing is laptop work.
        </p>

        <form className="mt-6 flex flex-col gap-4" onSubmit={form.handleSubmit(onSubmit)}>
          <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-field border border-dashed border-bamba-border bg-bamba-surface px-4 py-3 text-[15px]">
            <Upload className="size-5 text-bamba-accent" />
            <span className="text-bamba-muted">Choose a guided-plan JSON file</span>
            <input
              accept="application/json,.json"
              className="sr-only"
              type="file"
              onChange={(event) => void onFileChange(event.target.files?.[0])}
            />
          </label>

          <textarea
            className={cn(textareaClass, "min-h-[420px] font-mono text-sm md:min-h-[520px]")}
            placeholder="{ ... guided plan JSON ... }"
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
            Import guide
          </ActionButton>
        </form>
      </div>
    </main>
  )
}
