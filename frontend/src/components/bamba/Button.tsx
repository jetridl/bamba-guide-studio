import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * Bamba controls: rounded, calm, and never smaller than 44px on a touch screen.
 * The shadcn Button stays for dense desktop-only spots.
 */
const actionButtonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-field border border-transparent font-medium whitespace-nowrap transition outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[18px]",
  {
    variants: {
      variant: {
        primary:
          "bg-linear-to-b from-bamba-accent-strong to-bamba-accent text-bamba-accent-ink hover:brightness-105 active:brightness-95 disabled:bg-none disabled:bg-bamba-quiet-surface disabled:text-bamba-hint disabled:border-bamba-chip-border",
        quiet:
          "border-bamba-chip-border bg-bamba-surface text-bamba-ink hover:bg-bamba-chip-fill disabled:bg-bamba-quiet-surface disabled:text-bamba-hint",
        ghost:
          "text-bamba-quiet hover:bg-bamba-quiet-surface hover:text-bamba-ink disabled:text-bamba-hint",
      },
      size: {
        default: "h-11 px-5 text-[15px]",
        compact: "h-11 px-4 text-sm md:h-10",
        pinned: "h-14 w-full px-6 font-heading text-xl font-semibold",
      },
    },
    defaultVariants: { variant: "quiet", size: "default" },
  },
)

function ActionButton({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof actionButtonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button"
  return <Comp data-slot="action-button" className={cn(actionButtonVariants({ variant, size }), className)} {...props} />
}

/** A round icon button, the shape the app uses for back and more-actions. */
function IconButton({
  className,
  asChild = false,
  tone = "quiet",
  ...props
}: React.ComponentProps<"button"> & { asChild?: boolean; tone?: "quiet" | "plain" }) {
  const Comp = asChild ? Slot.Root : "button"
  return (
    <Comp
      data-slot="icon-button"
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-full transition outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:text-bamba-hint [&_svg:not([class*='size-'])]:size-5",
        tone === "quiet"
          ? "bg-bamba-quiet-surface text-bamba-ink hover:bg-bamba-chip-fill"
          : "text-bamba-quiet hover:bg-bamba-quiet-surface hover:text-bamba-ink",
        className,
      )}
      {...props}
    />
  )
}

export { ActionButton, IconButton, actionButtonVariants }
