import type { ReactNode } from "react"

export type Clinic = {
  name: string
  doctorName: string
  address: string
}

export type ActivityType =
  | "Letter Target"
  | "Letter Find"
  | "Eye Pong"
  | "Inhibition Challenge"
  | "Motor Sequence Builder"

export type ActivitySlug =
  | "letter-target"
  | "letter-find"
  | "eye-pong"
  | "inhibition-challenge"
  | "motor-sequence-builder"

export type ReportSlug = ActivitySlug | "all-exercises"

export type Patient = {
  id: string
  name: string
  totalSessions: number
  lastSession: string
  exerciseTotals: Record<ActivityType, number>
}

export type AudioMode = "silent" | "metronome" | "music"
export type LetterContentMode = "letters" | "words"
export type WordLength = "0-5" | "5-10" | "10+"
export type EyePongPattern = "left-right" | "random"
export type InhibitionRulePreset = "balanced" | "go-heavy" | "stop-heavy"
export type SequenceContentType = "letter-sequence" | "word-sequence"
export type ExerciseStatus = "setup" | "running" | "results"

export type ExerciseDefinition = {
  id: ActivityType
  purpose: string
  description: string
  disclaimer?: string
}

export type LetterExerciseConfig = {
  activity: "Letter Target" | "Letter Find"
  contentMode: LetterContentMode
  itemsPerSession: number
  wordLength: WordLength
  audioMode: AudioMode
  tempo: number
}

export type EyePongConfig = {
  activity: "Eye Pong"
  pattern: EyePongPattern
  targetChanges: number
  audioMode: AudioMode
  tempo: number
}

export type InhibitionChallengeConfig = {
  activity: "Inhibition Challenge"
  trialCount: number
  rulePreset: InhibitionRulePreset
  responseWindow: number
  cueSpeed: number
}

export type MotorSequenceBuilderConfig = {
  activity: "Motor Sequence Builder"
  contentType: SequenceContentType
  sequenceLength: number
  sequenceCount: number
  presentationSpeed: number
  audioMode: AudioMode
}

export type ExerciseConfig =
  | LetterExerciseConfig
  | EyePongConfig
  | InhibitionChallengeConfig
  | MotorSequenceBuilderConfig

export type LetterExerciseResult = {
  activity: "Letter Target" | "Letter Find"
  status: "completed" | "ended-early"
  itemsCompleted: number
  itemsTotal: number
  firstAttemptAccuracy: number
  meanCorrectLatencyMs: number
  incorrectAttempts: number
}

export type EyePongResult = {
  activity: "Eye Pong"
  status: "completed" | "ended-early"
  mode: string
  targetChangesCompleted: number
  targetChangesTotal: number
  tempo: string
}

export type InhibitionChallengeResult = {
  activity: "Inhibition Challenge"
  status: "completed" | "ended-early"
  goTrialAccuracy: number
  noGoInhibitionAccuracy: number
  missedGoRate: number
  meanGoLatencyMs: number
}

export type MotorSequenceBuilderResult = {
  activity: "Motor Sequence Builder"
  status: "completed" | "ended-early"
  sequenceCompletionRate: number
  firstAttemptSequenceAccuracy: number
  longestCompletedSequence: number
  meanCompletionTimeMs: number
}

export type ExerciseResult =
  | LetterExerciseResult
  | EyePongResult
  | InhibitionChallengeResult
  | MotorSequenceBuilderResult

export type ExerciseViewState = {
  config: ExerciseConfig
  status: ExerciseStatus
  progress: number
  result: ExerciseResult | null
}

export type ExerciseStateMap = Record<ActivityType, ExerciseViewState>

export type ResultMetric = {
  label: string
  value: string
}

export type SessionHistoryEntry = {
  id: string
  activity: ActivityType
  status: "completed" | "ended-early"
  completedAt: string
  summary: string
  result: ExerciseResult
}

export type LatestResultEntry = {
  result: ExerciseResult
  config: ExerciseConfig
  completedAt: string
  summary: string
}

export type PatientRecord = Patient & {
  selectedActivity: ActivityType
  exerciseStates: ExerciseStateMap
  latestResult: LatestResultEntry | null
  history: SessionHistoryEntry[]
}

export type TrendChartPoint = {
  label: string
  value: number
  displayValue: string
}

export type TrendChartDefinition = {
  title: string
  description: string
  color: string
  points: TrendChartPoint[]
}

export type RunningDetailSection = {
  title: string
  description?: string
  items: {
    label: string
    value: string
    tone?: "default" | "success" | "warning"
  }[]
}

export type SummaryMetricCard = {
  label: string
  value?: string
  breakdown?: {
    lowest: string
    highest: string
    average: string
  }
}

export type MockHistorySeed = {
  activity: ActivityType
  completedAt: string
  summary: string
}

export type MockPatientSeed = {
  patient: Patient
  initialHistory: MockHistorySeed[]
  latestResultActivity?: ActivityType
  latestResultCompletedAt?: string
}

export type ChoiceOption<T extends string> = {
  value: T
  label: string
}

export type IconLabelValueProps = {
  icon?: ReactNode
  label: string
  value: string
}
