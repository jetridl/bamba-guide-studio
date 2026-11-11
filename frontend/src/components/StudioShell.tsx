import type { ReactNode } from "react"
import { NavLink } from "react-router"
import { Moon, Sun, SunMoon } from "lucide-react"

import { IconButton } from "@/components/bamba/Button"
import { THEME_LABELS, useTheme } from "@/lib/theme"
import { cn } from "@/lib/utils"

const TABS = [
  { to: "/guides", label: "Guides", key: "guides" },
  { to: "/journeys", label: "Journeys", key: "journeys" },
] as const

export type StudioTab = (typeof TABS)[number]["key"]

export function ThemeButton({ className }: { className?: string }) {
  const { choice, cycle } = useTheme()
  const Icon = choice === "light" ? Sun : choice === "dark" ? Moon : SunMoon
  return (
    <IconButton tone="plain" className={className} onClick={cycle} aria-label={`Theme: ${THEME_LABELS[choice]}`} title={`Theme: ${THEME_LABELS[choice]}`}>
      <Icon />
    </IconButton>
  )
}

/**
 * The chrome around the two list pages.
 * A quiet top bar from md up; a segmented pill at the foot of a phone.
 */
export function StudioShell({ actions, children }: { active?: StudioTab; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-linear-to-b from-bamba-bg-top to-bamba-bg text-bamba-ink">
      <header className="flex items-center gap-3 px-5 py-3 md:border-b md:border-bamba-border md:bg-bamba-surface/70 md:px-8">
        <NavLink to="/guides" className="text-[11px] font-semibold tracking-[0.18em] text-bamba-muted uppercase no-underline">
          Bamba Studio
        </NavLink>
        <nav className="ml-4 hidden flex-1 gap-1 md:flex">
          {TABS.map((tab) => (
            <NavLink
              key={tab.key}
              to={tab.to}
              className={({ isActive }) =>
                cn(
                  "inline-flex h-10 items-center rounded-full px-4 text-[15px] no-underline transition",
                  isActive ? "bg-bamba-quiet-surface font-semibold text-bamba-ink" : "text-bamba-quiet hover:text-bamba-ink",
                )
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeButton />
          {actions}
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-5 pt-2 pb-32 md:px-8 md:pt-6 md:pb-16">{children}</main>

      <nav
        aria-label="Studio sections"
        className="fixed inset-x-0 bottom-0 z-30 flex justify-center border-t border-bamba-border bg-bamba-bg/95 px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-sm md:hidden"
      >
        <div className="flex rounded-full border border-bamba-border bg-bamba-quiet-surface p-1">
          {TABS.map((tab) => (
            <NavLink
              key={tab.key}
              to={tab.to}
              className={({ isActive }) =>
                cn(
                  "inline-flex h-11 items-center rounded-full px-7 text-[15px] no-underline transition",
                  isActive ? "bg-bamba-surface font-semibold text-bamba-ink" : "text-bamba-quiet",
                )
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

/** The title block both list pages share. */
export function PageTitle({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 pt-3 pb-5 md:pt-2">
      <div className="min-w-0">
        <h1 className="font-heading text-[40px] leading-[1.05] font-bold tracking-tight md:text-5xl">{title}</h1>
        {subtitle ? <p className="mt-2 text-[15px] leading-relaxed text-bamba-muted">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  )
}

export { TABS as STUDIO_TABS }
