import type {
  GuideDetail,
  GuideSummary,
  GuideVersionSummary,
  ReviewComment,
  ValidationResult,
} from "@/lib/types"

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api"

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  })
  if (!response.ok) {
    const detail = await response.text()
    try {
      const parsed = JSON.parse(detail) as { detail?: unknown }
      if (typeof parsed.detail === "string") {
        throw new Error(parsed.detail)
      }
      if (parsed.detail && typeof parsed.detail === "object") {
        throw new Error(JSON.stringify(parsed.detail, null, 2))
      }
    } catch (caught) {
      if (caught instanceof Error && caught.message !== detail) {
        throw caught
      }
    }
    throw new Error(detail || response.statusText)
  }
  if (response.status === 204) {
    return undefined as T
  }
  return response.json() as Promise<T>
}

export const api = {
  listGuides: () => request<GuideSummary[]>("/guides"),
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
  exportGuide: async (guideId: string) => {
    const response = await fetch(`${API_BASE}/guides/${guideId}/export`)
    if (!response.ok) {
      throw new Error(await response.text())
    }
    return response.blob()
  },
}
