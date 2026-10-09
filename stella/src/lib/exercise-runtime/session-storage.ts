import type { ExerciseSetup, RunnableExerciseType } from "@/types/exercise-control"

const storageKeyPrefix = "stella-runtime-pending"
const rerunStorageKeyPrefix = "stella-runtime-rerun"

export interface PendingExerciseRun {
  patientId: string
  setup: ExerciseSetup
  savedAt: string
}

export interface RerunExerciseSetup {
  patientId: string
  savedAt: string
  setup: ExerciseSetup
}

function storageKey(patientId: string, activity: RunnableExerciseType) {
  return `${storageKeyPrefix}:${patientId}:${activity}`
}

function rerunStorageKey(patientId: string) {
  return `${rerunStorageKeyPrefix}:${patientId}`
}

export function savePendingExerciseRun(run: PendingExerciseRun) {
  window.sessionStorage.setItem(
    storageKey(run.patientId, run.setup.activity),
    JSON.stringify(run)
  )
}

export function loadPendingExerciseRun(
  patientId: string,
  activity: RunnableExerciseType
) {
  const raw = window.sessionStorage.getItem(storageKey(patientId, activity))

  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as PendingExerciseRun
  } catch {
    return null
  }
}

export function clearPendingExerciseRun(
  patientId: string,
  activity: RunnableExerciseType
) {
  window.sessionStorage.removeItem(storageKey(patientId, activity))
}

export function saveRerunExerciseSetup(run: RerunExerciseSetup) {
  window.sessionStorage.setItem(rerunStorageKey(run.patientId), JSON.stringify(run))
}

export function loadRerunExerciseSetup(patientId: string) {
  const raw = window.sessionStorage.getItem(rerunStorageKey(patientId))

  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as RerunExerciseSetup
  } catch {
    return null
  }
}

export function clearRerunExerciseSetup(patientId: string) {
  window.sessionStorage.removeItem(rerunStorageKey(patientId))
}
