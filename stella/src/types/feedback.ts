import type { ExerciseType } from "@/types"

export interface FeedbackContext {
  exerciseType?: ExerciseType
  pageKey: string
  pageLabel: string
  patientId?: string
  routePath: string
  tab?: string
}

export interface FeedbackNote {
  authorDisplayName: string
  authorEmail?: string
  authorSub?: string
  comment: string
  createdAt: string
  exerciseType?: ExerciseType
  noteId: string
  pageKey: string
  patientId?: string
  routePath: string
  tab?: string
}

export interface CreateFeedbackNoteInput extends FeedbackContext {
  authorDisplayName?: string
  comment: string
}
