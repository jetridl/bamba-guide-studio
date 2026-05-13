import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Link, useNavigate } from "react-router"
import { ArrowLeft, FileJson, Upload } from "lucide-react"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"

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
    <main className="min-h-screen bg-bamba-ivory px-8 py-8 text-bamba-ink">
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        <Button asChild variant="ghost" className="w-fit">
          <Link to="/guides">
            <ArrowLeft />
            Guides
          </Link>
        </Button>
        <Card className="border-bamba-border bg-white/65">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <FileJson className="size-5 text-bamba-amber" />
              Import guide JSON
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4" onSubmit={form.handleSubmit(onSubmit)}>
              <label className="flex cursor-pointer items-center justify-between rounded-md border border-dashed border-bamba-border bg-bamba-paper px-4 py-3 text-sm">
                <span className="flex items-center gap-2 text-bamba-muted">
                  <Upload className="size-4 text-bamba-amber" />
                  Choose a guided-plan JSON file
                </span>
                <input
                  accept="application/json,.json"
                  className="sr-only"
                  type="file"
                  onChange={(event) => void onFileChange(event.target.files?.[0])}
                />
              </label>
              <Textarea
                className="min-h-[520px] bg-bamba-paper font-mono text-sm"
                placeholder="{ ... guided plan JSON ... }"
                {...form.register("json")}
              />
              {form.formState.errors.json ? (
                <p className="text-sm text-red-700">{form.formState.errors.json.message}</p>
              ) : null}
              {error ? <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">{error}</p> : null}
              <div className="flex justify-end">
                <Button disabled={form.formState.isSubmitting} type="submit">
                  Import guide
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
