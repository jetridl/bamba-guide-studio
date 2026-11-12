import { UNREACHABLE, apiFetch } from "@/lib/api"
import type { GuideStatus } from "@/lib/types"

export type JourneyPoem = { poemId: string; title?: string; author?: string; note: string[] }

/** An image file in the same folder as journey.json, with text for screen readers. */
export type JourneyCoverImage = { path: string; alt: string }

export type Journey = {
  id?: string
  externalId: string
  title: string
  subtitle: string
  curator: string
  version: number
  // The version in exports/journeys, or null when the Journey is not published.
  publishedVersion?: number | null
  status: GuideStatus
  introduction: string[]
  closing: string[]
  coverImage: JourneyCoverImage | null
  poems: JourneyPoem[]
}

export type JourneyCandidate = { poemId: string; title: string; author: string }

export type JourneyIssue = {
  severity: "blocking"
  code: string
  message: string
  targetType: string
  targetId?: string | null
}

export type JourneyRefreshResult = { loaded: string[]; skipped: string[]; failed: string[]; problems: string[] }

export type JourneyPublishResult = {
  folder: string
  path: string
  link: string | null
  created: boolean
  warnings: string[]
}

/** A read-only saved version. Refresh and Publish add them. */
export type JourneyVersionSummary = { version: number; status: GuideStatus; title: string; createdAt: string | null }

export type JourneyVersionDetail = Omit<Journey, "id"> & { createdAt: string | null }

export type JourneyValidation = { valid: boolean; blockingCount: number; issues: JourneyIssue[] }

const BASE = import.meta.env.VITE_API_BASE_URL ?? "/api"

/** Turn FastAPI error bodies into one plain sentence per problem. */
function errorMessage(body: string, fallback: string): string {
  let detail: unknown
  try {
    detail = (JSON.parse(body) as { detail?: unknown }).detail
  } catch {
    return body || fallback
  }
  if (typeof detail === "string") return detail
  if (Array.isArray(detail)) {
    return detail
      .map((item: { loc?: (string | number)[]; msg?: string }) => {
        const field = (item.loc ?? []).filter((part) => part !== "body").join(" › ")
        return field ? `${field}: ${item.msg}` : item.msg
      })
      .join("\n")
  }
  if (detail && typeof detail === "object") {
    const { message, issues } = detail as { message?: string; issues?: JourneyIssue[] }
    const lines = (issues ?? []).map((issue) => issue.message)
    return [message, ...lines].filter(Boolean).join("\n") || fallback
  }
  return fallback
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(`${BASE}${path}`, { ...init, headers: { "Content-Type": "application/json" } })
  if (!response.ok)
    throw new Error(errorMessage(await response.text(), response.status >= 500 ? UNREACHABLE : response.statusText))
  return response.json() as Promise<T>
}

export const journeyApi = {
  list: () => request<Journey[]>("/journeys"),
  refresh: () => request<JourneyRefreshResult>("/journeys/refresh", { method: "POST" }),
  get: (id: string) => request<Journey>(`/journeys/${id}`),
  candidates: () => request<JourneyCandidate[]>("/journey-poems"),
  save: (journey: Journey) => {
    const payload = {
      externalId: journey.externalId,
      title: journey.title,
      subtitle: journey.subtitle,
      curator: journey.curator,
      version: journey.version,
      introduction: journey.introduction,
      closing: journey.closing,
      coverImage: journey.coverImage,
      poems: journey.poems.map(({ poemId, note }) => ({ poemId, note })),
    }
    return request<Journey>(journey.id ? `/journeys/${journey.id}` : "/journeys", {
      method: journey.id ? "PUT" : "POST",
      body: JSON.stringify(payload),
    })
  },
  markInReview: (id: string) => request<Journey>(`/journeys/${id}/mark-in-review`, { method: "POST" }),
  approve: (id: string) => request<Journey>(`/journeys/${id}/approve`, { method: "POST" }),
  publish: (id: string) => request<JourneyPublishResult>(`/journeys/${id}/publish`, { method: "POST" }),
  versions: (id: string) => request<JourneyVersionSummary[]>(`/journeys/${id}/versions`),
  version: (id: string, version: number) => request<JourneyVersionDetail>(`/journeys/${id}/versions/${version}`),
  restoreVersion: (id: string, version: number) =>
    request<Journey>(`/journeys/${id}/versions/${version}/restore`, { method: "POST" }),
  validate: (id: string) => request<JourneyValidation>(`/journeys/${id}/validate`),
  export: async (id: string) => {
    const response = await apiFetch(`${BASE}/journeys/${id}/export`)
    if (!response.ok)
      throw new Error(errorMessage(await response.text(), response.status >= 500 ? UNREACHABLE : "Export failed."))
    return response.blob()
  },
}
