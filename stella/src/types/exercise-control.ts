import type { ExerciseType, SessionStatus } from "@/types"

export type RunnableExerciseType = Extract<
  ExerciseType,
  | "letter-target"
  | "letter-find"
  | "eye-pong"
  | "inhibition-challenge"
  | "motor-sequence-builder"
>

export type KeyboardRuntimeExerciseType = Extract<
  RunnableExerciseType,
  | "letter-target"
  | "letter-find"
  | "eye-pong"
  | "inhibition-challenge"
  | "motor-sequence-builder"
>

export type ExerciseAudioMode = "silent" | "metronome" | "music"
export type WordLength = "3" | "4" | "5" | "6" | "7" | "8"
export type HistoricalWordLength = "0-5" | "5-10" | "10+"

interface BaseExerciseSetup {
  activity: RunnableExerciseType
}

interface AudioExerciseSetup extends BaseExerciseSetup {
  audioMode: ExerciseAudioMode
  tempoBpm?: number
  musicPlaybackRate?: number
}

export interface LetterTargetSetup extends AudioExerciseSetup {
  activity: "letter-target"
  contentMode: "letters" | "words"
  numberOfLetters: number
  numberOfWords: number
  wordLength?: WordLength
}

export interface LetterFindSetup extends AudioExerciseSetup {
  activity: "letter-find"
  contentMode: "letters" | "words"
  numberOfLetters: number
  numberOfWords: number
  wordLength?: WordLength
}

export interface EyePongSetup extends AudioExerciseSetup {
  activity: "eye-pong"
  mode: "left-right" | "random"
}

export interface InhibitionChallengeSetup extends BaseExerciseSetup {
  activity: "inhibition-challenge"
  trialCount: number
  rulePreset: "balanced" | "go-heavy" | "stop-heavy"
  responseWindowMs: number
  cueSpeedBpm: number
}

export interface MotorSequenceBuilderSetup extends BaseExerciseSetup {
  activity: "motor-sequence-builder"
  contentType: "letter-sequence" | "word-sequence"
  sequenceLength: number
  sequenceCount: number
  presentationSpeedBpm: number
  audioMode: ExerciseAudioMode
}

export type ExerciseSetup =
  | LetterTargetSetup
  | LetterFindSetup
  | EyePongSetup
  | InhibitionChallengeSetup
  | MotorSequenceBuilderSetup

export interface LetterRuntimeStat {
  letter: string
  attempts: number
  timeMs: number
  beatIndex?: number
  beatOffsetMs?: number
  beatOffsetBasis?: "previous-beat" | "nearest-beat"
  targetStartedAt?: string
  completedAt?: string
  attemptEvents?: Array<{
    pressedLetter: string
    correct: boolean
    timestamp: string
    beatIndex?: number
    beatOffsetMs?: number
    beatOffsetBasis?: "previous-beat" | "nearest-beat"
  }>
}

interface BaseExerciseRunResult {
  activity: KeyboardRuntimeExerciseType
  elapsedSeconds: number
}

export interface LetterTargetRunResult extends BaseExerciseRunResult {
  activity: "letter-target"
  actualBpm?: number
  audioMode: ExerciseAudioMode
  contentMode: "letters" | "words"
  selectedWords?: string[]
  stats: LetterRuntimeStat[]
  wordLength?: WordLength
}

export interface LetterFindRunResult extends BaseExerciseRunResult {
  activity: "letter-find"
  actualBpm?: number
  audioMode: ExerciseAudioMode
  contentMode: "letters" | "words"
  selectedWords?: string[]
  stats: LetterRuntimeStat[]
  wordLength?: WordLength
}

export interface EyePongCueEvent {
  sequence: number
  keyId: number
  letter: string
  scheduledOffsetMs: number
  presentedOffsetMs: number
  presentationDelayMs: number
}

export interface EyePongRunResult extends BaseExerciseRunResult {
  activity: "eye-pong"
  actualBpm: number
  audioMode: ExerciseAudioMode
  completionRatePercent: number
  cueEvents: EyePongCueEvent[]
  mode: "left-right" | "random"
  targetCount: number
  targetChanges: number
}

export type InhibitionCue = "go" | "no-go" | "wait"

export interface InhibitionPressEvent {
  keyId: number
  letter: string
  offsetMs: number
  correct: boolean
}

export interface InhibitionTrialEvent {
  trialIndex: number
  cue: InhibitionCue
  targetKeyId: number
  targetLetter: string
  cueOffsetMs: number
  windowEndOffsetMs?: number
  windowClosed: boolean
  outcome: "correct" | "incorrect" | "missed" | "stopped"
  presses: InhibitionPressEvent[]
}

export interface InhibitionChallengeRunResult extends BaseExerciseRunResult {
  activity: "inhibition-challenge"
  trialCount: number
  rulePreset: InhibitionChallengeSetup["rulePreset"]
  responseWindowMs: number
  cueSpeedBpm: number
  trials: InhibitionTrialEvent[]
}

export interface MotorSequencePresentationEvent {
  keyId: number
  letter: string
  offsetMs: number
}

export interface MotorSequencePressEvent {
  keyId: number
  letter: string
  expectedKeyId: number
  expectedLetter: string
  offsetMs: number
  correct: boolean
}

export interface MotorSequenceEvent {
  sequenceIndex: number
  text: string
  keyIds: number[]
  presentations: MotorSequencePresentationEvent[]
  reproductionStartedOffsetMs?: number
  presses: MotorSequencePressEvent[]
  completedOffsetMs?: number
}

export interface MotorSequenceBuilderRunResult extends BaseExerciseRunResult {
  activity: "motor-sequence-builder"
  audioMode: ExerciseAudioMode
  contentType: MotorSequenceBuilderSetup["contentType"]
  sequenceLength: number
  sequenceCount: number
  presentationSpeedBpm: number
  sequences: MotorSequenceEvent[]
}

export type ExerciseRunResult =
  | LetterTargetRunResult
  | LetterFindRunResult
  | EyePongRunResult
  | InhibitionChallengeRunResult
  | MotorSequenceBuilderRunResult

export interface SaveExerciseRunInput {
  patientId: string
  setup: ExerciseSetup
  status: SessionStatus
  completedUnits: number
  elapsedSeconds: number
  runId?: string
  result?: ExerciseRunResult
}
