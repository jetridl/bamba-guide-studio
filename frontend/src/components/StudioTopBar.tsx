import { NavLink } from "react-router"

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-1.5 text-sm transition ${
    isActive ? "bg-bamba-amber/15 text-bamba-ink" : "text-bamba-muted hover:text-bamba-ink"
  }`

export function StudioTopBar() {
  return (
    <header className="border-b border-bamba-border bg-bamba-paper/80 px-8 py-3">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <NavLink to="/guides" className="text-sm font-medium uppercase tracking-[0.18em] text-bamba-muted">
          Bamba
        </NavLink>
        <nav className="flex items-center gap-1">
          <NavLink to="/guides" className={linkClass}>
            Guides
          </NavLink>
          <NavLink to="/journeys" className={linkClass}>
            Journeys
          </NavLink>
        </nav>
      </div>
    </header>
  )
}
