import { cn } from "@/lib/utils"

/** One soft placeholder shape. It breathes, unless the reader asks for less motion. */
function Bone({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-md bg-bamba-quiet-surface motion-reduce:animate-none", className)} />
}

function Field({ tall = false }: { tall?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <Bone className="h-3.5 w-28" />
      <Bone className={cn("w-full rounded-xl", tall ? "h-32" : "h-11")} />
    </div>
  )
}

function LoadingLabel() {
  return <span className="sr-only">Loading the guide</span>
}

/** The shape of the laptop editor while the guide loads. */
function DesktopSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex h-dvh flex-col bg-bamba-bg text-bamba-ink">
      <LoadingLabel />
      <header className="flex shrink-0 items-center gap-3 border-b border-bamba-border bg-bamba-surface px-5 py-2.5">
        <Bone className="size-10 rounded-full" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <Bone className="h-7 w-64" />
            <Bone className="h-6 w-20 rounded-full" />
            <Bone className="h-6 w-24 rounded-full" />
          </div>
          <Bone className="mt-1.5 h-3.5 w-40" />
        </div>
        <Bone className="h-10 w-32 rounded-full" />
        <Bone className="h-10 w-24 rounded-full" />
        <Bone className="size-10 rounded-full" />
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[320px] shrink-0 flex-col gap-6 border-r border-bamba-border bg-bamba-bg-top p-4 md:flex">
          {[4, 3].map((rows, session) => (
            <div key={session} className="flex flex-col gap-3">
              <Bone className="h-4 w-36" />
              <div className="flex flex-col gap-2">
                {Array.from({ length: rows }, (_, row) => (
                  <Bone key={row} className="h-11 w-full rounded-xl" />
                ))}
              </div>
            </div>
          ))}
        </aside>

        <main className="min-w-0 flex-1 overflow-hidden px-6 py-6">
          <div className="mx-auto flex max-w-2xl flex-col gap-6">
            <div className="flex items-baseline justify-between gap-3">
              <Bone className="h-7 w-44" />
              <Bone className="h-3.5 w-36" />
            </div>
            <Field />
            <Field tall />
            <Field />
            <Field tall />
          </div>
        </main>

        <aside className="hidden w-[400px] shrink-0 flex-col border-l border-bamba-border bg-bamba-bg-top xl:flex">
          <div className="p-4 pb-3">
            <Bone className="h-10 w-full rounded-full" />
          </div>
          <div className="flex min-h-0 flex-1 justify-center px-4 pb-5">
            <div className="flex w-[320px] flex-col gap-4 rounded-[28px] border border-bamba-border bg-bamba-bg-top p-6">
              <Bone className="h-3.5 w-24" />
              <Bone className="h-6 w-3/4" />
              <Bone className="h-3.5 w-full" />
              <Bone className="h-3.5 w-5/6" />
              <Bone className="h-3.5 w-2/3" />
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

/** The phone's guide overview: title, readiness, and the page lists. */
function PhoneOverviewSkeleton() {
  return (
    <div role="status" aria-busy="true" className="min-h-dvh bg-linear-to-b from-bamba-bg-top to-bamba-bg text-bamba-ink">
      <LoadingLabel />
      <div className="flex items-center justify-between px-5 pt-5 pb-2">
        <Bone className="h-5 w-20" />
        <Bone className="size-10 rounded-full" />
      </div>
      <div className="px-5 pt-1">
        <Bone className="h-9 w-4/5" />
        <Bone className="mt-2 h-4 w-32" />
        <div className="mt-3 flex gap-2">
          <Bone className="h-6 w-20 rounded-full" />
          <Bone className="h-6 w-24 rounded-full" />
        </div>
      </div>
      <div className="px-5 pt-4">
        <Bone className="h-14 w-full rounded-xl" />
      </div>
      <div className="flex flex-col gap-6 px-5 pt-6">
        {[3, 2].map((rows, session) => (
          <div key={session} className="flex flex-col gap-3">
            <Bone className="h-4 w-40" />
            <div className="divide-y divide-bamba-divider overflow-hidden rounded-xl border border-bamba-border bg-bamba-surface">
              {Array.from({ length: rows }, (_, row) => (
                <div key={row} className="flex flex-col gap-1.5 px-4 py-3">
                  <Bone className="h-4 w-3/5" />
                  <Bone className="h-3 w-20" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** The phone's page screen: the page line, the tabs, and the form. */
function PhonePageSkeleton() {
  return (
    <div role="status" aria-busy="true" className="min-h-dvh bg-linear-to-b from-bamba-bg-top to-bamba-bg text-bamba-ink">
      <LoadingLabel />
      <div className="flex items-center justify-between px-5 pt-5 pb-2">
        <Bone className="h-5 w-40" />
        <Bone className="size-10 rounded-full" />
      </div>
      <div className="px-5 pt-1 pb-3">
        <Bone className="h-3.5 w-48" />
      </div>
      <div className="px-5">
        <Bone className="h-10 w-full rounded-full" />
      </div>
      <div className="flex flex-col gap-6 px-5 pt-5">
        <Field />
        <Field tall />
        <Field />
      </div>
    </div>
  )
}

export function EditorSkeleton({ phone, pageOpen }: { phone: boolean; pageOpen: boolean }) {
  if (!phone) return <DesktopSkeleton />
  return pageOpen ? <PhonePageSkeleton /> : <PhoneOverviewSkeleton />
}
