import { cn } from "@/lib/utils"

/** One soft placeholder shape. It breathes, unless the reader asks for less motion. */
export function Bone({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-md bg-bamba-quiet-surface motion-reduce:animate-none", className)} />
}
