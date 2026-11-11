import { useCallback, useEffect, useState } from "react"

export type ThemeChoice = "system" | "light" | "dark"

const STORAGE_KEY = "bamba-studio-theme"
const DARK_QUERY = "(prefers-color-scheme: dark)"

export const THEME_LABELS: Record<ThemeChoice, string> = {
  system: "Follow the phone",
  light: "Day",
  dark: "Night",
}

/** Storage is unavailable in private mode, so every read and write is guarded. */
function readChoice(): ThemeChoice {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === "light" || stored === "dark" || stored === "system") return stored
  } catch {
    /* Keep the default. */
  }
  return "system"
}

function writeChoice(choice: ThemeChoice) {
  try {
    window.localStorage.setItem(STORAGE_KEY, choice)
  } catch {
    /* The choice then lasts for this visit only. */
  }
}

function prefersDark(): boolean {
  try {
    return window.matchMedia(DARK_QUERY).matches
  } catch {
    return false
  }
}

function apply(choice: ThemeChoice) {
  const dark = choice === "dark" || (choice === "system" && prefersDark())
  document.documentElement.classList.toggle("dark", dark)
  document.documentElement.style.colorScheme = dark ? "dark" : "light"
}

export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(readChoice)

  useEffect(() => {
    apply(choice)
    if (choice !== "system") return
    const media = window.matchMedia(DARK_QUERY)
    const onChange = () => apply("system")
    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [choice])

  const change = useCallback((next: ThemeChoice) => {
    writeChoice(next)
    setChoice(next)
  }, [])

  /** Day, night, follow the phone, and round again. */
  const cycle = useCallback(() => {
    setChoice((current) => {
      const next: ThemeChoice = current === "system" ? "light" : current === "light" ? "dark" : "system"
      writeChoice(next)
      return next
    })
  }, [])

  return { choice, change, cycle }
}
