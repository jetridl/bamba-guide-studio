import type { ReactNode } from "react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * A bottom sheet on a phone, a calm centred panel from md up.
 * Used for the actions menu and for approve and publish.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-[28px] border border-bamba-border bg-bamba-bg-top px-5 pt-3 pb-6 text-bamba-ink shadow-[0_-8px_30px_rgba(15,23,42,0.14)] outline-none data-open:animate-in data-open:slide-in-from-bottom-8 data-closed:animate-out data-closed:slide-out-to-bottom-8",
            "md:inset-x-auto md:top-1/2 md:bottom-auto md:left-1/2 md:w-[30rem] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl md:px-6 md:pt-5 md:pb-6 md:shadow-lg md:data-open:slide-in-from-bottom-2 md:data-closed:slide-out-to-bottom-2",
            "pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:pb-6",
            className,
          )}
        >
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-bamba-border md:hidden" />
          <DialogPrimitive.Title className="font-heading text-[26px] leading-tight font-semibold">
            {title}
          </DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description asChild>
              <div className="mt-1.5 text-sm leading-relaxed text-bamba-muted">{description}</div>
            </DialogPrimitive.Description>
          ) : (
            <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
          )}
          <div className="mt-4">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export const SheetClose = DialogPrimitive.Close
