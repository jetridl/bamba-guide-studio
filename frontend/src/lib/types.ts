export type GuideSummary = {
  id: string
  externalId: string
  title: string
  description?: string | null
  version: number
  status: GuideStatus
  poemTitle: string
  poemAuthor: string
  sessionCount: number
  updatedAt?: string | null
}

export type GuideStatus = "draft" | "in_review" | "approved" | "exported"

export type PoemChunk = {
  id: string
  externalId: string
  sectionId?: string | null
  orderIndex: number
  text: string
  metadata: Record<string, unknown>
}

export type GuidePage = {
  id: string
  externalId: string
  type: PageType
  orderIndex: number
  title?: string | null
  bodyMarkdown?: string | null
  prompt?: string | null
  chunkIds: string[]
  roundType?: RoundType | null
  estimatedSeconds?: number | null
  metadata: Record<string, unknown>
}

export type GuideSession = {
  id: string
  externalId: string
  sessionNumber: number
  title: string
  subtitle?: string | null
  focusSummary?: string | null
  orderIndex: number
  metadata: Record<string, unknown>
  pages: GuidePage[]
}

export type GuideDetail = {
  id: string
  externalId: string
  title: string
  description?: string | null
  version: number
  status: GuideStatus
  metadata: Record<string, unknown>
  poem: {
    id: string
    externalId: string
    title: string
    author: string
    text: string
    year?: number | null
    metadata: Record<string, unknown>
    chunks: PoemChunk[]
  }
  sessions: GuideSession[]
  reviewSummary: {
    openComments: number
    openBlockingComments: number
  }
}

export type PageType =
  | "intro"
  | "context"
  | "poet_background"
  | "poem_background"
  | "recap"
  | "poem_chunk"
  | "commentary"
  | "last_word_game"
  | "first_last_word_game"
  | "hidden_word_game"
  | "reflection"
  | "completion"

export type RoundType = "readThrough" | "lastWord" | "firstAndLast" | "hiddenWord"

export type ValidationIssue = {
  severity: "blocking" | "warning" | "suggestion" | "note"
  code: string
  message: string
  targetType: string
  targetId?: string | null
  field?: string | null
}

export type ValidationResult = {
  valid: boolean
  blockingCount: number
  issues: ValidationIssue[]
}

export type ReviewComment = {
  id: string
  externalId: string
  targetType: string
  targetId?: string | null
  field?: string | null
  severity: "note" | "suggestion" | "warning" | "blocking"
  category: string
  comment: string
  suggestedRevision?: string | null
  status: "open" | "accepted" | "dismissed" | "resolved"
}
