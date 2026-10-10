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
import type {
  ExerciseRunResult,
  LetterRuntimeStat,
  SaveExerciseRunInput,
} from "@/types/exercise-control"
import {
  summarizeBeatOffsets,
  summarizeSignedBeatOffsets,
} from "@/lib/audio/beat-metrics"
import {
  EYE_PONG_TARGET_COUNT,
  getEyePongActualBpm,
  getEyePongCompletionRate,
  getEyePongIntervalMs,
} from "@/lib/exercise-runtime/eye-pong"
import {
  getKeyMissMetrics,
  getLetterToKeyMap,
} from "@/lib/exercise-runtime/keyboard-map"
import type {
  ExerciseAudioMode,
  KeyboardLayoutMode,
} from "@/types/exercise-control"

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
      { message?: string } | undefined
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

  if (key === "tempo" && "audioMode" in session) {
    if (session.audioMode === "music" && session.musicPlaybackRate) {
      return `${session.musicPlaybackRate.toFixed(1)}x`
    }

    if ("tempoBpm" in session && session.tempoBpm) {
      return `${session.tempoBpm} BPM`
    }

    if ("actualBpm" in session && session.actualBpm) {
      return `${Math.round(session.actualBpm)} BPM`
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
    if (value > 0 && value < 1) {
      return "<1 min"
    }

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
    return apiRequest<Patient>(
      `/patients/${patientId}`,
      { method: "GET" },
      {
        allowNotFound: true,
      }
    )
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

function mean(values: number[]) {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0
}

function median(values: number[]) {
  if (values.length === 0) {
    return 0
  }
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!
}

function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) {
    return 0
  }
  const sorted = [...values].sort((left, right) => left - right)
  const index = (sorted.length - 1) * percentileValue
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) {
    return sorted[lower]!
  }
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (index - lower)
}

function standardDeviation(values: number[]) {
  if (values.length === 0) {
    return 0
  }
  const average = mean(values)
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
      values.length
  )
}

function timestampDifference(start?: string, end?: string) {
  if (!start || !end) {
    return undefined
  }
  const difference = new Date(end).getTime() - new Date(start).getTime()
  return Number.isFinite(difference) ? Math.max(0, difference) : undefined
}

function computeLetterMetrics(
  stats: LetterRuntimeStat[],
  keyboardLayout: KeyboardLayoutMode,
  audioMode: ExerciseAudioMode,
  selectedWords: string[] = []
) {
  const totalAttempts = stats.reduce((sum, stat) => sum + stat.attempts, 0)
  const incorrectAttempts = stats.reduce(
    (sum, stat) => sum + Math.max(0, stat.attempts - 1),
    0
  )
  const correctHits = stats.length
  const firstAttemptSuccessRatePercent =
    correctHits > 0
      ? round(
          (stats.filter((stat) => stat.attempts === 1).length / correctHits) *
            100
        )
      : 0
  const correctLatencies = stats.map((stat) => stat.timeMs)
  const letterToKey = getLetterToKeyMap(keyboardLayout)
  const attemptLatencies: number[] = []
  const firstResponseLatencies: number[] = []
  const missDistances: number[] = []
  const errorDirectionCounts: Partial<
    Record<"above" | "below" | "left" | "right", number>
  > = {}

  stats.forEach((stat) => {
    const attempts = stat.attemptEvents ?? []
    const firstLatency = timestampDifference(
      stat.targetStartedAt,
      attempts[0]?.timestamp
    )
    if (firstLatency != null) {
      firstResponseLatencies.push(firstLatency)
    }

    attempts.forEach((attempt) => {
      const latency = timestampDifference(
        stat.targetStartedAt,
        attempt.timestamp
      )
      if (latency != null) {
        attemptLatencies.push(latency)
      }
      if (attempt.correct) {
        return
      }
      const targetKeyId = letterToKey[stat.letter]
      const pressedKeyId = attempt.keyId ?? letterToKey[attempt.pressedLetter]
      if (targetKeyId == null || pressedKeyId == null) {
        return
      }
      const miss = getKeyMissMetrics(targetKeyId, pressedKeyId)
      missDistances.push(miss.distance)
      errorDirectionCounts[miss.direction] =
        (errorDirectionCounts[miss.direction] ?? 0) + 1
    })
  })

  const byKey = Array.from(new Set(stats.map((stat) => stat.letter)))
    .sort()
    .map((letter) => {
      const letterStats = stats.filter((stat) => stat.letter === letter)
      const latencies = letterStats.map((stat) => stat.timeMs)
      return {
        beat: audioMode,
        firstAttemptAccuracyPercent: round(
          (letterStats.filter((stat) => stat.attempts === 1).length /
            letterStats.length) *
            100
        ),
        incorrectAttempts: letterStats.reduce(
          (sum, stat) => sum + Math.max(0, stat.attempts - 1),
          0
        ),
        keyId: letterToKey[letter]!,
        letter,
        meanCorrectLatencyMs: round(mean(latencies)),
        trials: letterStats.length,
      }
    })

  let statOffset = 0
  const byWord = selectedWords.flatMap((word) => {
    const wordStats = stats.slice(statOffset, statOffset + word.length)
    statOffset += word.length
    if (wordStats.length !== word.length) {
      return []
    }
    const completionTimeMs = timestampDifference(
      wordStats[0]?.targetStartedAt,
      wordStats[wordStats.length - 1]?.completedAt
    )
    const completedTimes = wordStats
      .map((stat) => stat.completedAt && new Date(stat.completedAt).getTime())
      .filter((value): value is number => typeof value === "number")
    const intervals = completedTimes
      .slice(1)
      .map((value, index) => value - completedTimes[index]!)
    return [
      {
        beat: audioMode,
        completionTimeMs,
        firstAttemptAccuracyPercent: round(
          (wordStats.filter((stat) => stat.attempts === 1).length /
            wordStats.length) *
            100
        ),
        interKeyIntervalMs:
          intervals.length > 0 ? round(mean(intervals)) : undefined,
        length: word.length,
        trials: wordStats.length,
        word,
      },
    ]
  })

  let sequenceOffset = 0
  const breakdownPointCounts: Record<number, number> = {}
  const sequencePerformance = selectedWords.map((word, index) => {
    const wordStats = stats.slice(sequenceOffset, sequenceOffset + word.length)
    sequenceOffset += word.length
    const firstErrorPosition = wordStats.findIndex((stat) => stat.attempts > 1)
    if (firstErrorPosition >= 0) {
      const position = firstErrorPosition + 1
      breakdownPointCounts[position] = (breakdownPointCounts[position] ?? 0) + 1
    }
    return {
      item: index + 1,
      lettersCompleted: wordStats.length,
      lettersInItem: word.length,
    }
  })
  const dominantDirection = Object.entries(errorDirectionCounts).sort(
    (left, right) => right[1] - left[1]
  )[0]
  const dominantBreakdown = Object.entries(breakdownPointCounts).sort(
    (left, right) => right[1] - left[1]
  )[0]

  return {
    byKey,
    byWord,
    correctHits,
    directionalConsistencyPercent: dominantDirection
      ? round((dominantDirection[1] / incorrectAttempts) * 100)
      : undefined,
    dominantErrorDirection: dominantDirection?.[0] as
      "above" | "below" | "left" | "right" | undefined,
    errorDirectionCounts,
    firstAttemptSuccessRatePercent,
    incorrectAttempts,
    latencyIqrMs:
      correctLatencies.length > 3
        ? round(
            percentile(correctLatencies, 0.75) -
              percentile(correctLatencies, 0.25)
          )
        : undefined,
    latencyVariabilityStdDev: round(standardDeviation(correctLatencies)),
    meanCorrectLatencyMs: round(mean(correctLatencies)),
    meanFirstResponseLatencyMs: round(mean(firstResponseLatencies)),
    meanIncorrectAttemptsPerTrial:
      correctHits > 0 ? round(incorrectAttempts / correctHits, 2) : 0,
    meanMissDistance:
      missDistances.length > 0 ? round(mean(missDistances), 2) : undefined,
    meanResponseLatencyMs: round(mean(attemptLatencies)),
    medianCorrectLatencyMs: round(median(correctLatencies)),
    mostCommonBreakdownPosition: dominantBreakdown
      ? Number(dominantBreakdown[0])
      : undefined,
    responseLatencyStdDev: round(standardDeviation(attemptLatencies)),
    sequenceCompletionRatePercent:
      sequencePerformance.length > 0
        ? round(
            (sequencePerformance.filter(
              (item) => item.lettersCompleted === item.lettersInItem
            ).length /
              sequencePerformance.length) *
              100
          )
        : undefined,
    sequencePerformance,
    totalAttempts,
  }
}

function computeBeatMetrics(stats: LetterRuntimeStat[], actualBpm?: number) {
  const attempts = stats.flatMap((stat) => stat.attemptEvents ?? [])
  const offsets = (attempts.length > 0 ? attempts : stats)
    .map((attempt) => attempt.beatOffsetMs)
    .filter((value): value is number => typeof value === "number")

  if (
    offsets.length > 0 &&
    (attempts.length > 0 ? attempts : stats)
      .filter((attempt) => typeof attempt.beatOffsetMs === "number")
      .every((attempt) => attempt.beatOffsetBasis === "nearest-beat")
  ) {
    return summarizeSignedBeatOffsets(offsets)
  }

  return summarizeBeatOffsets(offsets, actualBpm)
}

function buildSessionFromResult({
  completedUnits,
  durationMinutes,
  patientId,
  result,
  sessionDate,
  sessionId,
  setup,
  status,
}: {
  completedUnits: number
  durationMinutes: number
  patientId: string
  result: ExerciseRunResult
  sessionDate: string
  sessionId: string
  setup: SaveExerciseRunInput["setup"]
  status: SaveExerciseRunInput["status"]
}): ExerciseSession {
  const baseSession = {
    sessionId,
    patientId,
    activity: result.activity,
    sessionDate,
    status,
    summary: "Captured keyboard exercise session.",
    activeEngagementTimeMinutes: durationMinutes,
    totalSessionDurationMinutes: durationMinutes,
    pauseBreakCount: 0,
    rawEventPayload: result,
    keyboardLayout: result.keyboardLayout ?? setup.keyboardLayout ?? "qwerty",
    keyboardSide: result.keyboardSide ?? setup.keyboardSide ?? "full",
    keyLabels:
      result.activity === "letter-find"
        ? "letters"
        : (result.keyLabels ?? setup.keyLabels ?? "letters"),
  }

  if (result.activity === "eye-pong" && setup.activity === "eye-pong") {
    return {
      ...baseSession,
      activity: "eye-pong",
      actualBpm: result.actualBpm,
      audioMode: result.audioMode,
      completionRatePercent: getEyePongCompletionRate(
        result.targetChanges,
        result.targetCount
      ),
      intervalMs: getEyePongIntervalMs(result.actualBpm),
      mode: result.mode,
      musicPlaybackRate:
        result.audioMode === "music" ? setup.musicPlaybackRate : undefined,
      pattern: result.mode === "left-right" ? "horizontal" : "mixed",
      targetCount: result.targetCount,
      targetChanges: result.targetChanges,
      tempoBpm: result.audioMode === "metronome" ? setup.tempoBpm : undefined,
    }
  }

  if (
    result.activity === "inhibition-challenge" &&
    setup.activity === "inhibition-challenge"
  ) {
    const closedTrials = result.trials.filter((trial) => trial.windowClosed)
    const goTrials = closedTrials.filter((trial) => trial.cue === "go")
    const noGoTrials = closedTrials.filter((trial) => trial.cue === "no-go")
    const correctGoTrials = goTrials.filter(
      (trial) => trial.outcome === "correct"
    )
    const correctNoGoTrials = noGoTrials.filter(
      (trial) => trial.outcome === "correct"
    )
    const goLatencies = correctGoTrials.flatMap((trial) => {
      const correctPress = trial.presses.find((press) => press.correct)
      return correctPress ? [correctPress.offsetMs - trial.cueOffsetMs] : []
    })
    const goAccuracyPercent =
      goTrials.length > 0
        ? round((correctGoTrials.length / goTrials.length) * 100)
        : 0

    return {
      ...baseSession,
      activity: "inhibition-challenge",
      attemptsPerMinute:
        durationMinutes > 0
          ? round(closedTrials.length / durationMinutes, 1)
          : 0,
      cueSpeedBpm: result.cueSpeedBpm,
      goAccuracyPercent,
      meanGoLatencyMs:
        goLatencies.length > 0
          ? round(
              goLatencies.reduce((sum, latency) => sum + latency, 0) /
                goLatencies.length
            )
          : 0,
      missedGoRatePercent:
        goTrials.length > 0
          ? round(
              (goTrials.filter((trial) => trial.outcome === "missed").length /
                goTrials.length) *
                100
            )
          : 0,
      noGoAccuracyPercent:
        noGoTrials.length > 0
          ? round((correctNoGoTrials.length / noGoTrials.length) * 100)
          : 0,
      responseWindowMs: result.responseWindowMs,
      rulePreset: result.rulePreset,
      summary: `${goAccuracyPercent}% Go accuracy across ${closedTrials.length} completed trials.`,
      trialCount: result.trialCount,
    }
  }

  if (
    result.activity === "motor-sequence-builder" &&
    setup.activity === "motor-sequence-builder"
  ) {
    const startedSequences = result.sequences
    const completedSequences = startedSequences.filter(
      (sequence) => sequence.completedOffsetMs != null
    )
    const firstAttemptSequences = completedSequences.filter((sequence) =>
      sequence.presses.every((press) => press.correct)
    )
    const completionTimes = completedSequences.flatMap((sequence) =>
      sequence.completedOffsetMs != null &&
      sequence.reproductionStartedOffsetMs != null
        ? [sequence.completedOffsetMs - sequence.reproductionStartedOffsetMs]
        : []
    )
    const sequenceCompletionRatePercent =
      startedSequences.length > 0
        ? round((completedSequences.length / startedSequences.length) * 100)
        : 0

    return {
      ...baseSession,
      activity: "motor-sequence-builder",
      attemptsPerMinute:
        durationMinutes > 0
          ? round(
              startedSequences.reduce(
                (sum, sequence) => sum + sequence.presses.length,
                0
              ) / durationMinutes,
              1
            )
          : 0,
      audioMode: result.audioMode,
      contentType: result.contentType,
      firstAttemptSequenceAccuracyPercent:
        startedSequences.length > 0
          ? round(
              (firstAttemptSequences.length / startedSequences.length) * 100
            )
          : 0,
      longestCompletedSequence:
        completedSequences.length > 0
          ? Math.max(
              ...completedSequences.map((sequence) => sequence.keyIds.length)
            )
          : 0,
      meanCompletionTimeMs:
        completionTimes.length > 0
          ? round(
              completionTimes.reduce((sum, duration) => sum + duration, 0) /
                completionTimes.length
            )
          : 0,
      presentationSpeedBpm: result.presentationSpeedBpm,
      sequenceCompletionRatePercent,
      sequenceCount: result.sequenceCount,
      sequenceLength: result.sequenceLength,
      summary: `${completedSequences.length} of ${startedSequences.length} started sequences completed.`,
    }
  }

  if (
    result.activity !== "letter-target" &&
    result.activity !== "letter-find"
  ) {
    return {
      ...baseSession,
      activity: setup.activity,
      summary: "Captured exercise session.",
    } as ExerciseSession
  }

  const letterSetup =
    result.activity === "letter-target" && setup.activity === "letter-target"
      ? setup
      : result.activity === "letter-find" && setup.activity === "letter-find"
        ? setup
        : null

  if (!letterSetup) {
    return {
      ...baseSession,
      activity: setup.activity,
      summary: "Captured exercise session.",
    } as ExerciseSession
  }

  const itemsTotal =
    letterSetup.contentMode === "letters"
      ? letterSetup.numberOfLetters
      : letterSetup.numberOfWords
  const itemsCompleted = Math.min(completedUnits, itemsTotal)
  const metrics = computeLetterMetrics(
    result.stats,
    result.keyboardLayout ?? letterSetup.keyboardLayout ?? "qwerty",
    result.audioMode,
    result.selectedWords ?? []
  )
  const accuracyPercent =
    metrics.totalAttempts === 0
      ? 0
      : round((metrics.correctHits / metrics.totalAttempts) * 100)
  const attemptsPerMinute =
    durationMinutes > 0 ? round(metrics.totalAttempts / durationMinutes, 1) : 0
  const beatMetrics = computeBeatMetrics(result.stats, result.actualBpm)
  const simulatorMetrics = {
    ...metrics,
    eventualAccuracyPercent: metrics.correctHits > 0 ? 100 : 0,
    itemCompletionRatePercent:
      itemsTotal > 0 ? round((itemsCompleted / itemsTotal) * 100) : 0,
  }

  if (result.activity === "letter-target") {
    return {
      ...baseSession,
      activity: "letter-target",
      accuracyPercent,
      attemptsPerMinute,
      audioMode: result.audioMode,
      ...simulatorMetrics,
      contentMode: result.contentMode,
      itemsCompleted,
      itemsPerSession: itemsTotal,
      itemsTotal,
      musicPlaybackRate:
        result.audioMode === "music"
          ? letterSetup.musicPlaybackRate
          : undefined,
      onBeatAccuracyPercent: beatMetrics.onBeatAccuracyPercent,
      tempoBpm:
        result.audioMode === "metronome" ? letterSetup.tempoBpm : undefined,
      timingVariabilityStdDev: beatMetrics.timingVariabilityStdDev,
      wordLength:
        result.contentMode === "words" ? result.wordLength : undefined,
    }
  }

  if (result.activity === "letter-find") {
    return {
      ...baseSession,
      activity: "letter-find",
      accuracyPercent,
      attemptsPerMinute,
      audioMode: result.audioMode,
      ...simulatorMetrics,
      contentMode: result.contentMode,
      itemsCompleted,
      itemsPerSession: itemsTotal,
      itemsTotal,
      musicPlaybackRate:
        result.audioMode === "music"
          ? letterSetup.musicPlaybackRate
          : undefined,
      onBeatAccuracyPercent: beatMetrics.onBeatAccuracyPercent,
      tempoBpm:
        result.audioMode === "metronome" ? letterSetup.tempoBpm : undefined,
      timingVariabilityStdDev: beatMetrics.timingVariabilityStdDev,
      wordLength:
        result.contentMode === "words" ? result.wordLength : undefined,
    }
  }

  return baseSession as ExerciseSession
}

export async function saveExerciseRun({
  patientId,
  setup,
  status,
  completedUnits,
  elapsedSeconds,
  runId,
  result,
}: SaveExerciseRunInput): Promise<ExerciseSession> {
  if (remoteAppEnabled()) {
    const session = await apiRequest<ExerciseSession>("/sessions", {
      body: JSON.stringify({
        completedUnits,
        elapsedSeconds,
        patientId,
        result,
        runId,
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

  const sessionId = runId
    ? `runtime-${patientId}-${setup.activity}-${runId}`
    : `mock-${patientId}-${setup.activity}-${Date.now()}`
  const sessionDate = new Date().toISOString()
  const durationMinutes = Math.max(0.02, round(elapsedSeconds / 60, 2))

  if (result) {
    const session = buildSessionFromResult({
      completedUnits,
      durationMinutes,
      patientId,
      result,
      sessionDate,
      sessionId,
      setup,
      status,
    })

    writeAddedSessions([session, ...readAddedSessions()])
    return session
  }

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
    rawEventPayload: null,
    keyboardLayout: setup.keyboardLayout ?? "qwerty",
    keyboardSide: setup.keyboardSide ?? "full",
    keyLabels:
      setup.activity === "letter-find"
        ? "letters"
        : (setup.keyLabels ?? "letters"),
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
    const firstAttemptHits = Math.max(
      0,
      completed - Math.min(incorrectAttempts, completed)
    )
    const firstAttemptSuccessRatePercent =
      completed === 0 ? 0 : round((firstAttemptHits / completed) * 100)
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
    const actualBpm = getEyePongActualBpm(
      setup.audioMode,
      setup.tempoBpm,
      setup.musicPlaybackRate
    )
    session = {
      ...baseSession,
      activity: "eye-pong",
      actualBpm,
      mode: setup.mode,
      pattern: setup.mode === "left-right" ? "horizontal" : "mixed",
      targetCount: setup.targetCount ?? EYE_PONG_TARGET_COUNT,
      targetChanges: completedUnits,
      completionRatePercent: getEyePongCompletionRate(
        completedUnits,
        setup.targetCount ?? EYE_PONG_TARGET_COUNT
      ),
      audioMode: setup.audioMode,
      intervalMs: getEyePongIntervalMs(actualBpm),
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
