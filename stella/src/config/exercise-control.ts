import type { ExerciseType } from "@/types"
import type {
  ExerciseSetup,
  EyePongSetup,
  InhibitionChallengeSetup,
  LetterFindSetup,
  LetterTargetSetup,
  MotorSequenceBuilderSetup,
  RunnableExerciseType,
} from "@/types/exercise-control"

export type ExerciseControlDefinition = {
  id: ExerciseType
  availability: "available" | "coming-soon"
  setupSummary: string
}

export const exerciseControlDefinitions: ExerciseControlDefinition[] = [
  {
    id: "letter-target",
    availability: "available",
    setupSummary: "Configure visually guided letter or word targeting.",
  },
  {
    id: "letter-find",
    availability: "available",
    setupSummary:
      "Configure audio-guided search without an advance visual cue.",
  },
  {
    id: "eye-pong",
    availability: "available",
    setupSummary: "Configure left/right or random visual target tracking.",
  },
  {
    id: "inhibition-challenge",
    availability: "available",
    setupSummary: "Configure Go, No-Go and Wait response-control trials.",
  },
  {
    id: "motor-sequence-builder",
    availability: "available",
    setupSummary:
      "Configure presented letter or word sequences for guided reproduction.",
  },
]

const defaultLetterTargetSetup: LetterTargetSetup = {
  activity: "letter-target",
  contentMode: "letters",
  numberOfLetters: 3,
  numberOfWords: 3,
  audioMode: "metronome",
  tempoBpm: 54,
  musicPlaybackRate: 1,
}

const defaultLetterFindSetup: LetterFindSetup = {
  activity: "letter-find",
  contentMode: "letters",
  numberOfLetters: 3,
  numberOfWords: 3,
  audioMode: "metronome",
  tempoBpm: 54,
  musicPlaybackRate: 1,
}

const defaultEyePongSetup: EyePongSetup = {
  activity: "eye-pong",
  mode: "left-right",
  audioMode: "metronome",
  tempoBpm: 54,
  musicPlaybackRate: 1,
}

const defaultInhibitionChallengeSetup: InhibitionChallengeSetup = {
  activity: "inhibition-challenge",
  trialCount: 12,
  rulePreset: "balanced",
  responseWindowMs: 1200,
  cueSpeedBpm: 68,
}

const defaultMotorSequenceBuilderSetup: MotorSequenceBuilderSetup = {
  activity: "motor-sequence-builder",
  contentType: "letter-sequence",
  sequenceLength: 3,
  sequenceCount: 5,
  presentationSpeedBpm: 72,
  audioMode: "metronome",
}

const defaultSetups: Record<RunnableExerciseType, ExerciseSetup> = {
  "letter-target": defaultLetterTargetSetup,
  "letter-find": defaultLetterFindSetup,
  "eye-pong": defaultEyePongSetup,
  "inhibition-challenge": defaultInhibitionChallengeSetup,
  "motor-sequence-builder": defaultMotorSequenceBuilderSetup,
}

export function getDefaultExerciseSetup(
  activity: RunnableExerciseType
): ExerciseSetup {
  return { ...defaultSetups[activity] }
}

export function isRunnableExercise(
  activity: ExerciseType
): activity is RunnableExerciseType {
  return exerciseControlDefinitions.some(
    (definition) =>
      definition.id === activity && definition.availability === "available"
  )
}
