import { useEffect, useState } from "react"

import { api } from "@/lib/api"
import type { ContentSyncStatus } from "@/lib/types"

export function contentSyncMessage(status: ContentSyncStatus) {
  if (status.state === "synced") return "Synced. This content will be included in the next app build."
  if (status.state === "disabled") return "Saved locally. Automatic publishing is disabled on this Studio."
  return status.message ?? "Saved in Studio. Waiting to sync; Studio will retry automatically."
}

/** Keep delayed publishing visible even after navigating away or reopening Studio. */
export function ContentSyncNotice() {
  const [status, setStatus] = useState<ContentSyncStatus | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  useEffect(() => {
    let disposed = false
    const refresh = async () => {
      try {
        const next = await api.contentSync()
        if (!disposed) { setStatus(next); setUnavailable(false) }
      } catch {
        if (!disposed) setUnavailable(true)
      }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 5000)
    return () => { disposed = true; window.clearInterval(timer) }
  }, [])
  if (!status || status.state === "disabled") return null
  return (
    <p role="status" className="my-3 text-sm text-bamba-muted">
      {unavailable ? "Could not check publishing status. Reconnecting…" : contentSyncMessage(status)}
    </p>
  )
}
