import { getValidIdToken } from "@/lib/auth"
import { getRuntimeConfig } from "@/lib/runtime-config"
import type {
  CreateFeedbackNoteInput,
  FeedbackContext,
  FeedbackNote,
} from "@/types/feedback"

const feedbackStorageKey = "stella-poc-feedback-notes"

function readLocalNotes() {
  const raw = window.localStorage.getItem(feedbackStorageKey)

  if (!raw) {
    return [] as FeedbackNote[]
  }

  try {
    return JSON.parse(raw) as FeedbackNote[]
  } catch {
    return []
  }
}

function writeLocalNotes(notes: FeedbackNote[]) {
  window.localStorage.setItem(feedbackStorageKey, JSON.stringify(notes))
}

function remoteFeedbackEnabled() {
  const config = getRuntimeConfig()
  return Boolean(config.auth.enabled && config.api.baseUrl)
}

function sortNotes(notes: FeedbackNote[]) {
  return notes.toSorted(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  )
}

async function remoteRequest<T>(path: string, init?: RequestInit) {
  const config = getRuntimeConfig()
  const idToken = await getValidIdToken()

  if (!config.api.baseUrl || !idToken) {
    throw new Error("Feedback API is not configured for this session.")
  }

  const response = await fetch(`${config.api.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as
      | { message?: string }
      | undefined
    throw new Error(body?.message || "Feedback request failed.")
  }

  return (await response.json()) as T
}

export async function listFeedbackNotes(context: FeedbackContext) {
  if (remoteFeedbackEnabled()) {
    const searchParams = new URLSearchParams({ pageKey: context.pageKey })
    const response = await remoteRequest<{ notes: FeedbackNote[] }>(
      `/feedback?${searchParams.toString()}`,
      {
        method: "GET",
      }
    )

    return sortNotes(response.notes)
  }

  return sortNotes(
    readLocalNotes().filter((note) => note.pageKey === context.pageKey)
  )
}

export async function createFeedbackNote(input: CreateFeedbackNoteInput) {
  if (remoteFeedbackEnabled()) {
    return remoteRequest<FeedbackNote>("/feedback", {
      method: "POST",
      body: JSON.stringify({
        comment: input.comment,
        exerciseType: input.exerciseType,
        pageKey: input.pageKey,
        pageLabel: input.pageLabel,
        patientId: input.patientId,
        routePath: input.routePath,
        tab: input.tab,
      }),
    })
  }

  const note: FeedbackNote = {
    authorDisplayName: input.authorDisplayName?.trim() || "Local POC User",
    comment: input.comment.trim(),
    createdAt: new Date().toISOString(),
    exerciseType: input.exerciseType,
    noteId: window.crypto.randomUUID(),
    pageKey: input.pageKey,
    patientId: input.patientId,
    routePath: input.routePath,
    tab: input.tab,
  }

  const notes = [note, ...readLocalNotes()]
  writeLocalNotes(notes)
  return note
}
