import { ArrowLeft, Check, Square } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Navigate, useNavigate, useParams } from "react-router-dom"

import { useSaveExerciseRun, usePatient } from "@/hooks/use-stella"
import { Button } from "@/components/ui/button"
import { KeyboardLayout } from "@/components/exercise-runtime/keyboard-layout"
import { getPromptById } from "@/content/prompt-library"
import {
  getAvailableWordLengths,
  pickRandomWords,
  type WordEntry,
} from "@/content/word-library"
import { getRuntimePreloadUrls } from "@/content/audio-manifest"
import {
  LETTER_KEYS,
  LETTER_TO_KEY,
  KEY_TO_LETTER,
  type KeyState,
} from "@/lib/audio/constants"
import { preloadAudio, playAudio, unlockAudio } from "@/lib/audio/sound-manager"
import { STOMP_DOWNBEAT_BPM } from "@/lib/audio/stomp-beat-map"
import {
  useKeyboardGameEngine,
  type AudioConfig,
  type LetterStat,
} from "@/hooks/use-keyboard-game-engine"
import { useMetronome } from "@/hooks/use-metronome"
import { useMusic } from "@/hooks/use-music"
import {
  clearPendingExerciseRun,
  loadPendingExerciseRun,
  saveRerunExerciseSetup,
} from "@/lib/exercise-runtime/session-storage"
import {
  EYE_PONG_TARGET_COUNT,
  getEyePongActualBpm,
  getEyePongCompletionRate,
  getEyePongIntervalMs,
} from "@/lib/exercise-runtime/eye-pong"
import { supportsKeyboardRuntime } from "@/config/exercise-control"
import { exerciseDefinitions } from "@/config/exercises"
import { cn } from "@/lib/utils"
import type {
  ExerciseAudioMode,
  ExerciseSetup,
  ExerciseRunResult,
  EyePongCueEvent,
  EyePongRunResult,
  KeyboardRuntimeExerciseType,
  LetterFindRunResult,
  LetterFindSetup,
  LetterTargetRunResult,
  LetterTargetSetup,
} from "@/types/exercise-control"

function promptAudio(id: string) {
  const prompt = getPromptById(id)
  if (!prompt) {
    throw new Error(`Unknown prompt: ${id}`)
  }
  return prompt.audioPath
}

const CORRECT_PROMPT = "/audio/effects/legacy-correct.mp3"
const WRONG_PROMPTS = [
  promptAudio("wrong-01"),
  promptAudio("wrong-02"),
  promptAudio("wrong-03"),
]
const GREAT_JOB_PROMPT = promptAudio("great-job-01")
const ENCOURAGEMENT_PROMPT = promptAudio("youve-got-this-01")
const READY_TO_PLAY_PROMPT = promptAudio("ready-to-play-01")
const LETTER_TARGET_BEAT_PROMPT = promptAudio("tap-green-letters-beat-01")
const LETTER_TARGET_SILENT_PROMPT = promptAudio("tap-green-letters-01")
const LETTER_TARGET_WORD_BEAT_PROMPT = promptAudio("spell-word-beat-01")
const LETTER_TARGET_WORD_SILENT_PROMPT = promptAudio("spell-word-01")
const LETTER_FIND_BEAT_PROMPT = promptAudio("find-letter-beat-01")
const LETTER_FIND_SILENT_PROMPT = promptAudio("find-letter-01")
const LETTER_FIND_WORD_PROMPT = promptAudio("find-letters-spell-word-01")
const LETTER_FIND_HIT_LETTER_PROMPT = promptAudio("hit-the-letter-01")
const EYE_PONG_PROMPT = promptAudio("follow-lights-01")

function getActualBpm(
  audioMode: ExerciseAudioMode,
  tempoBpm?: number,
  musicPlaybackRate?: number
) {
  if (audioMode === "silent") {
    return undefined
  }

  if (audioMode === "music") {
    return STOMP_DOWNBEAT_BPM * (musicPlaybackRate ?? 1)
  }

  return tempoBpm
}

function buildLetterTargetAudioConfig(
  setup: LetterTargetSetup,
  selectedWords: WordEntry[],
  overrides?: Pick<AudioConfig, "hint" | "onCorrect">
): AudioConfig {
  const noBeat = setup.audioMode === "silent"
  const instructionPrompt =
    setup.contentMode === "words"
      ? noBeat
        ? LETTER_TARGET_WORD_SILENT_PROMPT
        : LETTER_TARGET_WORD_BEAT_PROMPT
      : noBeat
        ? LETTER_TARGET_SILENT_PROMPT
        : LETTER_TARGET_BEAT_PROMPT

  if (setup.contentMode === "letters") {
    return {
      instruction: [READY_TO_PLAY_PROMPT, instructionPrompt],
      correct: CORRECT_PROMPT,
      wrong: WRONG_PROMPTS,
      letterSound: (letter) => `/audio/letters/${letter.toLowerCase()}.mp3`,
      finish: [GREAT_JOB_PROMPT],
      hint: [ENCOURAGEMENT_PROMPT, instructionPrompt],
      preload: getRuntimePreloadUrls([instructionPrompt, GREAT_JOB_PROMPT]),
    }
  }

  return {
    instruction: async () => {
      await playAudio(READY_TO_PLAY_PROMPT)
      await playAudio(instructionPrompt)
      const firstWord = selectedWords[0]
      if (firstWord) {
        await playAudio(firstWord.audio.spellPrompt)
      }
    },
    correct: CORRECT_PROMPT,
    wrong: WRONG_PROMPTS,
    letterSound: (letter) => `/audio/letters/${letter.toLowerCase()}.mp3`,
    finish: [],
    hint: overrides?.hint ?? [ENCOURAGEMENT_PROMPT, instructionPrompt],
    onCorrect:
      overrides?.onCorrect ??
      (async (letter) => {
        await playAudio(`/audio/letters/${letter.toLowerCase()}.mp3`)
      }),
    preload: getRuntimePreloadUrls([
      instructionPrompt,
      ...selectedWords.flatMap((word) => [
        word.audio.spellPrompt,
        word.audio.word,
      ]),
    ]),
  }
}

function buildLetterFindAudioConfig(
  setup: LetterFindSetup,
  selectedWords: WordEntry[],
  overrides?: Pick<AudioConfig, "hint" | "onCorrect">
): AudioConfig {
  if (setup.contentMode === "letters") {
    const instructionPrompt =
      setup.audioMode === "silent"
        ? LETTER_FIND_SILENT_PROMPT
        : LETTER_FIND_BEAT_PROMPT

    return {
      instruction: async (sequence) => {
        await playAudio(READY_TO_PLAY_PROMPT)
        await playAudio(instructionPrompt)
        const firstLetter = KEY_TO_LETTER[sequence[0]!]
        await playAudio(LETTER_FIND_HIT_LETTER_PROMPT)
        await playAudio(`/audio/letters/${firstLetter.toLowerCase()}.mp3`)
      },
      correct: CORRECT_PROMPT,
      wrong: WRONG_PROMPTS,
      letterSound: (letter) => `/audio/letters/${letter.toLowerCase()}.mp3`,
      finish: [GREAT_JOB_PROMPT],
      hint: async (letter) => {
        await playAudio(ENCOURAGEMENT_PROMPT)
        await playAudio(LETTER_FIND_HIT_LETTER_PROMPT)
        await playAudio(`/audio/letters/${letter.toLowerCase()}.mp3`)
      },
      onCorrect: async (letter, nextLetter) => {
        await playAudio(`/audio/letters/${letter.toLowerCase()}.mp3`)
        if (nextLetter) {
          await playAudio(LETTER_FIND_HIT_LETTER_PROMPT)
          await playAudio(`/audio/letters/${nextLetter.toLowerCase()}.mp3`)
        }
      },
      preload: getRuntimePreloadUrls([
        instructionPrompt,
        LETTER_FIND_HIT_LETTER_PROMPT,
        GREAT_JOB_PROMPT,
      ]),
    }
  }

  const runtimeWords = selectedWords

  return {
    instruction: async () => {
      await playAudio(READY_TO_PLAY_PROMPT)
      await playAudio(LETTER_FIND_WORD_PROMPT)
      const firstWord = runtimeWords[0]
      if (firstWord) {
        await playAudio(firstWord.audio.spellPrompt)
      }
    },
    correct: CORRECT_PROMPT,
    wrong: WRONG_PROMPTS,
    letterSound: (letter) => `/audio/letters/${letter.toLowerCase()}.mp3`,
    finish: [],
    hint:
      overrides?.hint ??
      (async () => {
        await playAudio(ENCOURAGEMENT_PROMPT)
        const firstWord = runtimeWords[0]
        if (firstWord) {
          await playAudio(firstWord.audio.spellPrompt)
        }
      }),
    onCorrect:
      overrides?.onCorrect ??
      (async (letter) => {
        await playAudio(`/audio/letters/${letter.toLowerCase()}.mp3`)
      }),
    preload: getRuntimePreloadUrls([
      LETTER_FIND_WORD_PROMPT,
      ...runtimeWords.flatMap((word) => [
        word.audio.spellPrompt,
        word.audio.word,
      ]),
    ]),
  }
}

function buildRandomLetterSequence(count: number) {
  return Array.from(
    { length: count },
    () => LETTER_KEYS[Math.floor(Math.random() * LETTER_KEYS.length)]!
  )
}

function buildWordSequence(words: WordEntry[]) {
  return words.flatMap((word) =>
    word.key
      .toUpperCase()
      .split("")
      .map((letter) => LETTER_TO_KEY[letter]!)
  )
}

function computeCompletedWords(stats: LetterStat[], words: WordEntry[]) {
  let offset = 0
  let completedWords = 0

  for (const word of words) {
    const nextOffset = offset + word.key.length
    if (stats.length >= nextOffset) {
      completedWords += 1
      offset = nextOffset
      continue
    }
    break
  }

  return completedWords
}

function getWordAtLetterIndex(words: WordEntry[], letterIndex: number) {
  let offset = 0

  for (let wordIndex = 0; wordIndex < words.length; wordIndex += 1) {
    const word = words[wordIndex]!
    const nextOffset = offset + word.key.length
    if (letterIndex < nextOffset) {
      return { nextOffset, word, wordIndex }
    }
    offset = nextOffset
  }

  return undefined
}

function getTotalUnits(setup: ExerciseSetup) {
  switch (setup.activity) {
    case "letter-target":
    case "letter-find":
      return setup.contentMode === "letters"
        ? setup.numberOfLetters
        : setup.numberOfWords
    case "eye-pong":
      return EYE_PONG_TARGET_COUNT
  }
}

function formatElapsedTime(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`
}

function summarizeLetterStats(stats: LetterStat[]) {
  const totalAttempts = stats.reduce((sum, stat) => sum + stat.attempts, 0)
  const firstAttemptHits = stats.filter((stat) => stat.attempts === 1).length
  const averageLatencyMs =
    stats.length > 0
      ? Math.round(
          stats.reduce((sum, stat) => sum + stat.timeMs, 0) / stats.length
        )
      : 0

  return {
    averageLatencyMs,
    firstAttemptRate:
      stats.length > 0
        ? Math.round((firstAttemptHits / stats.length) * 100)
        : 0,
    totalAttempts,
  }
}

function FinishedRuntimeSession({
  patientId,
  patientName,
  result,
  runStatus,
  completedUnits,
  setup,
  totalUnits,
}: {
  patientId: string
  patientName: string
  result: ExerciseRunResult
  runStatus: "completed" | "ended-early"
  completedUnits: number
  setup: ExerciseSetup
  totalUnits: number
}) {
  const navigate = useNavigate()
  const definition = exerciseDefinitions[result.activity]
  const completed = runStatus === "completed"

  const handleRunAgain = useCallback(() => {
    saveRerunExerciseSetup({
      patientId,
      savedAt: `${Date.now()}`,
      setup: { ...setup },
    })
    navigate(`/patients/${patientId}?tab=exercise-control`)
  }, [navigate, patientId, setup])

  const summaryCards =
    result.activity === "eye-pong"
      ? [
          { label: "Status", value: completed ? "Completed" : "Ended Early" },
          {
            label: "Duration",
            value: formatElapsedTime(result.elapsedSeconds),
          },
          { label: "Progress", value: `${completedUnits} of ${totalUnits}` },
          {
            label: "Mode",
            value: result.mode === "left-right" ? "Left / Right" : "Random",
          },
          {
            label: "Protocol Completion",
            value: `${Math.round(result.completionRatePercent)}%`,
          },
          { label: "Targets Presented", value: String(result.targetChanges) },
        ]
      : (() => {
          const metrics = summarizeLetterStats(result.stats)
          return [
            { label: "Status", value: completed ? "Completed" : "Ended Early" },
            {
              label: "Duration",
              value: formatElapsedTime(result.elapsedSeconds),
            },
            { label: "Progress", value: `${completedUnits} of ${totalUnits}` },
            {
              label: "Content",
              value:
                result.contentMode === "letters"
                  ? "Letters"
                  : `${result.wordLength ?? "?"}-letter words`,
            },
            { label: "Attempts", value: String(metrics.totalAttempts) },
            {
              label: "First-Try Accuracy",
              value: `${metrics.firstAttemptRate}%`,
            },
            { label: "Avg Latency", value: `${metrics.averageLatencyMs} ms` },
            {
              label: "Beat",
              value:
                result.audioMode === "silent"
                  ? "None"
                  : result.audioMode === "music"
                    ? `Music${result.actualBpm ? ` · ${Math.round(result.actualBpm)} BPM` : ""}`
                    : `Metronome${result.actualBpm ? ` · ${Math.round(result.actualBpm)} BPM` : ""}`,
            },
          ]
        })()

  return (
    <main className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-[1440px] flex-col gap-4 px-6 py-6 md:px-8 md:py-8">
      <section className="mx-auto w-full max-w-4xl rounded-lg border bg-card p-6">
        <div
          className={cn(
            "flex size-12 items-center justify-center rounded-full",
            completed
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground"
          )}
        >
          {completed ? <Check /> : <Square />}
        </div>
        <div className="mt-5">
          <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {completed ? "Session complete" : "Session ended early"}
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal">
            {definition.label}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {patientName} · {completedUnits} of {totalUnits} completed
          </p>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => (
            <div className="rounded-lg border bg-muted/30 p-4" key={card.label}>
              <div className="text-xs text-muted-foreground uppercase">
                {card.label}
              </div>
              <div className="mt-2 font-semibold">{card.value}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
          This session was saved to the patient dashboard and is ready for
          review.
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button onClick={handleRunAgain} type="button" variant="outline">
            Run Again
          </Button>
          <Button
            onClick={() => navigate(`/patients/${patientId}`)}
            type="button"
          >
            Back to Dashboard
          </Button>
        </div>
      </section>
    </main>
  )
}

function LetterTargetRuntime({
  setup,
  selectedWords,
  startSignal,
  active,
  onPlayingChange,
  onProgress,
  onRunComplete,
}: {
  setup: LetterTargetSetup
  selectedWords: WordEntry[]
  startSignal: number
  active: boolean
  onPlayingChange: (isPlaying: boolean) => void
  onProgress: (result: LetterTargetRunResult, completedUnits: number) => void
  onRunComplete: (result: LetterTargetRunResult, completedUnits: number) => void
}) {
  const audio = useMemo(() => {
    if (setup.contentMode === "letters") {
      return buildLetterTargetAudioConfig(setup, selectedWords)
    }

    return buildLetterTargetAudioConfig(setup, selectedWords, {
      onCorrect: async (letter, _nextLetter, completedCount) => {
        await playAudio(`/audio/letters/${letter.toLowerCase()}.mp3`)
        const progress = getWordAtLetterIndex(
          selectedWords,
          Math.max(0, completedCount - 1)
        )
        if (!progress || completedCount !== progress.nextOffset) {
          return
        }

        await playAudio(progress.word.audio.word)
        await playAudio(GREAT_JOB_PROMPT)
        const nextWord = selectedWords[progress.wordIndex + 1]
        if (nextWord) {
          await playAudio(nextWord.audio.spellPrompt)
        }
      },
      hint: async (_letter, completedCount) => {
        await playAudio(ENCOURAGEMENT_PROMPT)
        const progress = getWordAtLetterIndex(selectedWords, completedCount)
        if (progress) {
          await playAudio(progress.word.audio.spellPrompt)
        }
      },
    })
  }, [selectedWords, setup])

  const buildResult = (stats: LetterStat[]): LetterTargetRunResult => ({
    activity: "letter-target",
    actualBpm: getActualBpm(
      setup.audioMode,
      setup.tempoBpm,
      setup.musicPlaybackRate
    ),
    audioMode: setup.audioMode,
    contentMode: setup.contentMode,
    elapsedSeconds: 0,
    selectedWords: selectedWords.map((word) => word.label),
    stats,
    wordLength: setup.wordLength,
  })

  const getCompletedUnits = (stats: LetterStat[]) =>
    setup.contentMode === "letters"
      ? stats.length
      : computeCompletedWords(stats, selectedWords)

  const engine = useKeyboardGameEngine({
    audio,
    beatSource: setup.audioMode,
    bpm: setup.tempoBpm ?? 54,
    musicPlaybackRate: setup.musicPlaybackRate,
    onComplete: (stats) => {
      onRunComplete(buildResult(stats), getCompletedUnits(stats))
    },
    onStatsChange: (stats) =>
      onProgress(buildResult(stats), getCompletedUnits(stats)),
  })

  const {
    handleKeyClick,
    isInputEnabled,
    isPlaying,
    keyStates,
    preload,
    startGame,
    stopGame,
  } = engine

  useEffect(() => {
    preload()
  }, [preload])

  useEffect(() => {
    onPlayingChange(isPlaying)
  }, [isPlaying, onPlayingChange])

  const previousStartSignalRef = useRef(0)
  useEffect(() => {
    if (startSignal <= 0 || startSignal === previousStartSignalRef.current) {
      return
    }

    previousStartSignalRef.current = startSignal
    const sequence =
      setup.contentMode === "letters"
        ? buildRandomLetterSequence(setup.numberOfLetters)
        : buildWordSequence(selectedWords)
    void startGame(sequence)
  }, [
    selectedWords,
    setup.contentMode,
    setup.numberOfLetters,
    startGame,
    startSignal,
  ])

  useEffect(() => () => stopGame(), [stopGame])

  useEffect(() => {
    if (!active) {
      stopGame()
    }
  }, [active, stopGame])

  return (
    <KeyboardLayout
      disabled={!isInputEnabled}
      keyStates={keyStates}
      onKeyClick={handleKeyClick}
      beatFlashIntervalMs={
        setup.audioMode === "silent"
          ? undefined
          : (60 /
              (getActualBpm(
                setup.audioMode,
                setup.tempoBpm,
                setup.musicPlaybackRate
              ) ?? 54)) *
            1000
      }
    />
  )
}

function LetterFindRuntime({
  setup,
  selectedWords,
  startSignal,
  active,
  onPlayingChange,
  onProgress,
  onRunComplete,
}: {
  setup: LetterFindSetup
  selectedWords: WordEntry[]
  startSignal: number
  active: boolean
  onPlayingChange: (isPlaying: boolean) => void
  onProgress: (result: LetterFindRunResult, completedUnits: number) => void
  onRunComplete: (result: LetterFindRunResult, completedUnits: number) => void
}) {
  const audio = useMemo(() => {
    if (setup.contentMode === "letters") {
      return buildLetterFindAudioConfig(setup, selectedWords)
    }

    return buildLetterFindAudioConfig(setup, selectedWords, {
      onCorrect: async (letter, _nextLetter, completedCount) => {
        await playAudio(`/audio/letters/${letter.toLowerCase()}.mp3`)
        const progress = getWordAtLetterIndex(
          selectedWords,
          Math.max(0, completedCount - 1)
        )
        if (!progress || completedCount !== progress.nextOffset) {
          return
        }

        await playAudio(progress.word.audio.word)
        await playAudio(GREAT_JOB_PROMPT)
        const nextWord = selectedWords[progress.wordIndex + 1]
        if (nextWord) {
          await playAudio(nextWord.audio.spellPrompt)
        }
      },
      hint: async (_letter, completedCount) => {
        await playAudio(ENCOURAGEMENT_PROMPT)
        const progress = getWordAtLetterIndex(selectedWords, completedCount)
        if (progress) {
          await playAudio(progress.word.audio.spellPrompt)
        }
      },
    })
  }, [selectedWords, setup])

  const buildResult = (stats: LetterStat[]): LetterFindRunResult => ({
    activity: "letter-find",
    actualBpm: getActualBpm(
      setup.audioMode,
      setup.tempoBpm,
      setup.musicPlaybackRate
    ),
    audioMode: setup.audioMode,
    contentMode: setup.contentMode,
    elapsedSeconds: 0,
    selectedWords: selectedWords.map((word) => word.label),
    stats,
    wordLength: setup.wordLength,
  })

  const getCompletedUnits = (stats: LetterStat[]) =>
    setup.contentMode === "letters"
      ? stats.length
      : computeCompletedWords(stats, selectedWords)

  const engine = useKeyboardGameEngine({
    audio,
    beatSource: setup.audioMode,
    bpm: setup.tempoBpm ?? 54,
    musicPlaybackRate: setup.musicPlaybackRate,
    onComplete: (stats) => {
      onRunComplete(buildResult(stats), getCompletedUnits(stats))
    },
    onStatsChange: (stats) =>
      onProgress(buildResult(stats), getCompletedUnits(stats)),
    showTarget: false,
  })

  const {
    handleKeyClick,
    isInputEnabled,
    isPlaying,
    keyStates,
    preload,
    startGame,
    stopGame,
  } = engine

  useEffect(() => {
    preload()
  }, [preload])

  useEffect(() => {
    onPlayingChange(isPlaying)
  }, [isPlaying, onPlayingChange])

  const previousStartSignalRef = useRef(0)
  useEffect(() => {
    if (startSignal <= 0 || startSignal === previousStartSignalRef.current) {
      return
    }

    previousStartSignalRef.current = startSignal
    const sequence =
      setup.contentMode === "letters"
        ? buildRandomLetterSequence(setup.numberOfLetters)
        : buildWordSequence(selectedWords)
    void startGame(sequence)
  }, [
    selectedWords,
    setup.contentMode,
    setup.numberOfLetters,
    startGame,
    startSignal,
  ])

  useEffect(() => () => stopGame(), [stopGame])

  useEffect(() => {
    if (!active) {
      stopGame()
    }
  }, [active, stopGame])

  return (
    <KeyboardLayout
      disabled={!isInputEnabled}
      keyStates={keyStates}
      onKeyClick={handleKeyClick}
    />
  )
}

function EyePongRuntime({
  active,
  setup,
  startSignal,
  onPlayingChange,
  onProgress,
  onRunComplete,
  onRunError,
}: {
  active: boolean
  setup: {
    audioMode: ExerciseAudioMode
    mode: "left-right" | "random"
    tempoBpm?: number
    musicPlaybackRate?: number
  }
  startSignal: number
  onPlayingChange: (isPlaying: boolean) => void
  onProgress: (result: EyePongRunResult, completedUnits: number) => void
  onRunComplete: (result: EyePongRunResult) => void
  onRunError: () => void
}) {
  const [keyStates, setKeyStates] = useState<Record<number, KeyState>>({})
  const [isPlaying, setIsPlaying] = useState(false)
  const indexRef = useRef(0)
  const beatTimerRef = useRef<number | null>(null)
  const clearTargetTimerRef = useRef<number | null>(null)
  const playingRef = useRef(false)
  const cueEventsRef = useRef<EyePongCueEvent[]>([])
  const previousKeyRef = useRef<number | null>(null)
  const sessionStartedAtRef = useRef(0)
  const runTokenRef = useRef(0)
  const completionStartedRef = useRef(false)
  const stopBeatRef = useRef<() => void>(() => {})

  const leftRightKeys = useMemo(() => [LETTER_TO_KEY.A, LETTER_TO_KEY.L], [])
  const actualBpm = getEyePongActualBpm(
    setup.audioMode,
    setup.tempoBpm,
    setup.musicPlaybackRate
  )
  const intervalMs = getEyePongIntervalMs(actualBpm)
  const targetHoldMs = Math.min(
    600,
    Math.max(180, Math.round(intervalMs * 0.7))
  )

  const buildResult = useCallback((): EyePongRunResult => {
    const cueEvents = [...cueEventsRef.current]

    return {
      activity: "eye-pong",
      actualBpm,
      audioMode: setup.audioMode,
      completionRatePercent: getEyePongCompletionRate(cueEvents.length),
      cueEvents,
      elapsedSeconds:
        sessionStartedAtRef.current > 0
          ? Math.max(
              0,
              Math.round(
                (performance.now() - sessionStartedAtRef.current) / 1000
              )
            )
          : 0,
      mode: setup.mode,
      targetCount: EYE_PONG_TARGET_COUNT,
      targetChanges: cueEvents.length,
    }
  }, [actualBpm, setup.audioMode, setup.mode])

  const handleBeat = useCallback(
    (scheduledTimeMs: number) => {
      if (
        !playingRef.current ||
        completionStartedRef.current ||
        cueEventsRef.current.length >= EYE_PONG_TARGET_COUNT
      ) {
        return
      }

      let keyId: number

      if (setup.mode === "left-right") {
        keyId = leftRightKeys[indexRef.current % leftRightKeys.length]!
        indexRef.current += 1
      } else {
        const availableKeys = LETTER_KEYS.filter(
          (candidate) => candidate !== previousKeyRef.current
        )
        keyId = availableKeys[Math.floor(Math.random() * availableKeys.length)]!
      }

      previousKeyRef.current = keyId
      const presentedTimeMs = performance.now()
      const cueEvent: EyePongCueEvent = {
        sequence: cueEventsRef.current.length + 1,
        keyId,
        letter: KEY_TO_LETTER[keyId]!,
        scheduledOffsetMs: Math.max(
          0,
          Math.round(scheduledTimeMs - sessionStartedAtRef.current)
        ),
        presentedOffsetMs: Math.max(
          0,
          Math.round(presentedTimeMs - sessionStartedAtRef.current)
        ),
        presentationDelayMs: Math.round(presentedTimeMs - scheduledTimeMs),
      }

      cueEventsRef.current.push(cueEvent)

      if (clearTargetTimerRef.current) {
        window.clearTimeout(clearTargetTimerRef.current)
      }
      setKeyStates({ [keyId]: "waiting" })
      clearTargetTimerRef.current = window.setTimeout(() => {
        setKeyStates({})
        clearTargetTimerRef.current = null
      }, targetHoldMs)

      const result = buildResult()
      onProgress(result, cueEventsRef.current.length)

      if (cueEventsRef.current.length === EYE_PONG_TARGET_COUNT) {
        completionStartedRef.current = true
        playingRef.current = false
        stopBeatRef.current()
        setIsPlaying(false)
        onRunComplete(result)
        void playAudio(GREAT_JOB_PROMPT)
      }
    },
    [
      buildResult,
      leftRightKeys,
      onProgress,
      onRunComplete,
      setup.mode,
      targetHoldMs,
    ]
  )

  const { start: startMetronome, stop: stopMetronome } = useMetronome({
    bpm: setup.tempoBpm ?? 54,
    volume: 0.5,
    onBeat: handleBeat,
  })

  const { start: startMusicBeat, stop: stopMusicBeat } = useMusic({
    beatMode: "downbeats",
    onBeat: handleBeat,
    playbackRate: setup.musicPlaybackRate ?? 1,
    volume: 0.5,
  })

  const startBeat = useCallback(async () => {
    if (setup.audioMode === "silent") {
      beatTimerRef.current = window.setInterval(handleBeat, intervalMs)
      handleBeat(performance.now())
      return
    }

    if (setup.audioMode === "music") {
      await startMusicBeat()
    } else {
      await startMetronome()
    }
  }, [handleBeat, intervalMs, setup.audioMode, startMetronome, startMusicBeat])

  const stopBeat = useCallback(() => {
    stopMetronome()
    stopMusicBeat()
    if (beatTimerRef.current) {
      window.clearInterval(beatTimerRef.current)
      beatTimerRef.current = null
    }
  }, [stopMetronome, stopMusicBeat])

  useEffect(() => {
    stopBeatRef.current = stopBeat
  }, [stopBeat])

  useEffect(() => {
    void preloadAudio(
      getRuntimePreloadUrls([EYE_PONG_PROMPT, GREAT_JOB_PROMPT])
    )
  }, [])

  useEffect(() => {
    onPlayingChange(isPlaying)
  }, [isPlaying, onPlayingChange])

  const stopRuntime = useCallback(() => {
    runTokenRef.current += 1
    stopBeat()
    if (clearTargetTimerRef.current) {
      window.clearTimeout(clearTargetTimerRef.current)
      clearTargetTimerRef.current = null
    }
    playingRef.current = false
    setIsPlaying(false)
    setKeyStates({})
  }, [stopBeat])

  useEffect(() => () => stopRuntime(), [stopRuntime])

  useEffect(() => {
    if (!active) {
      // Parent runtime state owns cancellation, including resetting local visual state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      stopRuntime()
    }
  }, [active, stopRuntime])

  const previousStartSignalRef = useRef(0)
  useEffect(() => {
    if (
      !active ||
      startSignal <= 0 ||
      startSignal === previousStartSignalRef.current
    ) {
      return
    }

    previousStartSignalRef.current = startSignal

    const start = async () => {
      const runToken = runTokenRef.current + 1
      runTokenRef.current = runToken

      try {
        await unlockAudio()
        indexRef.current = 0
        cueEventsRef.current = []
        previousKeyRef.current = null
        completionStartedRef.current = false
        setKeyStates({})

        await playAudio(EYE_PONG_PROMPT)
        if (runToken !== runTokenRef.current) {
          return
        }

        sessionStartedAtRef.current = performance.now()
        playingRef.current = true
        await startBeat()
        if (runToken !== runTokenRef.current) {
          stopBeat()
          return
        }

        setIsPlaying(true)
      } catch {
        stopRuntime()
        onRunError()
      }
    }

    void start()
  }, [active, onRunError, startBeat, startSignal, stopBeat, stopRuntime])

  return <KeyboardLayout disabled keyStates={keyStates} />
}

export function KeyboardRuntimePage({
  onToast,
}: {
  onToast: (message: string) => void
}) {
  const navigate = useNavigate()
  const { exerciseType, patientId } = useParams()
  const patientQuery = usePatient(patientId)
  const saveExerciseRun = useSaveExerciseRun()
  const [startSignal, setStartSignal] = useState(0)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [status, setStatus] = useState<
    "ready" | "preparing" | "running" | "saving" | "finished"
  >("ready")
  const [completedUnits, setCompletedUnits] = useState(0)
  const [finishedRun, setFinishedRun] = useState<{
    completedUnits: number
    result: ExerciseRunResult
    runStatus: "completed" | "ended-early"
  } | null>(null)
  const activeStartTimeRef = useRef<number | null>(null)
  const resultRef = useRef<ExerciseRunResult | null>(null)

  const activity = exerciseType as KeyboardRuntimeExerciseType | undefined
  const validActivity =
    activity && supportsKeyboardRuntime(activity) ? activity : undefined
  const pendingRun = useMemo(
    () =>
      patientId && validActivity
        ? loadPendingExerciseRun(patientId, validActivity)
        : null,
    [patientId, validActivity]
  )
  const selectedWords = useMemo(() => {
    if (
      !pendingRun ||
      (pendingRun.setup.activity !== "letter-target" &&
        pendingRun.setup.activity !== "letter-find") ||
      pendingRun.setup.contentMode !== "words"
    ) {
      return []
    }

    return pickRandomWords(
      pendingRun.setup.wordLength ?? getAvailableWordLengths()[0] ?? "3",
      pendingRun.setup.numberOfWords
    )
  }, [pendingRun])

  useEffect(() => {
    if (status !== "running") {
      return
    }

    const interval = window.setInterval(() => {
      if (!activeStartTimeRef.current) {
        return
      }

      setElapsedSeconds(
        Math.max(
          1,
          Math.round((Date.now() - activeStartTimeRef.current) / 1000)
        )
      )
    }, 250)

    return () => window.clearInterval(interval)
  }, [status])

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (
        status === "preparing" ||
        status === "running" ||
        status === "saving"
      ) {
        event.preventDefault()
      }
    }

    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [status])

  const handleStart = useCallback(async () => {
    try {
      await unlockAudio()
      resultRef.current = null
      activeStartTimeRef.current = null
      setCompletedUnits(0)
      setElapsedSeconds(0)
      setStatus("preparing")
      setStartSignal((current) => current + 1)
    } catch {
      onToast("Audio could not start. Check this browser's audio permissions.")
    }
  }, [onToast])

  const handlePlayingChange = useCallback((isPlaying: boolean) => {
    if (!isPlaying) {
      return
    }

    activeStartTimeRef.current = Date.now()
    setElapsedSeconds(0)
    setStatus("running")
  }, [])

  const handleProgress = useCallback(
    (
      result: LetterTargetRunResult | LetterFindRunResult,
      nextCompletedUnits: number
    ) => {
      resultRef.current = result
      setCompletedUnits(nextCompletedUnits)
    },
    []
  )

  const finishAndSave = useCallback(
    async (
      runStatus: "completed" | "ended-early",
      result: ExerciseRunResult,
      nextCompletedUnits: number
    ) => {
      if (!patientId || !pendingRun || !validActivity) {
        return
      }

      setStatus("saving")
      const measuredElapsedSeconds = activeStartTimeRef.current
        ? Math.max(
            1,
            Math.round((Date.now() - activeStartTimeRef.current) / 1000)
          )
        : elapsedSeconds
      const finalElapsedSeconds =
        runStatus === "completed"
          ? Math.max(result.elapsedSeconds, measuredElapsedSeconds)
          : Math.max(1, measuredElapsedSeconds)

      try {
        await saveExerciseRun.mutateAsync({
          completedUnits: nextCompletedUnits,
          elapsedSeconds: finalElapsedSeconds,
          patientId,
          result: {
            ...result,
            elapsedSeconds: finalElapsedSeconds,
          },
          runId: pendingRun.savedAt,
          setup: pendingRun.setup,
          status: runStatus,
        })
        clearPendingExerciseRun(patientId, validActivity)
        setFinishedRun({
          completedUnits: nextCompletedUnits,
          result: {
            ...result,
            elapsedSeconds: finalElapsedSeconds,
          },
          runStatus,
        })
        setStatus("finished")
        onToast(
          `${patientQuery.data?.firstName ?? "Patient"}'s ${validActivity.replace(/-/g, " ")} session was saved.`
        )
      } catch (error) {
        activeStartTimeRef.current = null
        resultRef.current = null
        setCompletedUnits(0)
        setElapsedSeconds(0)
        setStatus("ready")
        onToast(
          error instanceof Error ? error.message : "Unable to save session."
        )
      }
    },
    [
      elapsedSeconds,
      onToast,
      patientId,
      patientQuery.data,
      pendingRun,
      saveExerciseRun,
      validActivity,
    ]
  )

  const handleLetterTargetComplete = useCallback(
    (result: LetterTargetRunResult, nextCompletedUnits: number) => {
      resultRef.current = result
      setCompletedUnits(nextCompletedUnits)
      void finishAndSave("completed", result, nextCompletedUnits)
    },
    [finishAndSave]
  )

  const handleLetterFindComplete = useCallback(
    (result: LetterFindRunResult, nextCompletedUnits: number) => {
      resultRef.current = result
      setCompletedUnits(nextCompletedUnits)
      void finishAndSave("completed", result, nextCompletedUnits)
    },
    [finishAndSave]
  )

  const handleEyePongComplete = useCallback(
    (result: EyePongRunResult) => {
      resultRef.current = result
      setCompletedUnits(result.targetChanges)
      void finishAndSave("completed", result, result.targetChanges)
    },
    [finishAndSave]
  )

  const handleEyePongProgress = useCallback(
    (result: EyePongRunResult, nextCompletedUnits: number) => {
      resultRef.current = result
      setCompletedUnits(nextCompletedUnits)
    },
    []
  )

  const handleEyePongRunError = useCallback(() => {
    activeStartTimeRef.current = null
    resultRef.current = null
    setCompletedUnits(0)
    setElapsedSeconds(0)
    setStatus("ready")
    onToast("Eye Pong could not start. Check this browser's audio permissions.")
  }, [onToast])

  const handleStopEarly = useCallback(() => {
    if (!pendingRun || status !== "running") {
      return
    }

    let result = resultRef.current

    if (!result) {
      if (pendingRun.setup.activity === "eye-pong") {
        const actualBpm = getEyePongActualBpm(
          pendingRun.setup.audioMode,
          pendingRun.setup.tempoBpm,
          pendingRun.setup.musicPlaybackRate
        )
        result = {
          activity: "eye-pong",
          actualBpm,
          audioMode: pendingRun.setup.audioMode,
          completionRatePercent: 0,
          cueEvents: [],
          elapsedSeconds,
          mode: pendingRun.setup.mode,
          targetCount: EYE_PONG_TARGET_COUNT,
          targetChanges: completedUnits,
        }
      } else {
        const letterSetup = pendingRun.setup as
          LetterTargetSetup | LetterFindSetup
        result = {
          activity: letterSetup.activity,
          actualBpm: getActualBpm(
            letterSetup.audioMode,
            letterSetup.tempoBpm,
            letterSetup.musicPlaybackRate
          ),
          audioMode: letterSetup.audioMode,
          contentMode: letterSetup.contentMode,
          elapsedSeconds,
          selectedWords: [],
          stats: [],
          wordLength: letterSetup.wordLength,
        }
      }
    }

    resultRef.current = result
    if (result) {
      const finalCompletedUnits =
        result.activity === "eye-pong" ? result.targetChanges : completedUnits
      void finishAndSave("ended-early", result, finalCompletedUnits)
    }
  }, [completedUnits, elapsedSeconds, finishAndSave, pendingRun, status])

  if (!validActivity || !patientId) {
    return <Navigate replace to="/" />
  }

  if (!pendingRun) {
    return (
      <Navigate replace to={`/patients/${patientId}?tab=exercise-control`} />
    )
  }

  const patientName = patientQuery.data
    ? `${patientQuery.data.firstName} ${patientQuery.data.lastName}`
    : "Patient"

  if (
    (pendingRun.setup.activity === "letter-target" ||
      pendingRun.setup.activity === "letter-find") &&
    pendingRun.setup.contentMode === "words" &&
    selectedWords.length === 0
  ) {
    return (
      <Navigate replace to={`/patients/${patientId}?tab=exercise-control`} />
    )
  }

  if (status === "finished" && finishedRun) {
    const totalUnits = getTotalUnits(pendingRun.setup)

    return (
      <FinishedRuntimeSession
        completedUnits={finishedRun.completedUnits}
        patientId={patientId}
        patientName={patientName}
        result={finishedRun.result}
        runStatus={finishedRun.runStatus}
        setup={pendingRun.setup}
        totalUnits={totalUnits ?? finishedRun.completedUnits}
      />
    )
  }

  return (
    <main className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-[1440px] flex-col gap-6 px-8 py-8">
      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-4">
        <div>
          <Button
            onClick={() =>
              navigate(`/patients/${patientId}?tab=exercise-control`)
            }
            type="button"
            variant="ghost"
          >
            <ArrowLeft data-icon="inline-start" />
            Back to setup
          </Button>
          <h1 className="mt-3 text-3xl font-semibold tracking-normal">
            {patientName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Running {pendingRun.setup.activity.replace(/-/g, " ")}.
          </p>
        </div>
        {status === "ready" ? (
          <Button
            className="self-center justify-self-center"
            onClick={() => void handleStart()}
            type="button"
          >
            Start Exercise
          </Button>
        ) : (
          <Button
            className="col-start-3 justify-self-end"
            disabled={status !== "running"}
            onClick={handleStopEarly}
            type="button"
            variant="destructive"
          >
            <Square data-icon="inline-start" />
            Stop Early
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground uppercase">Status</div>
          <div className="mt-2 font-semibold">
            {status === "saving"
              ? "Saving"
              : status === "running"
                ? "Running"
                : status === "preparing"
                  ? "Playing instructions"
                  : "Ready"}
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground uppercase">Elapsed</div>
          <div className="mt-2 font-semibold tabular-nums">
            {elapsedSeconds}s
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground uppercase">
            Progress
          </div>
          <div className="mt-2 font-semibold tabular-nums">
            {completedUnits}
          </div>
        </div>
      </div>

      <section className="flex min-h-0 flex-1 rounded-lg border bg-card p-2 md:p-4">
        {pendingRun.setup.activity === "letter-target" ? (
          <LetterTargetRuntime
            active={status === "preparing" || status === "running"}
            onPlayingChange={handlePlayingChange}
            onProgress={handleProgress}
            onRunComplete={handleLetterTargetComplete}
            selectedWords={selectedWords}
            setup={pendingRun.setup}
            startSignal={startSignal}
          />
        ) : pendingRun.setup.activity === "letter-find" ? (
          <LetterFindRuntime
            active={status === "preparing" || status === "running"}
            onPlayingChange={handlePlayingChange}
            onProgress={handleProgress}
            onRunComplete={handleLetterFindComplete}
            selectedWords={selectedWords}
            setup={pendingRun.setup}
            startSignal={startSignal}
          />
        ) : pendingRun.setup.activity === "eye-pong" ? (
          <EyePongRuntime
            active={status === "preparing" || status === "running"}
            onPlayingChange={handlePlayingChange}
            onProgress={handleEyePongProgress}
            onRunComplete={handleEyePongComplete}
            onRunError={handleEyePongRunError}
            setup={pendingRun.setup}
            startSignal={startSignal}
          />
        ) : null}
      </section>
    </main>
  )
}
