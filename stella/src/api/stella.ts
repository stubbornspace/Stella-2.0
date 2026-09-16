import { startOfMonth, subDays } from "date-fns"

import { exerciseDefinitions } from "@/config/exercises"
import { seedPatients, seedSessions } from "@/data/seed"
import type {
  DashboardStats,
  ExerciseSession,
  ExerciseSummary,
  ExerciseType,
  Patient,
  PatientWithStats,
} from "@/types"

const patientStorageKey = "stella-poc-patients"
const demoToday = new Date("2026-09-15T12:00:00")

export type CreatePatientInput = {
  firstName: string
  lastName: string
  notes?: string
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

  if (key === "completed" && "itemsCompleted" in session && "itemsTotal" in session) {
    return `${session.itemsCompleted}/${session.itemsTotal}`
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
  await delay()
  const patients = readPatients()
  const activeThreshold = subDays(demoToday, 30).getTime()

  return patients.map((patient) => {
    const patientSessions = seedSessions.filter((session) => session.patientId === patient.id)
    const lastSession = patientSessions.toSorted((a, b) => sessionDateValue(b) - sessionDateValue(a))[0]

    return {
      ...patient,
      fullName: fullName(patient),
      totalSessions: patientSessions.length,
      exerciseCount: new Set(patientSessions.map((session) => session.activity)).size,
      lastSessionDate: lastSession?.sessionDate,
      isActive: lastSession ? sessionDateValue(lastSession) >= activeThreshold : false,
    }
  })
}

export async function getPatient(patientId: string): Promise<Patient | undefined> {
  await delay()
  return readPatients().find((patient) => patient.id === patientId)
}

export async function createPatient(input: CreatePatientInput): Promise<Patient> {
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

export async function getPatientSessions(patientId: string): Promise<ExerciseSession[]> {
  await delay()
  return seedSessions
    .filter((session) => session.patientId === patientId)
    .toSorted((a, b) => sessionDateValue(b) - sessionDateValue(a))
}

export async function getExerciseSessions(
  patientId: string,
  exerciseType: ExerciseType
): Promise<ExerciseSession[]> {
  await delay()
  return seedSessions
    .filter((session) => session.patientId === patientId && session.activity === exerciseType)
    .toSorted((a, b) => sessionDateValue(a) - sessionDateValue(b))
}

export async function getDashboardStats(): Promise<DashboardStats> {
  await delay()
  const patients = readPatients()
  const startOfCurrentMonth = startOfMonth(demoToday).getTime()
  const activeThreshold = subDays(demoToday, 30).getTime()
  const activePatientIds = new Set(
    seedSessions
      .filter((session) => sessionDateValue(session) >= activeThreshold)
      .map((session) => session.patientId)
  )

  return {
    totalPatients: patients.length,
    totalSessions: seedSessions.length,
    sessionsThisMonth: seedSessions.filter(
      (session) => sessionDateValue(session) >= startOfCurrentMonth
    ).length,
    activePatients: patients.filter((patient) => activePatientIds.has(patient.id)).length,
  }
}

export function buildExerciseSummaries(sessions: ExerciseSession[]): ExerciseSummary[] {
  const summaries = new Map<ExerciseType, ExerciseSession[]>()

  for (const session of sessions) {
    summaries.set(session.activity, [...(summaries.get(session.activity) ?? []), session])
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
    .toSorted((a, b) => sessionDateValue({ sessionDate: b.lastSessionDate } as ExerciseSession) - sessionDateValue({ sessionDate: a.lastSessionDate } as ExerciseSession))
}
