import { startOfMonth, subDays } from "date-fns"

import { exerciseDefinitions } from "@/config/exercises"
import { seedPatients, seedSessions } from "@/data/seed"
import { getValidIdToken } from "@/lib/auth"
import { getRuntimeConfig } from "@/lib/runtime-config"
import type {
  DashboardStats,
  ExerciseSession,
  ExerciseSummary,
  ExerciseType,
  Patient,
  PatientWithStats,
} from "@/types"
import type { SaveExerciseRunInput } from "@/types/exercise-control"

const patientStorageKey = "stella-poc-patients"
const sessionStorageKey = "stella-poc-added-sessions"
const demoToday = new Date("2026-09-15T12:00:00")

export type CreatePatientInput = {
  firstName: string
  lastName: string
  notes?: string
}

function remoteAppEnabled() {
  const config = getRuntimeConfig()
  return Boolean(config.auth.enabled && config.api.baseUrl)
}

async function apiRequest<T>(
  path: string,
  init?: RequestInit,
  options?: {
    allowNotFound?: boolean
  }
) {
  const config = getRuntimeConfig()
  const idToken = await getValidIdToken()

  if (!config.api.baseUrl || !idToken) {
    throw new Error("Stella API is not configured for this session.")
  }

  const response = await fetch(`${config.api.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  })

  if (options?.allowNotFound && response.status === 404) {
    return undefined
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as
      | { message?: string }
      | undefined
    throw new Error(body?.message || "Stella request failed.")
  }

  return (await response.json()) as T
}

function delay(ms = 200) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function readPatients(): Patient[] {
  const stored = window.localStorage.getItem(patientStorageKey)

  if (!stored) {
    return seedPatients
  }

  try {
    const parsed = JSON.parse(stored) as Patient[]
    return parsed.length > 0 ? parsed : seedPatients
  } catch {
    return seedPatients
  }
}

function writePatients(patients: Patient[]) {
  window.localStorage.setItem(patientStorageKey, JSON.stringify(patients))
}

function readAddedSessions(): ExerciseSession[] {
  const stored = window.localStorage.getItem(sessionStorageKey)

  if (!stored) {
    return []
  }

  try {
    return JSON.parse(stored) as ExerciseSession[]
  } catch {
    return []
  }
}

function writeAddedSessions(sessions: ExerciseSession[]) {
  window.localStorage.setItem(sessionStorageKey, JSON.stringify(sessions))
}

function readSessions() {
  return [...readAddedSessions(), ...seedSessions]
}

function fullName(patient: Patient) {
  return `${patient.firstName} ${patient.lastName}`
}

function getNextPatientCode(patients: Patient[]) {
  const maxPatientNumber = patients.reduce((currentMax, patient) => {
    const match = /^P-(\d+)$/i.exec(patient.patientCode.trim())
    if (!match) {
      return currentMax
    }

    return Math.max(currentMax, Number(match[1]))
  }, 1020)

  return `P-${String(maxPatientNumber + 1).padStart(4, "0")}`
}

function getSessionValue(session: ExerciseSession, key: string) {
  if (key === "sessionCount") {
    return 1
  }

  if (
    key === "completed" &&
    "itemsCompleted" in session &&
    "itemsTotal" in session
  ) {
    return `${session.itemsCompleted}/${session.itemsTotal}`
  }

  if (
    key === "tempo" &&
    "audioMode" in session &&
    (session.audioMode === "metronome" || session.audioMode === "music")
  ) {
    if (session.audioMode === "music" && session.musicPlaybackRate) {
      return `${session.musicPlaybackRate.toFixed(1)}x`
    }

    if ("tempoBpm" in session && session.tempoBpm) {
      return `${session.tempoBpm} BPM`
    }
  }

  return (session as unknown as Record<string, unknown>)[key]
}

function averageMetric(sessions: ExerciseSession[], key: string) {
  if (key === "sessionCount") {
    return sessions.length
  }

  const values = sessions
    .map((session) => getSessionValue(session, key))
    .filter((value): value is number => typeof value === "number")

  if (values.length === 0) {
    return undefined
  }

  return values.reduce((total, value) => total + value, 0) / values.length
}

function sessionDateValue(session: ExerciseSession) {
  return new Date(session.sessionDate).getTime()
}

export function formatMetricValue(value: unknown, format = "text") {
  if (value === undefined || value === null || value === "") {
    return "N/A"
  }

  if (format === "text") {
    return String(value)
  }

  if (typeof value !== "number") {
    return String(value)
  }

  if (format === "percent") {
    return `${Math.round(value)}%`
  }

  if (format === "milliseconds") {
    return `${Math.round(value)} ms`
  }

  if (format === "duration") {
    return `${Math.round(value)} min`
  }

  if (format === "decimal") {
    return value.toFixed(1)
  }

  return `${Math.round(value)}`
}

export function getExerciseAggregateValue(
  sessions: ExerciseSession[],
  key: string
) {
  return averageMetric(sessions, key)
}

export function getSessionDisplayValue(session: ExerciseSession, key: string) {
  return getSessionValue(session, key)
}

export async function getPatients(): Promise<PatientWithStats[]> {
  if (remoteAppEnabled()) {
    const patients = await apiRequest<PatientWithStats[]>("/patients", {
      method: "GET",
    })
    if (patients === undefined) {
      throw new Error("Stella API returned no patients.")
    }
    return patients
  }

  await delay()
  const patients = readPatients()
  const sessions = readSessions()
  const activeThreshold = subDays(demoToday, 30).getTime()

  return patients.map((patient) => {
    const patientSessions = sessions.filter(
      (session) => session.patientId === patient.id
    )
    const lastSession = patientSessions.toSorted(
      (a, b) => sessionDateValue(b) - sessionDateValue(a)
    )[0]

    return {
      ...patient,
      fullName: fullName(patient),
      totalSessions: patientSessions.length,
      exerciseCount: new Set(patientSessions.map((session) => session.activity))
        .size,
      lastSessionDate: lastSession?.sessionDate,
      isActive: lastSession
        ? sessionDateValue(lastSession) >= activeThreshold
        : false,
    }
  })
}

export async function getPatient(
  patientId: string
): Promise<Patient | undefined> {
  if (remoteAppEnabled()) {
    return apiRequest<Patient>(`/patients/${patientId}`, { method: "GET" }, {
      allowNotFound: true,
    })
  }

  await delay()
  return readPatients().find((patient) => patient.id === patientId)
}

export async function createPatient(
  input: CreatePatientInput
): Promise<Patient> {
  if (remoteAppEnabled()) {
    const patient = await apiRequest<Patient>("/patients", {
      body: JSON.stringify(input),
      method: "POST",
    })
    if (patient === undefined) {
      throw new Error("Stella API did not return the created patient.")
    }
    return patient
  }

  await delay()
  const patients = readPatients()
  const normalizedCode = getNextPatientCode(patients)
  const id = normalizedCode.toLowerCase()

  const patient: Patient = {
    id,
    patientCode: normalizedCode,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    notes: input.notes?.trim() || undefined,
    createdAt: new Date().toISOString(),
  }

  writePatients([patient, ...patients.filter((item) => item.id !== id)])
  return patient
}

export async function getPatientSessions(
  patientId: string
): Promise<ExerciseSession[]> {
  if (remoteAppEnabled()) {
    const sessions = await apiRequest<ExerciseSession[]>(
      `/patients/${patientId}/sessions`,
      {
        method: "GET",
      }
    )
    if (sessions === undefined) {
      throw new Error("Stella API returned no session data.")
    }
    return sessions
  }

  await delay()
  return readSessions()
    .filter((session) => session.patientId === patientId)
    .toSorted((a, b) => sessionDateValue(b) - sessionDateValue(a))
}

export async function getExerciseSessions(
  patientId: string,
  exerciseType: ExerciseType
): Promise<ExerciseSession[]> {
  if (remoteAppEnabled()) {
    const sessions = await apiRequest<ExerciseSession[]>(
      `/patients/${patientId}/exercises/${exerciseType}/sessions`,
      {
        method: "GET",
      }
    )
    if (sessions === undefined) {
      throw new Error("Stella API returned no exercise session data.")
    }
    return sessions
  }

  await delay()
  return readSessions()
    .filter(
      (session) =>
        session.patientId === patientId && session.activity === exerciseType
    )
    .toSorted((a, b) => sessionDateValue(a) - sessionDateValue(b))
}

export async function getDashboardStats(): Promise<DashboardStats> {
  if (remoteAppEnabled()) {
    const stats = await apiRequest<DashboardStats>("/dashboard", {
      method: "GET",
    })
    if (stats === undefined) {
      throw new Error("Stella API returned no dashboard data.")
    }
    return stats
  }

  await delay()
  const patients = readPatients()
  const sessions = readSessions()
  const startOfCurrentMonth = startOfMonth(demoToday).getTime()
  const activeThreshold = subDays(demoToday, 30).getTime()
  const activePatientIds = new Set(
    sessions
      .filter((session) => sessionDateValue(session) >= activeThreshold)
      .map((session) => session.patientId)
  )

  return {
    totalPatients: patients.length,
    totalSessions: sessions.length,
    sessionsThisMonth: sessions.filter(
      (session) => sessionDateValue(session) >= startOfCurrentMonth
    ).length,
    activePatients: patients.filter((patient) =>
      activePatientIds.has(patient.id)
    ).length,
  }
}

function round(value: number, precision = 0) {
  const multiplier = 10 ** precision
  return Math.round(value * multiplier) / multiplier
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum)
}

export async function saveExerciseRun({
  patientId,
  setup,
  status,
  completedUnits,
  elapsedSeconds,
}: SaveExerciseRunInput): Promise<ExerciseSession> {
  if (remoteAppEnabled()) {
    const session = await apiRequest<ExerciseSession>("/sessions", {
      body: JSON.stringify({
        completedUnits,
        elapsedSeconds,
        patientId,
        setup,
        status,
      }),
      method: "POST",
    })
    if (session === undefined) {
      throw new Error("Stella API did not return the saved session.")
    }
    return session
  }

  await delay(350)

  const sessionId = `mock-${patientId}-${setup.activity}-${Date.now()}`
  const sessionDate = new Date().toISOString()
  const durationMinutes = Math.max(1, round(elapsedSeconds / 60, 1))
  const baseSession = {
    sessionId,
    patientId,
    activity: setup.activity,
    sessionDate,
    status,
    summary:
      "Simulated exercise-control session created in the Stella prototype.",
    activeEngagementTimeMinutes: durationMinutes,
    totalSessionDurationMinutes: durationMinutes,
    pauseBreakCount: 0,
  }

  let session: ExerciseSession

  if (setup.activity === "letter-target" || setup.activity === "letter-find") {
    const itemsPerSession =
      setup.contentMode === "letters"
        ? setup.numberOfLetters
        : setup.numberOfWords
    const completed = Math.min(completedUnits, itemsPerSession)
    const incorrectAttempts = status === "completed" ? 1 : 2
    const totalAttempts = completed + incorrectAttempts
    const accuracyPercent =
      totalAttempts === 0 ? 0 : round((completed / totalAttempts) * 100)
    const firstAttemptSuccessRatePercent = clamp(accuracyPercent - 4, 0, 100)
    const attemptsPerMinute = round(totalAttempts / durationMinutes, 1)

    if (setup.activity === "letter-target") {
      session = {
        ...baseSession,
        activity: "letter-target",
        contentMode: setup.contentMode,
        itemsPerSession,
        wordLength:
          setup.contentMode === "words" ? setup.wordLength : undefined,
        audioMode: setup.audioMode,
        tempoBpm: setup.audioMode === "metronome" ? setup.tempoBpm : undefined,
        musicPlaybackRate:
          setup.audioMode === "music" ? setup.musicPlaybackRate : undefined,
        itemsCompleted: completed,
        itemsTotal: itemsPerSession,
        totalAttempts,
        correctHits: completed,
        accuracyPercent,
        firstAttemptSuccessRatePercent,
        meanCorrectLatencyMs: 860,
        incorrectAttempts,
        latencyVariabilityStdDev: 108,
        onBeatAccuracyPercent:
          setup.audioMode === "silent"
            ? undefined
            : clamp(accuracyPercent - 6, 0, 100),
        timingVariabilityStdDev: setup.audioMode === "silent" ? undefined : 122,
        directionalConsistencyPercent: 88,
        attemptsPerMinute,
      }
    } else {
      session = {
        ...baseSession,
        activity: "letter-find",
        contentMode: setup.contentMode,
        itemsPerSession,
        wordLength:
          setup.contentMode === "words" ? setup.wordLength : undefined,
        itemsCompleted: completed,
        itemsTotal: itemsPerSession,
        totalAttempts,
        correctHits: completed,
        accuracyPercent,
        firstAttemptSuccessRatePercent,
        meanCorrectLatencyMs: 1010,
        incorrectAttempts,
        audioMode: setup.audioMode,
        tempoBpm: setup.audioMode === "metronome" ? setup.tempoBpm : undefined,
        musicPlaybackRate:
          setup.audioMode === "music" ? setup.musicPlaybackRate : undefined,
        attemptsPerMinute,
      }
    }
  } else if (setup.activity === "eye-pong") {
    session = {
      ...baseSession,
      activity: "eye-pong",
      mode: setup.mode,
      pattern: setup.mode === "left-right" ? "horizontal" : "mixed",
      targetChanges: completedUnits,
      completionRatePercent: clamp((completedUnits / 20) * 100, 0, 100),
      audioMode: setup.audioMode,
      tempoBpm: setup.audioMode === "metronome" ? setup.tempoBpm : undefined,
      musicPlaybackRate:
        setup.audioMode === "music" ? setup.musicPlaybackRate : undefined,
    }
  } else if (setup.activity === "inhibition-challenge") {
    const completionRate = clamp(
      completedUnits / Math.max(setup.trialCount, 1),
      0,
      1
    )
    const goAccuracyPercent = round(76 + completionRate * 16)
    const noGoAccuracyPercent = round(74 + completionRate * 14)

    session = {
      ...baseSession,
      activity: "inhibition-challenge",
      trialCount: setup.trialCount,
      rulePreset: setup.rulePreset,
      responseWindowMs: setup.responseWindowMs,
      cueSpeedBpm: setup.cueSpeedBpm,
      goAccuracyPercent,
      noGoAccuracyPercent,
      missedGoRatePercent: clamp(100 - goAccuracyPercent, 0, 100),
      meanGoLatencyMs: round(setup.responseWindowMs * 0.58),
      attemptsPerMinute: round(completedUnits / durationMinutes, 1),
    }
  } else {
    const completedSequences = Math.min(completedUnits, setup.sequenceCount)
    const completionRatePercent = round(
      (completedSequences / Math.max(setup.sequenceCount, 1)) * 100
    )

    session = {
      ...baseSession,
      activity: "motor-sequence-builder",
      contentType: setup.contentType,
      sequenceLength: setup.sequenceLength,
      sequenceCount: setup.sequenceCount,
      presentationSpeedBpm: setup.presentationSpeedBpm,
      audioMode: setup.audioMode,
      sequenceCompletionRatePercent: completionRatePercent,
      firstAttemptSequenceAccuracyPercent: clamp(
        completionRatePercent - 8,
        0,
        100
      ),
      longestCompletedSequence:
        completedSequences === 0
          ? 0
          : status === "completed"
            ? setup.sequenceLength
            : Math.max(1, setup.sequenceLength - 1),
      meanCompletionTimeMs: round(
        (60000 / setup.presentationSpeedBpm) * setup.sequenceLength
      ),
      attemptsPerMinute: round(
        (completedSequences * setup.sequenceLength) / durationMinutes,
        1
      ),
    }
  }

  writeAddedSessions([session, ...readAddedSessions()])
  return session
}

export function buildExerciseSummaries(
  sessions: ExerciseSession[]
): ExerciseSummary[] {
  const summaries = new Map<ExerciseType, ExerciseSession[]>()

  for (const session of sessions) {
    summaries.set(session.activity, [
      ...(summaries.get(session.activity) ?? []),
      session,
    ])
  }

  return Array.from(summaries.entries())
    .map(([activity, activitySessions]) => {
      const definition = exerciseDefinitions[activity]
      const [primary, secondary] = definition.patientSummary
      const sortedSessions = activitySessions.toSorted(
        (a, b) => sessionDateValue(b) - sessionDateValue(a)
      )

      return {
        activity,
        sessions: activitySessions.length,
        lastSessionDate: sortedSessions[0]?.sessionDate ?? "",
        primaryMetric: formatMetricValue(
          averageMetric(activitySessions, primary.key),
          primary.format
        ),
        secondaryMetric: formatMetricValue(
          averageMetric(activitySessions, secondary.key),
          secondary.format
        ),
      }
    })
    .toSorted(
      (a, b) =>
        sessionDateValue({
          sessionDate: b.lastSessionDate,
        } as ExerciseSession) -
        sessionDateValue({ sessionDate: a.lastSessionDate } as ExerciseSession)
    )
}
