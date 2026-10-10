import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { KeyboardLayout } from "@/components/exercise-runtime/keyboard-layout"
import { pickRandomWords } from "@/content/word-library"
import { useMetronome } from "@/hooks/use-metronome"
import { useMusic } from "@/hooks/use-music"
import {
  KEY_TO_LETTER,
  LETTER_KEYS,
  LETTER_TO_KEY,
  type KeyState,
} from "@/lib/audio/constants"
import { preloadAudio, playAudio, unlockAudio } from "@/lib/audio/sound-manager"
import { STOMP_DOWNBEAT_BPM } from "@/lib/audio/stomp-beat-map"
import type {
  InhibitionChallengeRunResult,
  InhibitionChallengeSetup,
  InhibitionCue,
  InhibitionTrialEvent,
  MotorSequenceBuilderRunResult,
  MotorSequenceBuilderSetup,
  MotorSequenceEvent,
  WordLength,
} from "@/types/exercise-control"

const CORRECT_SOUND = "/audio/effects/legacy-correct.mp3"
const GREAT_JOB_PROMPT = "/audio/prompts/shared/great-job-01.mp3"
const READY_PROMPT = "/audio/prompts/shared/ready-to-play-01.mp3"
const WRONG_PROMPTS = [
  "/audio/prompts/shared/wrong-01.mp3",
  "/audio/prompts/shared/wrong-02.mp3",
  "/audio/prompts/shared/wrong-03.mp3",
]

function wait(durationMs: number) {
  return new Promise((resolve) => window.setTimeout(resolve, durationMs))
}

function elapsedFrom(startedAt: number) {
  return startedAt > 0
    ? Math.max(0, Math.round(performance.now() - startedAt))
    : 0
}

function speak(text: string) {
  if (!("speechSynthesis" in window)) {
    return Promise.resolve()
  }

  return new Promise<void>((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text)
    let settled = false
    const finish = () => {
      if (!settled) {
        settled = true
        resolve()
      }
    }
    const fallbackTimer = window.setTimeout(finish, 10_000)

    utterance.rate = 0.9
    utterance.onend = () => {
      window.clearTimeout(fallbackTimer)
      finish()
    }
    utterance.onerror = () => {
      window.clearTimeout(fallbackTimer)
      finish()
    }
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  })
}

function shuffle<T>(values: T[]) {
  const shuffled = [...values]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex]!,
      shuffled[index]!,
    ]
  }
  return shuffled
}

function allocateInhibitionCues(
  count: number,
  preset: InhibitionChallengeSetup["rulePreset"]
) {
  const cueOrder: InhibitionCue[] = ["go", "no-go", "wait"]
  const weights =
    preset === "go-heavy"
      ? [0.7, 0.15, 0.15]
      : preset === "stop-heavy"
        ? [0.3, 0.5, 0.2]
        : [0.5, 0.25, 0.25]
  const exactCounts = weights.map((weight) => count * weight)
  const counts = exactCounts.map(Math.floor)
  const remaining = count - counts.reduce((sum, value) => sum + value, 0)
  const remainderOrder = exactCounts
    .map((value, index) => ({ index, remainder: value - counts[index]! }))
    .sort(
      (left, right) =>
        right.remainder - left.remainder || left.index - right.index
    )

  for (let index = 0; index < remaining; index += 1) {
    counts[remainderOrder[index]!.index]! += 1
  }

  return shuffle(
    cueOrder.flatMap((cue, index) =>
      Array<InhibitionCue>(counts[index]!).fill(cue)
    )
  )
}

function buildInhibitionPlan(setup: InhibitionChallengeSetup) {
  let previousKey: number | undefined
  return allocateInhibitionCues(setup.trialCount, setup.rulePreset).map(
    (cue) => {
      const candidates = LETTER_KEYS.filter((keyId) => keyId !== previousKey)
      const targetKeyId =
        candidates[Math.floor(Math.random() * candidates.length)]!
      previousKey = targetKeyId
      return { cue, targetKeyId }
    }
  )
}

function cueKeyState(cue: InhibitionCue): KeyState {
  if (cue === "no-go") {
    return "no-go"
  }
  if (cue === "wait") {
    return "wait"
  }
  return "waiting"
}

function cueLabel(cue: InhibitionCue) {
  if (cue === "no-go") {
    return "STOP — do not press"
  }
  if (cue === "wait") {
    return "WAIT — do not press"
  }
  return "GO — press the green key"
}

export function InhibitionChallengeRuntime({
  active,
  setup,
  startSignal,
  onPlayingChange,
  onProgress,
  onRunComplete,
  onRunError,
}: {
  active: boolean
  setup: InhibitionChallengeSetup
  startSignal: number
  onPlayingChange: (isPlaying: boolean) => void
  onProgress: (
    result: InhibitionChallengeRunResult,
    completedUnits: number
  ) => void
  onRunComplete: (
    result: InhibitionChallengeRunResult,
    completedUnits: number
  ) => void
  onRunError: () => void
}) {
  const plan = useMemo(() => buildInhibitionPlan(setup), [setup])
  const [cueText, setCueText] = useState(
    "Green means hit. Red means stop. Yellow means wait."
  )
  const [inputEnabled, setInputEnabled] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [keyStates, setKeyStates] = useState<Record<number, KeyState>>({})
  const currentTrialRef = useRef<InhibitionTrialEvent | null>(null)
  const responseTimerRef = useRef<number | null>(null)
  const nextTimerRef = useRef<number | null>(null)
  const flashTimerRef = useRef<number | null>(null)
  const sessionStartedAtRef = useRef(0)
  const trialsRef = useRef<InhibitionTrialEvent[]>([])
  const runTokenRef = useRef(0)
  const startTrialRef = useRef<(index: number) => void>(() => {})

  const buildResult = useCallback(
    (): InhibitionChallengeRunResult => ({
      activity: "inhibition-challenge",
      cueSpeedBpm: setup.cueSpeedBpm,
      elapsedSeconds: Math.round(
        elapsedFrom(sessionStartedAtRef.current) / 1000
      ),
      keyboardLayout: setup.keyboardLayout,
      keyboardSide: setup.keyboardSide,
      keyLabels: setup.keyLabels,
      responseWindowMs: setup.responseWindowMs,
      rulePreset: setup.rulePreset,
      trialCount: setup.trialCount,
      trials: trialsRef.current.map((trial) => ({
        ...trial,
        presses: [...trial.presses],
      })),
    }),
    [setup]
  )

  const clearTimers = useCallback(() => {
    for (const timerRef of [responseTimerRef, nextTimerRef, flashTimerRef]) {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [])

  const stopRuntime = useCallback(() => {
    runTokenRef.current += 1
    clearTimers()
    window.speechSynthesis?.cancel()
    currentTrialRef.current = null
    setInputEnabled(false)
    setIsPlaying(false)
    setKeyStates({})
  }, [clearTimers])

  const finishTrial = useCallback(
    (outcome: InhibitionTrialEvent["outcome"]) => {
      const trial = currentTrialRef.current
      if (!trial || trial.windowClosed) {
        return
      }

      if (responseTimerRef.current !== null) {
        window.clearTimeout(responseTimerRef.current)
        responseTimerRef.current = null
      }
      trial.windowClosed = true
      trial.windowEndOffsetMs = elapsedFrom(sessionStartedAtRef.current)
      trial.outcome = outcome
      setInputEnabled(false)
      setCueText(
        outcome === "correct"
          ? trial.cue === "go"
            ? "Correct response"
            : "Nicely held"
          : outcome === "missed"
            ? "No response detected"
            : "Remember the color rule"
      )
      setKeyStates({
        [trial.targetKeyId]: outcome === "correct" ? "correct" : "incorrect",
      })

      const completedUnits = trialsRef.current.filter(
        (candidate) => candidate.windowClosed
      ).length
      const result = buildResult()
      onProgress(result, completedUnits)

      const isLastTrial = trial.trialIndex >= plan.length
      if (isLastTrial) {
        setIsPlaying(false)
        nextTimerRef.current = window.setTimeout(() => {
          setKeyStates({})
          setCueText("Exercise complete")
          onRunComplete(buildResult(), completedUnits)
          void playAudio(GREAT_JOB_PROMPT)
        }, 450)
        return
      }

      const interTrialGapMs = Math.round(60_000 / setup.cueSpeedBpm)
      nextTimerRef.current = window.setTimeout(() => {
        setKeyStates({})
        startTrialRef.current(trial.trialIndex)
      }, interTrialGapMs)
    },
    [buildResult, onProgress, onRunComplete, plan.length, setup.cueSpeedBpm]
  )

  const startTrial = useCallback(
    (index: number) => {
      const plannedTrial = plan[index]
      if (!plannedTrial || runTokenRef.current === 0) {
        return
      }

      const trial: InhibitionTrialEvent = {
        cue: plannedTrial.cue,
        cueOffsetMs: elapsedFrom(sessionStartedAtRef.current),
        outcome: "stopped",
        presses: [],
        targetKeyId: plannedTrial.targetKeyId,
        targetLetter: KEY_TO_LETTER[plannedTrial.targetKeyId]!,
        trialIndex: index + 1,
        windowClosed: false,
      }
      trialsRef.current.push(trial)
      currentTrialRef.current = trial
      setCueText(cueLabel(trial.cue))
      setKeyStates({ [trial.targetKeyId]: cueKeyState(trial.cue) })
      setInputEnabled(true)
      onProgress(buildResult(), index)

      responseTimerRef.current = window.setTimeout(() => {
        finishTrial(trial.cue === "go" ? "missed" : "correct")
      }, setup.responseWindowMs)
    },
    [buildResult, finishTrial, onProgress, plan, setup.responseWindowMs]
  )

  useEffect(() => {
    startTrialRef.current = startTrial
  }, [startTrial])

  const handleKeyClick = useCallback(
    (keyId: number) => {
      const trial = currentTrialRef.current
      if (!inputEnabled || !trial || trial.windowClosed) {
        return
      }

      const correct = trial.cue === "go" && keyId === trial.targetKeyId
      trial.presses.push({
        correct,
        keyId,
        letter: KEY_TO_LETTER[keyId]!,
        offsetMs: elapsedFrom(sessionStartedAtRef.current),
      })
      onProgress(
        buildResult(),
        trialsRef.current.filter((candidate) => candidate.windowClosed).length
      )

      if (correct) {
        void playAudio(CORRECT_SOUND)
        finishTrial("correct")
        return
      }

      void playAudio(
        WRONG_PROMPTS[Math.floor(Math.random() * WRONG_PROMPTS.length)]!
      )
      if (trial.cue !== "go") {
        finishTrial("incorrect")
        return
      }

      setKeyStates({
        [trial.targetKeyId]: "waiting",
        [keyId]: "incorrect",
      })
      if (flashTimerRef.current !== null) {
        window.clearTimeout(flashTimerRef.current)
      }
      flashTimerRef.current = window.setTimeout(() => {
        setKeyStates({ [trial.targetKeyId]: "waiting" })
      }, 350)
    },
    [buildResult, finishTrial, inputEnabled, onProgress]
  )

  useEffect(() => {
    void preloadAudio([
      READY_PROMPT,
      CORRECT_SOUND,
      GREAT_JOB_PROMPT,
      ...WRONG_PROMPTS,
    ])
  }, [])

  useEffect(() => {
    onPlayingChange(isPlaying)
  }, [isPlaying, onPlayingChange])

  useEffect(() => () => stopRuntime(), [stopRuntime])

  useEffect(() => {
    if (!active) {
      // Parent state owns cancellation after save or navigation.
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
      clearTimers()
      trialsRef.current = []
      currentTrialRef.current = null
      setKeyStates({})
      setCueText("Listen to the color rule")

      try {
        await unlockAudio()
        await playAudio(READY_PROMPT)
        await speak(
          "Green means hit. Red means stop. Yellow means wait. Ready, go."
        )
        if (runToken !== runTokenRef.current) {
          return
        }

        sessionStartedAtRef.current = performance.now()
        setIsPlaying(true)
        startTrialRef.current(0)
      } catch {
        stopRuntime()
        onRunError()
      }
    }

    void start()
  }, [active, clearTimers, onRunError, startSignal, stopRuntime])

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-3">
      <div className="rounded-md border bg-muted/30 px-4 py-3 text-center">
        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Current rule
        </div>
        <div className="mt-1 text-lg font-semibold">{cueText}</div>
      </div>
      <div className="min-h-[420px] flex-1 overflow-hidden rounded-md">
        <KeyboardLayout
          disabled={!inputEnabled}
          keyStates={keyStates}
          onKeyClick={handleKeyClick}
        />
      </div>
    </div>
  )
}

type PlannedMotorSequence = {
  text: string
  keyIds: number[]
  wordAudio?: string
}

function buildMotorPlan(
  setup: MotorSequenceBuilderSetup
): PlannedMotorSequence[] {
  if (setup.contentType === "word-sequence" && setup.sequenceLength >= 3) {
    return pickRandomWords(
      String(setup.sequenceLength) as WordLength,
      setup.sequenceCount
    ).map((word) => ({
      keyIds: word.key
        .toUpperCase()
        .split("")
        .map((letter) => LETTER_TO_KEY[letter]!),
      text: word.label.toUpperCase(),
      wordAudio: word.audio.word,
    }))
  }

  return Array.from({ length: setup.sequenceCount }, () => {
    const keyIds: number[] = []
    while (keyIds.length < setup.sequenceLength) {
      const previousKey = keyIds[keyIds.length - 1]
      const candidates = LETTER_KEYS.filter((keyId) => keyId !== previousKey)
      keyIds.push(candidates[Math.floor(Math.random() * candidates.length)]!)
    }
    return {
      keyIds,
      text: keyIds.map((keyId) => KEY_TO_LETTER[keyId]).join(""),
    }
  })
}

export function MotorSequenceBuilderRuntime({
  active,
  setup,
  startSignal,
  onPlayingChange,
  onProgress,
  onRunComplete,
  onRunError,
}: {
  active: boolean
  setup: MotorSequenceBuilderSetup
  startSignal: number
  onPlayingChange: (isPlaying: boolean) => void
  onProgress: (
    result: MotorSequenceBuilderRunResult,
    completedUnits: number
  ) => void
  onRunComplete: (
    result: MotorSequenceBuilderRunResult,
    completedUnits: number
  ) => void
  onRunError: () => void
}) {
  const plan = useMemo(() => buildMotorPlan(setup), [setup])
  const [cueText, setCueText] = useState(
    "Watch the letters, then repeat the sequence."
  )
  const [inputEnabled, setInputEnabled] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [keyStates, setKeyStates] = useState<Record<number, KeyState>>({})
  const inputEnabledRef = useRef(false)
  const sequenceIndexRef = useRef(0)
  const expectedPositionRef = useRef(0)
  const sessionStartedAtRef = useRef(0)
  const sequencesRef = useRef<MotorSequenceEvent[]>([])
  const runTokenRef = useRef(0)
  const startSequenceRef = useRef<
    (index: number, runToken: number) => Promise<void>
  >(async () => {})

  const musicPlaybackRate = Math.min(
    1.4,
    Math.max(0.5, setup.presentationSpeedBpm / STOMP_DOWNBEAT_BPM)
  )
  const { start: startMetronome, stop: stopMetronome } = useMetronome({
    bpm: setup.presentationSpeedBpm,
    volume: 0.45,
  })
  const { start: startMusic, stop: stopMusic } = useMusic({
    beatMode: "downbeats",
    playbackRate: musicPlaybackRate,
    volume: 0.45,
  })

  const setCanRespond = useCallback((enabled: boolean) => {
    inputEnabledRef.current = enabled
    setInputEnabled(enabled)
  }, [])

  const stopTransport = useCallback(() => {
    stopMetronome()
    stopMusic()
  }, [stopMetronome, stopMusic])

  const buildResult = useCallback(
    (): MotorSequenceBuilderRunResult => ({
      activity: "motor-sequence-builder",
      audioMode: setup.audioMode,
      contentType: setup.contentType,
      elapsedSeconds: Math.round(
        elapsedFrom(sessionStartedAtRef.current) / 1000
      ),
      keyboardLayout: setup.keyboardLayout,
      keyboardSide: setup.keyboardSide,
      keyLabels: setup.keyLabels,
      presentationSpeedBpm: setup.presentationSpeedBpm,
      sequenceCount: setup.sequenceCount,
      sequenceLength: setup.sequenceLength,
      sequences: sequencesRef.current.map((sequence) => ({
        ...sequence,
        keyIds: [...sequence.keyIds],
        presentations: [...sequence.presentations],
        presses: [...sequence.presses],
      })),
    }),
    [setup]
  )

  const getCompletedUnits = useCallback(
    () =>
      sequencesRef.current.filter(
        (sequence) => sequence.completedOffsetMs != null
      ).length,
    []
  )

  const stopRuntime = useCallback(() => {
    runTokenRef.current += 1
    window.speechSynthesis?.cancel()
    stopTransport()
    setCanRespond(false)
    setIsPlaying(false)
    setKeyStates({})
  }, [setCanRespond, stopTransport])

  const startSequence = useCallback(
    async (index: number, runToken: number) => {
      const sequence = plan[index]
      if (!sequence || runToken !== runTokenRef.current) {
        return
      }

      sequenceIndexRef.current = index
      expectedPositionRef.current = 0
      setCanRespond(false)
      setCueText(`Watch sequence ${index + 1} of ${plan.length}`)
      const event: MotorSequenceEvent = {
        keyIds: [...sequence.keyIds],
        presentations: [],
        presses: [],
        sequenceIndex: index + 1,
        text: sequence.text,
      }
      sequencesRef.current.push(event)
      onProgress(buildResult(), getCompletedUnits())

      const intervalMs = Math.round(60_000 / setup.presentationSpeedBpm)
      const holdMs = Math.max(180, Math.round(intervalMs * 0.65))
      for (const keyId of sequence.keyIds) {
        if (runToken !== runTokenRef.current) {
          return
        }
        event.presentations.push({
          keyId,
          letter: KEY_TO_LETTER[keyId]!,
          offsetMs: elapsedFrom(sessionStartedAtRef.current),
        })
        setKeyStates({ [keyId]: "waiting" })
        onProgress(buildResult(), getCompletedUnits())
        await wait(holdMs)
        setKeyStates({})
        await wait(Math.max(0, intervalMs - holdMs))
      }

      if (runToken !== runTokenRef.current) {
        return
      }
      event.reproductionStartedOffsetMs = elapsedFrom(
        sessionStartedAtRef.current
      )
      setCueText(`Your turn — repeat ${sequence.keyIds.length} letters`)
      await playAudio(CORRECT_SOUND)
      if (runToken !== runTokenRef.current) {
        return
      }
      setCanRespond(true)
      onProgress(buildResult(), getCompletedUnits())
    },
    [
      buildResult,
      getCompletedUnits,
      onProgress,
      plan,
      setCanRespond,
      setup.presentationSpeedBpm,
    ]
  )

  useEffect(() => {
    startSequenceRef.current = startSequence
  }, [startSequence])

  const handleKeyClick = useCallback(
    (keyId: number) => {
      if (!inputEnabledRef.current) {
        return
      }
      const event = sequencesRef.current[sequenceIndexRef.current]
      const plannedSequence = plan[sequenceIndexRef.current]
      const expectedKeyId = plannedSequence?.keyIds[expectedPositionRef.current]
      if (!event || !plannedSequence || expectedKeyId == null) {
        return
      }

      const correct = keyId === expectedKeyId
      event.presses.push({
        correct,
        expectedKeyId,
        expectedLetter: KEY_TO_LETTER[expectedKeyId]!,
        keyId,
        letter: KEY_TO_LETTER[keyId]!,
        offsetMs: elapsedFrom(sessionStartedAtRef.current),
      })
      setCanRespond(false)
      setKeyStates({ [keyId]: correct ? "correct" : "incorrect" })
      onProgress(buildResult(), getCompletedUnits())

      const continueRun = async () => {
        const runToken = runTokenRef.current
        if (!correct) {
          await playAudio(
            WRONG_PROMPTS[Math.floor(Math.random() * WRONG_PROMPTS.length)]!
          )
          if (runToken === runTokenRef.current) {
            setKeyStates({})
            setCueText(`Try ${KEY_TO_LETTER[expectedKeyId]} again`)
            setCanRespond(true)
          }
          return
        }

        expectedPositionRef.current += 1
        await playAudio(
          `/audio/letters/${KEY_TO_LETTER[keyId]!.toLowerCase()}.mp3`
        )
        if (runToken !== runTokenRef.current) {
          return
        }

        if (expectedPositionRef.current < plannedSequence.keyIds.length) {
          setKeyStates({})
          setCueText(
            `Your turn — ${expectedPositionRef.current} of ${plannedSequence.keyIds.length} complete`
          )
          setCanRespond(true)
          return
        }

        event.completedOffsetMs = elapsedFrom(sessionStartedAtRef.current)
        const completedUnits = getCompletedUnits()
        setKeyStates({})
        setCueText(`Sequence ${event.sequenceIndex} complete`)
        onProgress(buildResult(), completedUnits)

        if (plannedSequence.wordAudio) {
          await playAudio(plannedSequence.wordAudio)
        }

        if (event.sequenceIndex >= plan.length) {
          stopTransport()
          setIsPlaying(false)
          onRunComplete(buildResult(), completedUnits)
          await playAudio(GREAT_JOB_PROMPT)
          return
        }

        await wait(650)
        await startSequenceRef.current(event.sequenceIndex, runToken)
      }

      void continueRun()
    },
    [
      buildResult,
      getCompletedUnits,
      onProgress,
      onRunComplete,
      plan,
      setCanRespond,
      stopTransport,
    ]
  )

  useEffect(() => {
    void preloadAudio([
      READY_PROMPT,
      CORRECT_SOUND,
      GREAT_JOB_PROMPT,
      ...WRONG_PROMPTS,
      ...plan.flatMap((sequence) => sequence.wordAudio ?? []),
    ])
  }, [plan])

  useEffect(() => {
    onPlayingChange(isPlaying)
  }, [isPlaying, onPlayingChange])

  useEffect(() => () => stopRuntime(), [stopRuntime])

  useEffect(() => {
    if (!active) {
      // Parent state owns cancellation after save or navigation.
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
      sequencesRef.current = []
      setCanRespond(false)
      setKeyStates({})
      setCueText("Listen, then watch the sequence")

      try {
        await unlockAudio()
        await playAudio(READY_PROMPT)
        await speak("Watch the letters. Then repeat the sequence. Ready, go.")
        if (runToken !== runTokenRef.current) {
          return
        }

        if (setup.audioMode === "music") {
          await startMusic()
        } else if (setup.audioMode === "metronome") {
          await startMetronome()
        }
        if (runToken !== runTokenRef.current) {
          stopTransport()
          return
        }

        sessionStartedAtRef.current = performance.now()
        setIsPlaying(true)
        await startSequenceRef.current(0, runToken)
      } catch {
        stopRuntime()
        onRunError()
      }
    }

    void start()
  }, [
    active,
    onRunError,
    setCanRespond,
    setup.audioMode,
    startMetronome,
    startMusic,
    startSignal,
    stopRuntime,
    stopTransport,
  ])

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-3">
      <div className="rounded-md border bg-muted/30 px-4 py-3 text-center">
        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Sequence cue
        </div>
        <div className="mt-1 text-lg font-semibold">{cueText}</div>
      </div>
      <div className="min-h-[420px] flex-1 overflow-hidden rounded-md">
        <KeyboardLayout
          disabled={!inputEnabled}
          keyStates={keyStates}
          onKeyClick={handleKeyClick}
        />
      </div>
    </div>
  )
}
