import { toDeviceConfig } from "@/lib/device/device-config"
import type {
  DeviceEventRecord,
  DeviceSessionPayload,
  DeviceSessionSummary,
} from "@/lib/device/device-types"
import { getLetterToKeyMap } from "@/lib/exercise-runtime/keyboard-map"
import type {
  ExerciseRunResult,
  ExerciseSetup,
  InhibitionTrialEvent,
  LetterRuntimeStat,
} from "@/types/exercise-control"

type RunStatus = "completed" | "ended-early"

interface EmbeddedPayloadInput {
  completedUnits: number
  participant?: string
  result: ExerciseRunResult
  runId: string
  setup: ExerciseSetup
  status: RunStatus
}

function deviceActivity(activity: ExerciseRunResult["activity"]) {
  return activity.replaceAll("-", "_") as DeviceSessionSummary["activity"]
}

function clampTimestamp(value: number) {
  return Math.max(0, Math.round(value))
}

function createEventWriter(sessionId: string) {
  const events: DeviceEventRecord[] = []

  return {
    events,
    push(type: string, ts: number, fields: Record<string, unknown> = {}) {
      events.push({
        seq: events.length + 1,
        ts: clampTimestamp(ts),
        session_id: sessionId,
        type,
        ...fields,
      })
    },
  }
}

function locateLetter(
  statIndex: number,
  selectedWords: string[],
  contentMode: "letters" | "words"
) {
  if (contentMode === "letters") {
    return { itemIndex: statIndex, trialIndex: 0 }
  }

  let offset = 0
  for (let itemIndex = 0; itemIndex < selectedWords.length; itemIndex += 1) {
    const length = selectedWords[itemIndex]!.length
    if (statIndex < offset + length) {
      return { itemIndex, trialIndex: statIndex - offset }
    }
    offset += length
  }

  return { itemIndex: selectedWords.length, trialIndex: 0 }
}

function addLetterEvents(
  writer: ReturnType<typeof createEventWriter>,
  result: Extract<
    ExerciseRunResult,
    { activity: "letter-target" | "letter-find" }
  >
) {
  const letterToKey = getLetterToKeyMap(result.keyboardLayout)
  const selectedWords = result.selectedWords ?? []
  let cursor = 10

  result.stats.forEach((stat, statIndex) => {
    const { itemIndex, trialIndex } = locateLetter(
      statIndex,
      selectedWords,
      result.contentMode
    )
    const requestedContent =
      result.contentMode === "words"
        ? (selectedWords[itemIndex] ?? stat.letter)
        : stat.letter
    const targetKey = letterToKey[stat.letter]
    const goTs = cursor

    writer.push("prompt_start", goTs, {
      clip: null,
      expected_target: targetKey,
      expected_target_letter: stat.letter,
      item_index: itemIndex,
      item_type: result.contentMode === "words" ? "word" : "letter",
      requested_content: requestedContent,
      trial_index: trialIndex,
    })
    writer.push("go", goTs, { item_index: itemIndex, trial_index: trialIndex })

    const attempts = buildLetterAttempts(stat, targetKey)
    attempts.forEach((attempt, attemptIndex) => {
      const isLast = attemptIndex === attempts.length - 1
      const ts = isLast
        ? goTs + Math.max(1, stat.timeMs)
        : goTs +
          Math.max(
            1,
            Math.round((stat.timeMs * (attemptIndex + 1)) / attempts.length)
          )
      writer.push("keypress", ts, {
        beat_timestamp:
          attempt.beatOffsetMs == null ? null : ts - attempt.beatOffsetMs,
        correct: isLast,
        correct_response_latency_ms: isLast ? stat.timeMs : null,
        expected_target: targetKey,
        expected_target_letter: stat.letter,
        first_response_latency_ms: attemptIndex === 0 ? ts - goTs : null,
        item_index: itemIndex,
        pressed_key: attempt.keyId,
        pressed_key_letter: attempt.pressedLetter,
        response_latency_ms: ts - goTs,
        trial_index: trialIndex,
      })
    })

    cursor = goTs + Math.max(1, stat.timeMs) + 10
    const isItemComplete =
      result.contentMode === "letters" ||
      trialIndex === requestedContent.length - 1
    if (isItemComplete) {
      writer.push("item_complete", cursor, {
        incorrect_attempts: [],
        item_completion_ts: cursor,
        item_index: itemIndex,
        requested_content: requestedContent,
      })
      cursor += 10
    }
  })
}

function buildLetterAttempts(stat: LetterRuntimeStat, targetKey?: number) {
  if (stat.attemptEvents?.length) {
    return stat.attemptEvents.map((attempt) => ({
      beatOffsetMs: attempt.beatOffsetMs,
      keyId: attempt.keyId ?? targetKey,
      pressedLetter: attempt.pressedLetter,
    }))
  }

  return Array.from({ length: Math.max(1, stat.attempts) }, () => ({
    beatOffsetMs: stat.beatOffsetMs,
    keyId: targetKey,
    pressedLetter: stat.letter,
  }))
}

function deviceCue(cue: InhibitionTrialEvent["cue"]) {
  return cue === "no-go" ? "nogo" : cue
}

function deviceOutcome(trial: InhibitionTrialEvent) {
  if (trial.outcome === "missed") return "missed_go"
  if (trial.outcome === "incorrect") return "false_response"
  if (trial.outcome === "correct") {
    return trial.cue === "go" ? "correct_go" : "successful_inhibition"
  }
  return "clinician_stopped"
}

function addInhibitionEvents(
  writer: ReturnType<typeof createEventWriter>,
  result: Extract<ExerciseRunResult, { activity: "inhibition-challenge" }>
) {
  result.trials.forEach((trial) => {
    const itemIndex = Math.max(0, trial.trialIndex - 1)
    writer.push("prompt_start", trial.cueOffsetMs, {
      clip: null,
      expected_target: trial.targetKeyId,
      expected_target_letter: trial.targetLetter,
      item_index: itemIndex,
      item_type: "ic_trial",
      requested_content: deviceCue(trial.cue),
      trial_index: 0,
    })
    writer.push("go", trial.cueOffsetMs, {
      item_index: itemIndex,
      trial_index: 0,
    })
    trial.presses.forEach((press, pressIndex) => {
      writer.push("keypress", press.offsetMs, {
        correct: press.correct,
        correct_response_latency_ms: press.correct
          ? press.offsetMs - trial.cueOffsetMs
          : null,
        expected_target: trial.targetKeyId,
        expected_target_letter: trial.targetLetter,
        first_response_latency_ms:
          pressIndex === 0 ? press.offsetMs - trial.cueOffsetMs : null,
        item_index: itemIndex,
        pressed_key: press.keyId,
        pressed_key_letter: press.letter,
        trial_index: 0,
      })
    })
    if (trial.windowClosed) {
      const completedAt =
        trial.windowEndOffsetMs ??
        trial.presses.at(-1)?.offsetMs ??
        trial.cueOffsetMs
      writer.push("item_complete", completedAt, {
        incorrect_attempts: trial.presses
          .filter((press) => !press.correct)
          .map((press) => press.keyId),
        item_completion_ts: completedAt,
        item_index: itemIndex,
        outcome: deviceOutcome(trial),
        requested_content: deviceCue(trial.cue),
        response_latency_ms:
          trial.presses[0]?.offsetMs == null
            ? null
            : trial.presses[0].offsetMs - trial.cueOffsetMs,
      })
    }
  })
}

function addMotorSequenceEvents(
  writer: ReturnType<typeof createEventWriter>,
  result: Extract<ExerciseRunResult, { activity: "motor-sequence-builder" }>
) {
  result.sequences.forEach((sequence) => {
    const itemIndex = Math.max(0, sequence.sequenceIndex - 1)
    const promptOffset = Math.max(
      0,
      (sequence.presentations[0]?.offsetMs ??
        sequence.reproductionStartedOffsetMs ??
        0) - 1
    )
    writer.push("prompt_start", promptOffset, {
      clip: "msb_watch",
      expected_target: sequence.keyIds[0],
      item_index: itemIndex,
      item_type: result.contentType === "word-sequence" ? "word" : "sequence",
      requested_content: sequence.text,
      trial_index: 0,
    })
    sequence.presentations.forEach((presentation, trialIndex) => {
      writer.push("target_display", presentation.offsetMs, {
        expected_target: presentation.keyId,
        expected_target_letter: presentation.letter,
        item_index: itemIndex,
        trial_index: trialIndex,
      })
    })
    if (sequence.reproductionStartedOffsetMs != null) {
      writer.push("go", sequence.reproductionStartedOffsetMs, {
        item_index: itemIndex,
        trial_index: 0,
      })
    }
    sequence.presses.forEach((press, trialIndex) => {
      writer.push("keypress", press.offsetMs, {
        correct: press.correct,
        correct_response_latency_ms: press.correct
          ? Math.max(
              0,
              press.offsetMs - (sequence.reproductionStartedOffsetMs ?? 0)
            )
          : null,
        expected_target: press.expectedKeyId,
        expected_target_letter: press.expectedLetter,
        item_index: itemIndex,
        pressed_key: press.keyId,
        pressed_key_letter: press.letter,
        trial_index: trialIndex,
      })
    })
    if (sequence.completedOffsetMs != null) {
      writer.push("item_complete", sequence.completedOffsetMs, {
        incorrect_attempts: sequence.presses
          .filter((press) => !press.correct)
          .map((press) => press.keyId),
        item_completion_ts: sequence.completedOffsetMs,
        item_index: itemIndex,
        requested_content: sequence.text,
      })
    }
  })
}

function addEyePongEvents(
  writer: ReturnType<typeof createEventWriter>,
  result: Extract<ExerciseRunResult, { activity: "eye-pong" }>
) {
  result.cueEvents.forEach((cue, index) => {
    writer.push("prompt_start", cue.presentedOffsetMs, {
      clip: null,
      expected_target: cue.keyId,
      item_index: index,
      item_type: "pong_target",
      requested_content: cue.letter,
      trial_index: 0,
    })
    writer.push("item_complete", cue.presentedOffsetMs, {
      incorrect_attempts: [],
      item_completion_ts: cue.presentedOffsetMs,
      item_index: index,
      requested_content: cue.letter,
    })
  })
}

function emptySummary(
  input: EmbeddedPayloadInput,
  settings: ReturnType<typeof toDeviceConfig>,
  sessionId: string
): DeviceSessionSummary {
  const { completedUnits, result, status } = input
  const startedUnits =
    result.activity === "inhibition-challenge"
      ? result.trials.length
      : result.activity === "motor-sequence-builder"
        ? result.sequences.length
        : result.activity === "eye-pong"
          ? result.cueEvents.length
          : result.stats.length

  return {
    activity: deviceActivity(result.activity),
    by_key: [],
    by_sequence: [],
    by_word:
      result.activity === "letter-target" || result.activity === "letter-find"
        ? (result.selectedWords ?? [])
            .slice(0, completedUnits)
            .map((word) => ({ word }))
        : [],
    counts: {
      items_completed: completedUnits,
      items_requested: settings.items,
      items_started: Math.min(settings.items, startedUnits),
      trials_completed: completedUnits,
      trials_total: startedUnits,
    },
    directional_metrics: null,
    end_reason: status === "completed" ? "completed" : "clinician_stopped",
    generated_utc: new Date().toISOString(),
    guardrail_note:
      "Accuracy is among detectable functioning-key presses only. Latency values are response times, not clinical outcomes.",
    ic_by_cue_type: [],
    ic_metrics: null,
    metrics: {},
    msb_metrics: null,
    participant: settings.participant || null,
    response_timing_metrics: null,
    rhythm_metrics: null,
    sequence_performance: null,
    session_id: sessionId,
    settings,
    targeting_metrics: null,
  }
}

export function createEmbeddedDevicePayload(
  input: EmbeddedPayloadInput
): DeviceSessionPayload {
  const sessionId = `EMBEDDED-${input.runId}`
  const settings = toDeviceConfig(input.setup, input.participant)
  const writer = createEventWriter(sessionId)
  writer.push("session_start", 0, {
    activity: settings.activity,
    participant: settings.participant || null,
    settings,
  })

  switch (input.result.activity) {
    case "letter-target":
    case "letter-find":
      addLetterEvents(writer, input.result)
      break
    case "eye-pong":
      addEyePongEvents(writer, input.result)
      break
    case "inhibition-challenge":
      addInhibitionEvents(writer, input.result)
      break
    case "motor-sequence-builder":
      addMotorSequenceEvents(writer, input.result)
      break
  }

  const latestEventMs = writer.events.at(-1)?.ts ?? 0
  const elapsedMs = Math.max(input.result.elapsedSeconds * 1000, latestEventMs)
  writer.push("session_end", elapsedMs, {
    end_reason:
      input.status === "completed" ? "completed" : "clinician_stopped",
    n_items_completed: input.completedUnits,
  })

  return {
    events: writer.events,
    summary: emptySummary(input, settings, sessionId),
  }
}
