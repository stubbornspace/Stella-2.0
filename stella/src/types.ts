export interface Patient {
  id: string
  patientCode: string
  firstName: string
  lastName: string
  createdAt: string
  notes?: string
}

export type ExerciseType =
  | "letter-target"
  | "letter-find"
  | "eye-pong"
  | "inhibition-challenge"
  | "motor-sequence-builder"

export type SessionStatus = "completed" | "ended-early"

export interface BaseSession {
  sessionId: string
  patientId: string
  activity: ExerciseType
  sessionDate: string
  status: SessionStatus
  summary: string
  activeEngagementTimeMinutes?: number
  totalSessionDurationMinutes?: number
  attemptsPerMinute?: number
  pauseBreakCount?: number
}

export interface LetterTargetSession extends BaseSession {
  activity: "letter-target"
  contentMode: "letters" | "words"
  itemsPerSession: number
  wordLength?: "0-5" | "5-10" | "10+"
  audioMode: "silent" | "metronome" | "music"
  tempoBpm?: number
  itemsCompleted: number
  itemsTotal: number
  totalAttempts: number
  correctHits: number
  accuracyPercent: number
  firstAttemptSuccessRatePercent: number
  meanCorrectLatencyMs: number
  incorrectAttempts: number
  latencyVariabilityStdDev?: number
  onBeatAccuracyPercent?: number
  timingVariabilityStdDev?: number
  directionalConsistencyPercent?: number
}

export interface LetterFindSession extends BaseSession {
  activity: "letter-find"
  contentMode: "letters" | "words"
  itemsCompleted: number
  itemsTotal: number
  totalAttempts: number
  correctHits: number
  accuracyPercent: number
  firstAttemptSuccessRatePercent: number
  meanCorrectLatencyMs: number
  incorrectAttempts: number
  audioMode: "spoken-cue" | "metronome" | "music"
  tempoBpm?: number
}

export interface EyePongSession extends BaseSession {
  activity: "eye-pong"
  pattern: "horizontal" | "vertical" | "diagonal" | "mixed"
  targetChanges: number
  completionRatePercent: number
  audioMode: "silent" | "metronome" | "music"
  tempoBpm?: number
}

export interface InhibitionChallengeSession extends BaseSession {
  activity: "inhibition-challenge"
  trials: number
  rulePreset: "color" | "letter" | "mixed"
  goAccuracyPercent: number
  noGoAccuracyPercent: number
  missedGoRatePercent: number
  meanGoLatencyMs: number
  responseWindowMs: number
}

export interface MotorSequenceBuilderSession extends BaseSession {
  activity: "motor-sequence-builder"
  contentType: "letters" | "words" | "mixed"
  sequenceLength: number
  sequenceCompletionRatePercent: number
  firstAttemptSequenceAccuracyPercent: number
  longestCompletedSequence: number
  meanCompletionTimeMs: number
}

export type ExerciseSession =
  | LetterTargetSession
  | LetterFindSession
  | EyePongSession
  | InhibitionChallengeSession
  | MotorSequenceBuilderSession

export type MetricFormat =
  | "percent"
  | "milliseconds"
  | "count"
  | "duration"
  | "decimal"
  | "text"

export interface MetricDefinition {
  key: string
  label: string
  shortLabel?: string
  format?: MetricFormat
}

export interface SessionFilterDefinition {
  key: string
  label: string
}

export interface ExerciseDefinition {
  id: ExerciseType
  label: string
  description: string
  patientSummary: MetricDefinition[]
  summaryCards: MetricDefinition[]
  charts: MetricDefinition[]
  tableColumns: MetricDefinition[]
  configurationFilters: SessionFilterDefinition[]
}

export interface DashboardStats {
  totalPatients: number
  totalSessions: number
  sessionsThisMonth: number
  activePatients: number
}

export interface PatientWithStats extends Patient {
  fullName: string
  totalSessions: number
  exerciseCount: number
  lastSessionDate?: string
  isActive: boolean
}

export interface ExerciseSummary {
  activity: ExerciseType
  sessions: number
  lastSessionDate: string
  primaryMetric: string
  secondaryMetric: string
}
