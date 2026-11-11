import { useEffect, useState } from "react"

/** Tailwind's md and xl, so the layout and the code agree on the breakpoints. */
export const TWO_PANE_QUERY = "(min-width: 768px)"
export const THREE_PANE_QUERY = "(min-width: 1280px)"

function matches(query: string): boolean {
  try {
    return window.matchMedia(query).matches
  } catch {
    return false
  }
}

export function useMediaQuery(query: string): boolean {
  const [active, setActive] = useState(() => matches(query))

  useEffect(() => {
    const media = window.matchMedia(query)
    const onChange = () => setActive(media.matches)
    onChange()
    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [query])

  return active
}

/** True on a phone: one column, stacked navigation, no structural editing. */
export function useIsPhone(): boolean {
  return !useMediaQuery(TWO_PANE_QUERY)
}
