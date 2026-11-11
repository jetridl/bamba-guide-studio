import ReactMarkdown from "react-markdown"

import { GAME_PAGE_TYPES, getEffectiveChunks } from "@/features/editor/guideHelpers"
import type { GuideDetail, GuidePage, GuideSession } from "@/lib/types"
import { cn } from "@/lib/utils"

// Taken from the app's own study screen: poem reading 21/1.65, prose 19/1.65,
// headings 26/600, all in EB Garamond, under an amber eyebrow.
const POEM = "font-poetry text-[21px] leading-[1.65] text-bamba-ink"
const PROSE =
  "font-poetry text-[19px] leading-[1.65] text-bamba-muted [&_p]:mb-4 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_strong]:text-bamba-ink [&_em]:italic [&_h1]:mb-3 [&_h1]:text-[22px] [&_h1]:font-semibold [&_h1]:text-bamba-ink [&_h2]:mb-2 [&_h2]:text-[20px] [&_h2]:font-semibold [&_h2]:text-bamba-ink [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-5"

/**
 * The page as the app shows it. On a phone this fills the screen;
 * on a laptop it sits in a phone frame beside the editor.
 */
export function PagePreview({
  guide,
  session,
  page,
  className,
}: {
  guide: GuideDetail
  session: GuideSession | null
  page: GuidePage | null
  className?: string
}) {
  const linkedChunks = page && session ? getEffectiveChunks(guide, session, page) : []

  return (
    <article className={cn("flex min-h-0 flex-col px-6 py-7", className)}>
      <p className="mb-2.5 text-[11px] font-semibold tracking-[0.14em] text-bamba-accent uppercase">
        {session?.title ?? guide.title}
      </p>
      <h1 className="mb-5 font-heading text-[26px] leading-[1.25] font-semibold">
        {page?.title || page?.type || guide.title}
      </h1>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!page ? (
          <p className="text-[15px] text-bamba-muted">Choose a page to see it here.</p>
        ) : GAME_PAGE_TYPES.has(page.type) ? (
          <div className="flex flex-col gap-3">
            {linkedChunks.map((chunk) => (
              <div key={chunk.id} className="rounded-xl border border-bamba-border bg-bamba-quiet-surface p-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
                  {chunk.text.split(" ").map((word, index) => {
                    const hidden = page.type === "full_chunk_typing_game" || index % 3 === 1
                    return (
                      <span
                        key={`${word}-${index}`}
                        className={
                          hidden
                            ? "inline-flex h-8 min-w-16 shrink-0 items-center justify-center rounded-md bg-bamba-chip-fill px-3 font-mono text-sm"
                            : "font-poetry text-lg leading-8"
                        }
                      >
                        {hidden ? "____" : word}
                      </span>
                    )
                  })}
                </div>
              </div>
            ))}
            {page.bodyMarkdown ? (
              <div className={cn(PROSE, "mt-2 text-[15px] leading-[1.6]")}>
                <ReactMarkdown>{page.bodyMarkdown}</ReactMarkdown>
              </div>
            ) : null}
          </div>
        ) : page.type === "poem_chunk" ? (
          <div className={cn(POEM, "flex flex-col gap-4")}>
            {linkedChunks.map((chunk) => (
              <p key={chunk.id} className="whitespace-pre-wrap">
                {chunk.text}
              </p>
            ))}
          </div>
        ) : page.type === "recap_previous" ? (
          <div className="flex flex-col gap-5">
            {linkedChunks.length > 0 ? (
              <div className={cn(POEM, "flex flex-col gap-3")}>
                {linkedChunks.map((chunk) => (
                  <p key={chunk.id} className="whitespace-pre-wrap">
                    {chunk.text}
                  </p>
                ))}
              </div>
            ) : null}
            <div className={PROSE}>
              <ReactMarkdown>{page.bodyMarkdown ?? ""}</ReactMarkdown>
            </div>
          </div>
        ) : page.type === "whole_poem" ? (
          <div className={cn(POEM, "whitespace-pre-wrap")}>{guide.poem.text}</div>
        ) : page.type === "reflection" ? (
          <p className={POEM}>{page.prompt}</p>
        ) : (
          <div className={PROSE}>
            <ReactMarkdown>{page.bodyMarkdown ?? ""}</ReactMarkdown>
          </div>
        )}
      </div>
    </article>
  )
}
