import type {
  GuideDetail,
  GuideSummary,
  GuideVersionSummary,
  PublishResult,
  RefreshResult,
  ReviewComment,
  ValidationResult,
} from "@/lib/types"

// Same origin by default: nginx proxies /api in production, Vite in development.
// A phone then needs no extra setting and no CORS rule.
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api"

/** Said in plain words, because a phone on hotel Wi-Fi sees this often. */
export const UNREACHABLE =
  "Could not reach the Studio. Check that it is running, and that this device is on the same network."

/** Turn a FastAPI error body into one readable message. */
async function errorFromResponse(response: Response): Promise<string> {
  const body = await response.text()
  let detail: unknown
  try {
    detail = (JSON.parse(body) as { detail?: unknown }).detail
  } catch {
    detail = undefined
  }
  if (typeof detail === "string") return detail
  if (detail && typeof detail === "object") {
    const { message, issues, errors } = detail as {
      message?: string
      issues?: { message: string }[]
      errors?: string[]
    }
    if (message) {
      const lines = [...(issues ?? []).map((issue) => issue.message), ...(errors ?? [])]
      return [message, ...lines.map((line) => `• ${line}`)].join("\n")
    }
    return JSON.stringify(detail, null, 2)
  }
  if (body.trim()) return body
  if (response.status >= 500) return UNREACHABLE
  return response.statusText || `Request failed (${response.status}).`
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(path, init)
  } catch {
    throw new Error(UNREACHABLE)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  })
  if (!response.ok) {
    throw new Error(await errorFromResponse(response))
  }
  if (response.status === 204) {
    return undefined as T
  }
  return response.json() as Promise<T>
}

export const api = {
  listGuides: () => request<GuideSummary[]>("/guides"),
  refreshGuides: () => request<RefreshResult>("/guides/refresh", { method: "POST" }),
  getGuide: (guideId: string) => request<GuideDetail>(`/guides/${guideId}`),
  listGuideVersions: (guideId: string) =>
    request<GuideVersionSummary[]>(`/guides/${guideId}/versions`),
  importGuide: (payload: unknown) =>
    request<GuideDetail>("/import/guide", { method: "POST", body: JSON.stringify(payload) }),
  importReview: (payload: unknown) =>
    request<{ id: string }>("/import/review", { method: "POST", body: JSON.stringify(payload) }),
  patchGuide: (guideId: string, payload: Record<string, unknown>) =>
    request<GuideDetail>(`/guides/${guideId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  patchSession: (sessionId: string, payload: Record<string, unknown>) =>
    request<{ id: string }>(`/sessions/${sessionId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  patchPage: (pageId: string, payload: Record<string, unknown>) =>
    request<{ id: string }>(`/pages/${pageId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  duplicatePage: (pageId: string) =>
    request<{ id: string; externalId: string }>(`/pages/${pageId}/duplicate`, { method: "POST" }),
  deletePage: (pageId: string) =>
    request<void>(`/pages/${pageId}`, { method: "DELETE" }),
  createPage: (sessionId: string) =>
    request<{ id: string; externalId: string }>(`/sessions/${sessionId}/pages`, { method: "POST" }),
  reorderPages: (sessionId: string, items: { id: string; orderIndex: number }[]) =>
    request<{ ok: boolean }>(`/sessions/${sessionId}/pages/reorder`, {
      method: "POST",
      body: JSON.stringify({ items }),
    }),
  reorderSessions: (guideId: string, items: { id: string; orderIndex: number }[]) =>
    request<{ ok: boolean }>(`/guides/${guideId}/sessions/reorder`, {
      method: "POST",
      body: JSON.stringify({ items }),
    }),
  validateGuide: (guideId: string) => request<ValidationResult>(`/guides/${guideId}/validate`),
  markInReview: (guideId: string) =>
    request<GuideDetail>(`/guides/${guideId}/mark-in-review`, { method: "POST" }),
  approveGuide: (guideId: string) =>
    request<GuideDetail>(`/guides/${guideId}/approve`, { method: "POST" }),
  saveVersion: (guideId: string) =>
    request<GuideDetail>(`/guides/${guideId}/save-version`, { method: "POST" }),
  restoreLatest: (guideId: string) =>
    request<GuideDetail>(`/guides/${guideId}/restore-latest`, { method: "POST" }),
  listReviewComments: (guideId: string) =>
    request<ReviewComment[]>(`/guides/${guideId}/review-comments`),
  setCommentStatus: (commentId: string, status: ReviewComment["status"]) =>
    request<ReviewComment>(`/review-comments/${commentId}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  acceptComment: (commentId: string) =>
    request<ReviewComment>(`/review-comments/${commentId}/accept`, { method: "POST" }),
  publishGuide: (guideId: string) =>
    request<PublishResult>(`/guides/${guideId}/publish`, { method: "POST" }),
  exportGuide: async (guideId: string) => {
    const response = await apiFetch(`${API_BASE}/guides/${guideId}/export`)
    if (!response.ok) {
      throw new Error(await errorFromResponse(response))
    }
    return response.blob()
  },
}
