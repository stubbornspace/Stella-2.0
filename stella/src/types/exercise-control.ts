import type { ExerciseType, SessionStatus } from "@/types"

export type RunnableExerciseType = Extract<
  ExerciseType,
  | "letter-target"
  | "letter-find"
  | "eye-pong"
  | "inhibition-challenge"
  | "motor-sequence-builder"
>

export type ExerciseAudioMode = "silent" | "metronome" | "music"
export type WordLength = "0-5" | "5-10" | "10+"

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

export interface SaveExerciseRunInput {
  patientId: string
  setup: ExerciseSetup
  status: SessionStatus
  completedUnits: number
  elapsedSeconds: number
}
