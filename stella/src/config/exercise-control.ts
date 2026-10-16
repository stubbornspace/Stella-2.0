import type { ExerciseType } from "@/types"
import {
  getAvailableWordRanges,
  normalizeWordLengthRange,
} from "@/content/word-library"
import type {
  ExerciseSetup,
  EyePongSetup,
  InhibitionChallengeSetup,
  KeyboardRuntimeExerciseType,
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
    setupSummary: "Configure Go and Stop response-control trials.",
  },
]

const defaultWordLength = getAvailableWordRanges()[0] ?? "0-5"

const defaultLetterTargetSetup: LetterTargetSetup = {
  activity: "letter-target",
  keyboardLayout: "qwerty",
  keyboardSide: "full",
  keyLabels: "letters",
  contentMode: "letters",
  numberOfLetters: 3,
  numberOfWords: 3,
  audioMode: "metronome",
  tempoBpm: 54,
  musicPlaybackRate: 1,
  wordLength: defaultWordLength,
}

const defaultLetterFindSetup: LetterFindSetup = {
  activity: "letter-find",
  keyboardLayout: "qwerty",
  keyboardSide: "full",
  keyLabels: "letters",
  contentMode: "letters",
  numberOfLetters: 3,
  numberOfWords: 3,
  audioMode: "metronome",
  tempoBpm: 54,
  musicPlaybackRate: 1,
  wordLength: defaultWordLength,
}

const defaultEyePongSetup: EyePongSetup = {
  activity: "eye-pong",
  keyboardLayout: "qwerty",
  keyboardSide: "full",
  keyLabels: "blank",
  mode: "left-right",
  targetCount: 4,
  audioMode: "metronome",
  tempoBpm: 54,
  musicPlaybackRate: 1,
}

const defaultInhibitionChallengeSetup: InhibitionChallengeSetup = {
  activity: "inhibition-challenge",
  keyboardLayout: "qwerty",
  keyboardSide: "full",
  keyLabels: "letters",
  trialCount: 12,
  rulePreset: "balanced",
  responseWindowMs: 1200,
  cueSpeedBpm: 68,
}

const defaultMotorSequenceBuilderSetup: MotorSequenceBuilderSetup = {
  activity: "motor-sequence-builder",
  keyboardLayout: "qwerty",
  keyboardSide: "full",
  keyLabels: "letters",
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

const keyboardRuntimeExerciseTypes: KeyboardRuntimeExerciseType[] = [
  "letter-target",
  "letter-find",
  "eye-pong",
  "inhibition-challenge",
]

export function getDefaultExerciseSetup(
  activity: RunnableExerciseType
): ExerciseSetup {
  return { ...defaultSetups[activity] }
}

export function normalizeExerciseSetup(setup: ExerciseSetup): ExerciseSetup {
  const normalized = {
    ...getDefaultExerciseSetup(setup.activity),
    ...setup,
  } as ExerciseSetup

  if (normalized.activity === "letter-find") {
    return {
      ...normalized,
      keyboardSide:
        normalized.contentMode === "words" ? "full" : normalized.keyboardSide,
      keyLabels: "letters",
      wordLength: normalizeWordLengthRange(normalized.wordLength),
    }
  }

  if (normalized.activity === "letter-target") {
    return {
      ...normalized,
      keyboardSide:
        normalized.contentMode === "words" ? "full" : normalized.keyboardSide,
      keyLabels: "letters",
      wordLength: normalizeWordLengthRange(normalized.wordLength),
    }
  }

  if (normalized.activity === "eye-pong") {
    return {
      ...normalized,
      keyboardLayout: "qwerty",
      keyboardSide:
        normalized.mode === "left-right" ? "full" : normalized.keyboardSide,
      keyLabels: "blank",
    }
  }

  return normalized
}

export function isRunnableExercise(
  activity: ExerciseType
): activity is RunnableExerciseType {
  return exerciseControlDefinitions.some(
    (definition) =>
      definition.id === activity && definition.availability === "available"
  )
}

export function supportsKeyboardRuntime(
  activity: RunnableExerciseType
): activity is KeyboardRuntimeExerciseType {
  return keyboardRuntimeExerciseTypes.includes(
    activity as KeyboardRuntimeExerciseType
  )
}
