import { Check, Play, RotateCcw, Square } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  exerciseControlDefinitions,
  getDefaultExerciseSetup,
  isRunnableExercise,
} from "@/config/exercise-control"
import { exerciseDefinitions } from "@/config/exercises"
import { useSaveExerciseRun } from "@/hooks/use-stella"
import { cn } from "@/lib/utils"
import type { ExerciseSession, ExerciseType, SessionStatus } from "@/types"
import type {
  ExerciseAudioMode,
  ExerciseSetup,
  EyePongSetup,
  InhibitionChallengeSetup,
  LetterFindSetup,
  LetterTargetSetup,
  MotorSequenceBuilderSetup,
  RunnableExerciseType,
  WordLength,
} from "@/types/exercise-control"

type LetterExerciseSetup = LetterTargetSetup | LetterFindSetup

type SessionRunState = {
  runId: string
  setup: ExerciseSetup
  phase: "running" | "saving" | "finished"
  outcome?: SessionStatus
  completedUnits: number
  totalUnits: number
  elapsedSeconds: number
  savedSession?: ExerciseSession
}

const SIMULATED_RUN_DURATION_SECONDS = 10

const inputClassName =
  "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"

function Field({
  label,
  helper,
  children,
}: {
  label: string
  helper?: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-2 text-sm font-medium">
      <span>{label}</span>
      {children}
      {helper ? (
        <span className="text-xs leading-5 font-normal text-muted-foreground">
          {helper}
        </span>
      ) : null}
    </label>
  )
}

function AudioSettings({
  audioMode,
  tempoBpm,
  musicPlaybackRate,
  onAudioModeChange,
  onMetronomeTempoChange,
  onMusicPlaybackRateChange,
}: {
  audioMode: ExerciseAudioMode
  tempoBpm?: number
  musicPlaybackRate?: number
  onAudioModeChange: (audioMode: ExerciseAudioMode) => void
  onMetronomeTempoChange: (tempoBpm: number) => void
  onMusicPlaybackRateChange: (musicPlaybackRate: number) => void
}) {
  const isMusic = audioMode === "music"

  return (
    <>
      <Field label="Beat">
        <select
          className={inputClassName}
          onChange={(event) =>
            onAudioModeChange(event.target.value as ExerciseAudioMode)
          }
          value={audioMode}
        >
          <option value="silent">None</option>
          <option value="metronome">Metronome</option>
          <option value="music">Music</option>
        </select>
      </Field>
      <Field
        helper={
          audioMode === "silent"
            ? "Select Music or Metronome to set a tempo."
            : isMusic
              ? "Music speed ranges from 0.5x to 2.0x."
              : "Metronome tempo ranges from 30 to 120 BPM."
        }
        label={isMusic ? "Tempo (playback speed)" : "Tempo (BPM)"}
      >
        <div className="flex min-h-10 items-center gap-4">
          <input
            className="h-2 min-w-0 flex-1 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50"
            disabled={audioMode === "silent"}
            max={isMusic ? 2 : 120}
            min={isMusic ? 0.5 : 30}
            onChange={(event) =>
              isMusic
                ? onMusicPlaybackRateChange(Number(event.target.value))
                : onMetronomeTempoChange(Number(event.target.value))
            }
            step={isMusic ? 0.1 : 1}
            type="range"
            value={isMusic ? (musicPlaybackRate ?? 1) : (tempoBpm ?? 54)}
          />
          <output className="w-16 text-right text-sm font-medium tabular-nums">
            {audioMode === "silent"
              ? "—"
              : isMusic
                ? `${(musicPlaybackRate ?? 1).toFixed(1)}x`
                : `${tempoBpm ?? 54} BPM`}
          </output>
        </div>
      </Field>
    </>
  )
}

function SliderSetting({
  label,
  helper,
  min,
  max,
  step = 1,
  value,
  onChange,
  formatValue = String,
}: {
  label: string
  helper?: string
  min: number
  max: number
  step?: number
  value: number
  onChange: (value: number) => void
  formatValue?: (value: number) => string
}) {
  return (
    <Field helper={helper} label={label}>
      <div className="flex min-h-10 items-center gap-4">
        <input
          className="h-2 min-w-0 flex-1 cursor-pointer accent-primary"
          max={max}
          min={min}
          onChange={(event) => onChange(Number(event.target.value))}
          step={step}
          type="range"
          value={value}
        />
        <output className="w-20 text-right text-sm font-medium tabular-nums">
          {formatValue(value)}
        </output>
      </div>
    </Field>
  )
}

function LetterExerciseSettings({
  setup,
  onChange,
}: {
  setup: LetterExerciseSetup
  onChange: (setup: LetterExerciseSetup) => void
}) {
  function updateContentMode(contentMode: LetterExerciseSetup["contentMode"]) {
    onChange({
      ...setup,
      contentMode,
      wordLength:
        contentMode === "words" ? (setup.wordLength ?? "0-5") : undefined,
    })
  }

  const duration =
    setup.contentMode === "letters"
      ? setup.numberOfLetters
      : setup.numberOfWords

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Field label="Mode">
        <select
          className={inputClassName}
          onChange={(event) =>
            updateContentMode(
              event.target.value as LetterExerciseSetup["contentMode"]
            )
          }
          value={setup.contentMode}
        >
          <option value="letters">Letters</option>
          <option value="words">Words</option>
        </select>
      </Field>
      <Field
        helper={`Choose between 1 and 10 ${setup.contentMode === "letters" ? "letters" : "words"}.`}
        label="Exercise duration"
      >
        <input
          className={inputClassName}
          max={10}
          min={1}
          onChange={(event) =>
            onChange(
              setup.contentMode === "letters"
                ? { ...setup, numberOfLetters: Number(event.target.value) }
                : { ...setup, numberOfWords: Number(event.target.value) }
            )
          }
          type="number"
          value={duration}
        />
      </Field>
      {setup.contentMode === "words" ? (
        <Field label="Word length">
          <select
            className={inputClassName}
            onChange={(event) =>
              onChange({
                ...setup,
                wordLength: event.target.value as WordLength,
              })
            }
            value={setup.wordLength ?? "0-5"}
          >
            <option value="0-5">0–5</option>
            <option value="5-10">5–10</option>
            <option value="10+">10+</option>
          </select>
        </Field>
      ) : null}
      <AudioSettings
        audioMode={setup.audioMode}
        musicPlaybackRate={setup.musicPlaybackRate}
        onAudioModeChange={(audioMode) =>
          onChange({
            ...setup,
            audioMode,
            tempoBpm:
              audioMode === "metronome"
                ? (setup.tempoBpm ?? 54)
                : setup.tempoBpm,
            musicPlaybackRate:
              audioMode === "music"
                ? (setup.musicPlaybackRate ?? 1)
                : setup.musicPlaybackRate,
          })
        }
        onMetronomeTempoChange={(tempoBpm) => onChange({ ...setup, tempoBpm })}
        onMusicPlaybackRateChange={(musicPlaybackRate) =>
          onChange({ ...setup, musicPlaybackRate })
        }
        tempoBpm={setup.tempoBpm}
      />
    </div>
  )
}

function EyePongSettings({
  setup,
  onChange,
}: {
  setup: EyePongSetup
  onChange: (setup: EyePongSetup) => void
}) {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Field label="Mode">
        <select
          className={inputClassName}
          onChange={(event) =>
            onChange({
              ...setup,
              mode: event.target.value as EyePongSetup["mode"],
            })
          }
          value={setup.mode}
        >
          <option value="left-right">Left / Right</option>
          <option value="random">Random</option>
        </select>
      </Field>
      <AudioSettings
        audioMode={setup.audioMode}
        musicPlaybackRate={setup.musicPlaybackRate}
        onAudioModeChange={(audioMode) =>
          onChange({
            ...setup,
            audioMode,
            tempoBpm:
              audioMode === "metronome"
                ? (setup.tempoBpm ?? 54)
                : setup.tempoBpm,
            musicPlaybackRate:
              audioMode === "music"
                ? (setup.musicPlaybackRate ?? 1)
                : setup.musicPlaybackRate,
          })
        }
        onMetronomeTempoChange={(tempoBpm) => onChange({ ...setup, tempoBpm })}
        onMusicPlaybackRateChange={(musicPlaybackRate) =>
          onChange({ ...setup, musicPlaybackRate })
        }
        tempoBpm={setup.tempoBpm}
      />
    </div>
  )
}

function InhibitionChallengeSettings({
  setup,
  onChange,
}: {
  setup: InhibitionChallengeSetup
  onChange: (setup: InhibitionChallengeSetup) => void
}) {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Field
        helper="Number of Go, No-Go and Wait trials in the session."
        label="Trial count"
      >
        <input
          className={inputClassName}
          max={100}
          min={1}
          onChange={(event) =>
            onChange({ ...setup, trialCount: Number(event.target.value) })
          }
          type="number"
          value={setup.trialCount}
        />
      </Field>
      <Field label="Trial mix">
        <select
          className={inputClassName}
          onChange={(event) =>
            onChange({
              ...setup,
              rulePreset: event.target
                .value as InhibitionChallengeSetup["rulePreset"],
            })
          }
          value={setup.rulePreset}
        >
          <option value="balanced">Balanced</option>
          <option value="go-heavy">Go-heavy</option>
          <option value="stop-heavy">Stop-heavy</option>
        </select>
      </Field>
      <SliderSetting
        formatValue={(value) => `${value} ms`}
        helper="Time allowed to respond—or successfully withhold a response."
        label="Response window"
        max={3000}
        min={500}
        onChange={(responseWindowMs) =>
          onChange({ ...setup, responseWindowMs })
        }
        step={100}
        value={setup.responseWindowMs}
      />
      <SliderSetting
        formatValue={(value) => `${value} BPM`}
        helper="Controls how quickly the activity presents successive cues."
        label="Cue speed"
        max={120}
        min={30}
        onChange={(cueSpeedBpm) => onChange({ ...setup, cueSpeedBpm })}
        value={setup.cueSpeedBpm}
      />
    </div>
  )
}

function MotorSequenceBuilderSettings({
  setup,
  onChange,
}: {
  setup: MotorSequenceBuilderSetup
  onChange: (setup: MotorSequenceBuilderSetup) => void
}) {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Field
        helper="The prototype uses mock prescribed content for the selected type."
        label="Content type"
      >
        <select
          className={inputClassName}
          onChange={(event) =>
            onChange({
              ...setup,
              contentType: event.target
                .value as MotorSequenceBuilderSetup["contentType"],
            })
          }
          value={setup.contentType}
        >
          <option value="letter-sequence">Letter sequence</option>
          <option value="word-sequence">Word sequence</option>
        </select>
      </Field>
      <Field label="Sequence length">
        <select
          className={inputClassName}
          onChange={(event) =>
            onChange({
              ...setup,
              sequenceLength: Number(event.target.value),
            })
          }
          value={setup.sequenceLength}
        >
          {[2, 3, 4, 5].map((length) => (
            <option key={length} value={length}>
              {length}
            </option>
          ))}
        </select>
      </Field>
      <Field
        helper="Number of sequences presented before automatic completion."
        label="Sequence count"
      >
        <input
          className={inputClassName}
          max={20}
          min={1}
          onChange={(event) =>
            onChange({ ...setup, sequenceCount: Number(event.target.value) })
          }
          type="number"
          value={setup.sequenceCount}
        />
      </Field>
      <Field label="Beat">
        <select
          className={inputClassName}
          onChange={(event) =>
            onChange({
              ...setup,
              audioMode: event.target.value as ExerciseAudioMode,
            })
          }
          value={setup.audioMode}
        >
          <option value="silent">None</option>
          <option value="metronome">Metronome</option>
          <option value="music">Music</option>
        </select>
      </Field>
      <SliderSetting
        formatValue={(value) => `${value} BPM`}
        helper="Controls how quickly each sequence is demonstrated."
        label="Presentation speed"
        max={120}
        min={30}
        onChange={(presentationSpeedBpm) =>
          onChange({ ...setup, presentationSpeedBpm })
        }
        value={setup.presentationSpeedBpm}
      />
    </div>
  )
}

function ExerciseSettings({
  setup,
  onChange,
}: {
  setup: ExerciseSetup
  onChange: (setup: ExerciseSetup) => void
}) {
  switch (setup.activity) {
    case "letter-target":
    case "letter-find":
      return <LetterExerciseSettings onChange={onChange} setup={setup} />
    case "eye-pong":
      return <EyePongSettings onChange={onChange} setup={setup} />
    case "inhibition-challenge":
      return <InhibitionChallengeSettings onChange={onChange} setup={setup} />
    case "motor-sequence-builder":
      return <MotorSequenceBuilderSettings onChange={onChange} setup={setup} />
  }
}

function formatSetupValue(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function getSetupRows(setup: ExerciseSetup): Array<[string, string]> {
  const rows: Array<[string, string]> = [
    ["Exercise", exerciseDefinitions[setup.activity].label],
  ]

  if (setup.activity === "letter-target" || setup.activity === "letter-find") {
    rows.push(["Mode", setup.contentMode === "letters" ? "Letters" : "Words"])
    rows.push([
      "Exercise duration",
      String(
        setup.contentMode === "letters"
          ? setup.numberOfLetters
          : setup.numberOfWords
      ),
    ])
    if (setup.contentMode === "words" && setup.wordLength) {
      rows.push(["Word length", setup.wordLength])
    }
    rows.push([
      "Beat",
      setup.audioMode === "silent" ? "None" : formatSetupValue(setup.audioMode),
    ])
    if (setup.audioMode === "metronome" && setup.tempoBpm) {
      rows.push(["Tempo", `${setup.tempoBpm} BPM`])
    } else if (setup.audioMode === "music" && setup.musicPlaybackRate) {
      rows.push(["Tempo", `${setup.musicPlaybackRate.toFixed(1)}x`])
    }
  } else if (setup.activity === "eye-pong") {
    rows.push(["Mode", setup.mode === "left-right" ? "Left / Right" : "Random"])
    rows.push([
      "Beat",
      setup.audioMode === "silent" ? "None" : formatSetupValue(setup.audioMode),
    ])
    if (setup.audioMode === "metronome" && setup.tempoBpm) {
      rows.push(["Tempo", `${setup.tempoBpm} BPM`])
    } else if (setup.audioMode === "music" && setup.musicPlaybackRate) {
      rows.push(["Tempo", `${setup.musicPlaybackRate.toFixed(1)}x`])
    }
  } else if (setup.activity === "inhibition-challenge") {
    rows.push(["Trial count", String(setup.trialCount)])
    rows.push(["Trial mix", formatSetupValue(setup.rulePreset)])
    rows.push(["Response window", `${setup.responseWindowMs} ms`])
    rows.push(["Cue speed", `${setup.cueSpeedBpm} BPM`])
  } else {
    rows.push(["Content type", formatSetupValue(setup.contentType)])
    rows.push(["Sequence length", String(setup.sequenceLength)])
    rows.push(["Sequence count", String(setup.sequenceCount)])
    rows.push(["Presentation speed", `${setup.presentationSpeedBpm} BPM`])
    rows.push([
      "Beat",
      setup.audioMode === "silent" ? "None" : formatSetupValue(setup.audioMode),
    ])
  }

  return rows
}

function getTotalUnits(setup: ExerciseSetup) {
  switch (setup.activity) {
    case "letter-target":
    case "letter-find":
      return setup.contentMode === "letters"
        ? setup.numberOfLetters
        : setup.numberOfWords
    case "eye-pong":
      return 20
    case "inhibition-challenge":
      return setup.trialCount
    case "motor-sequence-builder":
      return setup.sequenceCount
  }
}

function formatElapsedTime(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`
}

function RunningSession({
  patientName,
  run,
  onStop,
}: {
  patientName: string
  run: SessionRunState
  onStop: () => void
}) {
  const definition = exerciseDefinitions[run.setup.activity]
  const progress = Math.min(
    100,
    Math.round(
      (run.elapsedSeconds / SIMULATED_RUN_DURATION_SECONDS) * 100
    )
  )

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="rounded-lg border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-medium tracking-wide text-primary uppercase">
              Session in progress
            </div>
            <h2 className="mt-2 text-2xl font-semibold">{definition.label}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{patientName}</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary">
            <span className="size-2 animate-pulse rounded-full bg-primary" />
            Running
          </div>
        </div>

        <div className="mt-8">
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="font-medium">Session progress</span>
            <span className="text-muted-foreground tabular-nums">
              {run.completedUnits} of {run.totalUnits}
            </span>
          </div>
          <div
            aria-label={`${progress}% complete`}
            className="mt-3 h-3 overflow-hidden rounded-full bg-muted"
            role="progressbar"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="text-xs text-muted-foreground uppercase">
              Elapsed
            </div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">
              {formatElapsedTime(run.elapsedSeconds)}
            </div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="text-xs text-muted-foreground uppercase">
              Current
            </div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">
              {Math.min(run.completedUnits + 1, run.totalUnits)}
            </div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="text-xs text-muted-foreground uppercase">
              Device
            </div>
            <div className="mt-2 text-sm font-semibold">
              Simulator connected
            </div>
          </div>
        </div>

        <div className="mt-8 rounded-lg border border-dashed bg-muted/20 p-5 text-sm">
          <div className="font-medium">Live device event</div>
          <p className="mt-1 text-muted-foreground">
            The Stella simulator is presenting the next configured activity step
            and recording mock response timing.
          </p>
        </div>
      </section>

      <aside className="rounded-lg border bg-card p-5">
        <h3 className="font-semibold">Session controls</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Stopping early preserves the completed portion of this mock session.
        </p>
        <Button
          className="mt-6 w-full"
          onClick={onStop}
          size="lg"
          type="button"
          variant="destructive"
        >
          <Square data-icon="inline-start" />
          Stop Early
        </Button>
      </aside>
    </div>
  )
}

function FinishedSession({
  patientName,
  run,
  onRunAgain,
  onViewDashboard,
}: {
  patientName: string
  run: SessionRunState
  onRunAgain: () => void
  onViewDashboard: () => void
}) {
  const definition = exerciseDefinitions[run.setup.activity]
  const completed = run.outcome === "completed"

  return (
    <section className="mx-auto w-full max-w-3xl rounded-lg border bg-card p-6">
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
        <h2 className="mt-2 text-2xl font-semibold">{definition.label}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {patientName} · {run.completedUnits} of {run.totalUnits} completed
        </p>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="text-xs text-muted-foreground uppercase">Status</div>
          <div className="mt-2 font-semibold">
            {completed ? "Completed" : "Ended Early"}
          </div>
        </div>
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="text-xs text-muted-foreground uppercase">
            Duration
          </div>
          <div className="mt-2 font-semibold tabular-nums">
            {formatElapsedTime(run.elapsedSeconds)}
          </div>
        </div>
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="text-xs text-muted-foreground uppercase">Saved</div>
          <div className="mt-2 font-semibold">
            {run.savedSession ? "Patient history" : "Saving…"}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
        This prototype generated session-level results and added them to the
        patient dashboard.
      </div>

      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button onClick={onRunAgain} type="button" variant="outline">
          <RotateCcw data-icon="inline-start" />
          Run Another
        </Button>
        <Button onClick={onViewDashboard} type="button">
          View Dashboard
        </Button>
      </div>
    </section>
  )
}

export function ExerciseControlPanel({
  patientId,
  patientName,
  onToast,
  onViewDashboard,
}: {
  patientId: string
  patientName: string
  onToast: (message: string) => void
  onViewDashboard: () => void
}) {
  const saveExerciseRun = useSaveExerciseRun()
  const [selectedExercise, setSelectedExercise] =
    useState<RunnableExerciseType>("letter-target")
  const [setup, setSetup] = useState<ExerciseSetup>(() =>
    getDefaultExerciseSetup("letter-target")
  )
  const [run, setRun] = useState<SessionRunState | null>(null)
  const savedRunId = useRef<string | null>(null)
  const runPhase = run?.phase
  const runId = run?.runId

  useEffect(() => {
    if (runPhase !== "running") {
      return
    }

    const interval = window.setInterval(() => {
      setRun((current) => {
        if (!current || current.phase !== "running") {
          return current
        }

        const elapsedSeconds = Math.min(
          SIMULATED_RUN_DURATION_SECONDS,
          current.elapsedSeconds + 1
        )
        const isComplete =
          elapsedSeconds >= SIMULATED_RUN_DURATION_SECONDS
        const completedUnits = isComplete
          ? current.totalUnits
          : Math.floor(
              (current.totalUnits * elapsedSeconds) /
                SIMULATED_RUN_DURATION_SECONDS
            )

        return {
          ...current,
          completedUnits,
          elapsedSeconds,
          phase: isComplete ? "saving" : "running",
          outcome: isComplete ? "completed" : undefined,
        }
      })
    }, 1000)

    return () => window.clearInterval(interval)
  }, [runId, runPhase])

  useEffect(() => {
    if (
      !run ||
      run.phase !== "saving" ||
      !run.outcome ||
      savedRunId.current === run.runId
    ) {
      return
    }

    savedRunId.current = run.runId

    void saveExerciseRun
      .mutateAsync({
        patientId,
        setup: run.setup,
        status: run.outcome,
        completedUnits: run.completedUnits,
        elapsedSeconds: run.elapsedSeconds,
      })
      .then((savedSession) => {
        setRun((current) =>
          current?.runId === run.runId
            ? {
                ...current,
                phase: "finished",
                savedSession,
              }
            : current
        )
        onToast(
          `${exerciseDefinitions[run.setup.activity].label} session saved to ${patientName}.`
        )
      })
  }, [onToast, patientId, patientName, run, saveExerciseRun])

  function selectExercise(activity: ExerciseType) {
    if (!isRunnableExercise(activity)) {
      return
    }

    setSelectedExercise(activity)
    setSetup(getDefaultExerciseSetup(activity))
    setRun(null)
  }

  function startSession() {
    const totalUnits = getTotalUnits(setup)

    if (totalUnits < 1) {
      return
    }

    savedRunId.current = null
    setRun({
      runId: `${Date.now()}`,
      setup: { ...setup },
      phase: "running",
      completedUnits: 0,
      totalUnits,
      elapsedSeconds: 0,
    })
  }

  function stopSession() {
    setRun((current) =>
      current?.phase === "running"
        ? {
            ...current,
            phase: "saving",
            outcome: "ended-early",
          }
        : current
    )
  }

  if (run?.phase === "running") {
    return (
      <RunningSession
        onStop={stopSession}
        patientName={patientName}
        run={run}
      />
    )
  }

  if (run?.phase === "saving") {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <div className="mx-auto size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
        <h2 className="mt-4 text-lg font-semibold">Saving session</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Adding the simulated results to {patientName}&apos;s history.
        </p>
      </div>
    )
  }

  if (run?.phase === "finished") {
    return (
      <FinishedSession
        onRunAgain={() => setRun(null)}
        onViewDashboard={onViewDashboard}
        patientName={patientName}
        run={run}
      />
    )
  }

  const setupRows = getSetupRows(setup)
  const isSetupValid = getTotalUnits(setup) > 0

  return (
    <div className="flex flex-col gap-6">
      <section>
        <div>
          <h2 className="text-xl font-semibold">Choose an exercise</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure a patient-specific session, review the settings, then
            start the simulator.
          </p>
        </div>
        <div
          aria-label="Exercise selection"
          className="mt-4 overflow-x-auto border-b"
          role="tablist"
        >
          <div className="flex min-w-max gap-6">
            {exerciseControlDefinitions.map((controlDefinition) => {
              const definition = exerciseDefinitions[controlDefinition.id]
              const isSelected = selectedExercise === controlDefinition.id
              const isAvailable = controlDefinition.availability === "available"

              return (
                <button
                  aria-selected={isSelected}
                  className={cn(
                    "-mb-px flex h-11 items-center gap-2 border-b-2 px-1 text-sm font-medium transition-colors",
                    isSelected
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                    !isAvailable &&
                      "cursor-not-allowed text-muted-foreground/60 hover:text-muted-foreground/60"
                  )}
                  disabled={!isAvailable}
                  key={controlDefinition.id}
                  onClick={() => selectExercise(controlDefinition.id)}
                  role="tab"
                  type="button"
                >
                  {definition.label}
                  {!isAvailable ? (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase">
                      Coming soon
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          {
            exerciseControlDefinitions.find(
              (definition) => definition.id === selectedExercise
            )?.setupSummary
          }
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-lg border bg-card p-5">
          <div>
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Session setup
            </div>
            <h2 className="mt-2 text-xl font-semibold">
              {exerciseDefinitions[selectedExercise].label}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {exerciseDefinitions[selectedExercise].description}
            </p>
          </div>

          <div className="mt-6">
            <ExerciseSettings onChange={setSetup} setup={setup} />
          </div>
        </section>

        <aside className="h-fit rounded-lg border bg-card p-5 lg:sticky lg:top-6">
          <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Review session
          </div>
          <h3 className="mt-2 text-lg font-semibold">{patientName}</h3>
          <div className="mt-5 flex flex-col gap-3">
            {setupRows.map(([label, value]) => (
              <div className="flex justify-between gap-4 text-sm" key={label}>
                <span className="text-muted-foreground">{label}</span>
                <span className="max-w-44 text-right font-medium">{value}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-lg border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
            This starts a simulated session. No physical keyboard commands are
            sent.
          </div>
          <Button
            className="mt-5 w-full"
            disabled={!isSetupValid}
            onClick={startSession}
            size="lg"
            type="button"
          >
            <Play data-icon="inline-start" />
            Start Exercise
          </Button>
        </aside>
      </div>
    </div>
  )
}
