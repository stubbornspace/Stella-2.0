import type {
  ExerciseRunResult,
  ExerciseSetup,
  InhibitionCue,
  InhibitionTrialEvent,
  LetterRuntimeStat,
  MotorSequenceEvent,
} from "@/types/exercise-control"
import type {
  DeviceEventRecord,
  DeviceSessionPayload,
} from "@/lib/device/device-types"

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback
}

function booleanValue(value: unknown) {
  return value === true
}

function eventNumber(event: DeviceEventRecord, key: string, fallback = 0) {
  return numberValue(event[key], fallback)
}

function eventString(event: DeviceEventRecord, key: string, fallback = "") {
  return stringValue(event[key], fallback)
}

function elapsedSeconds(events: DeviceEventRecord[]) {
  const started = events.find((event) => event.type === "session_start")
  const ended = events.findLast((event) => event.type === "session_end")

  if (!started || !ended) {
    return 0
  }

  return Math.max(0, Math.round((ended.ts - started.ts) / 1000))
}

function relativeOffset(event: DeviceEventRecord, startedAt: number) {
  return Math.max(0, Math.round(event.ts - startedAt))
}

function createEventTimestamp(
  events: DeviceEventRecord[],
  generatedUtc: string | null
) {
  const endTimestamp = events.findLast(
    (event) => event.type === "session_end"
  )?.ts
  const generatedTimestamp = generatedUtc ? Date.parse(generatedUtc) : NaN
  const endEpochMs = Number.isFinite(generatedTimestamp)
    ? generatedTimestamp
    : Date.now()

  return (timestamp: number) =>
    new Date(
      endTimestamp == null
        ? endEpochMs
        : endEpochMs - Math.max(0, endTimestamp - timestamp)
    ).toISOString()
}

function matchingEvents(
  events: DeviceEventRecord[],
  type: string,
  itemIndex: number,
  trialIndex?: number
) {
  return events.filter(
    (event) =>
      event.type === type &&
      eventNumber(event, "item_index", -1) === itemIndex &&
      (trialIndex == null ||
        eventNumber(event, "trial_index", -1) === trialIndex)
  )
}

function toLetterStats(
  events: DeviceEventRecord[],
  eventTimestamp: (timestamp: number) => string
): LetterRuntimeStat[] {
  const correctPresses = events.filter(
    (event) => event.type === "keypress" && booleanValue(event.correct)
  )

  return correctPresses.map((correctPress) => {
    const itemIndex = eventNumber(correctPress, "item_index")
    const trialIndex = eventNumber(correctPress, "trial_index")
    const attempts = matchingEvents(
      events,
      "keypress",
      itemIndex,
      trialIndex
    ).filter((event) => event.seq <= correctPress.seq)
    const go = matchingEvents(events, "go", itemIndex, trialIndex)[0]
    const beatTimestamp =
      typeof correctPress.beat_timestamp === "number"
        ? correctPress.beat_timestamp
        : undefined

    return {
      letter: eventString(correctPress, "expected_target_letter"),
      attempts: attempts.length,
      timeMs: eventNumber(correctPress, "correct_response_latency_ms"),
      beatOffsetMs:
        beatTimestamp == null ? undefined : correctPress.ts - beatTimestamp,
      beatOffsetBasis:
        beatTimestamp == null ? undefined : ("previous-beat" as const),
      targetStartedAt: go ? eventTimestamp(go.ts) : undefined,
      completedAt: eventTimestamp(correctPress.ts),
      attemptEvents: attempts.map((attempt) => {
        const attemptBeatTimestamp =
          typeof attempt.beat_timestamp === "number"
            ? attempt.beat_timestamp
            : undefined
        return {
          keyId: eventNumber(attempt, "pressed_key"),
          pressedLetter: eventString(attempt, "pressed_key_letter"),
          correct: booleanValue(attempt.correct),
          timestamp: eventTimestamp(attempt.ts),
          beatOffsetMs:
            attemptBeatTimestamp == null
              ? undefined
              : attempt.ts - attemptBeatTimestamp,
          beatOffsetBasis:
            attemptBeatTimestamp == null
              ? undefined
              : ("previous-beat" as const),
        }
      }),
    }
  })
}

function mapInhibitionCue(value: string): InhibitionCue {
  return value === "nogo" ? "no-go" : value === "wait" ? "wait" : "go"
}

function mapInhibitionOutcome(value: string): InhibitionTrialEvent["outcome"] {
  switch (value) {
    case "correct_go":
    case "successful_inhibition":
      return "correct"
    case "missed_go":
      return "missed"
    case "false_response":
      return "incorrect"
    default:
      return "stopped"
  }
}

function toInhibitionTrials(
  events: DeviceEventRecord[],
  startedAt: number
): InhibitionTrialEvent[] {
  return events
    .filter((event) => event.type === "prompt_start")
    .map((prompt) => {
      const trialIndex = eventNumber(prompt, "item_index")
      const go = matchingEvents(events, "go", trialIndex, 0)[0]
      const completion = matchingEvents(events, "item_complete", trialIndex)[0]
      const presses = matchingEvents(events, "keypress", trialIndex, 0)
      const cueOffsetMs = relativeOffset(go ?? prompt, startedAt)

      return {
        trialIndex: trialIndex + 1,
        cue: mapInhibitionCue(eventString(prompt, "requested_content")),
        targetKeyId: eventNumber(prompt, "expected_target"),
        targetLetter: eventString(prompt, "expected_target_letter"),
        cueOffsetMs,
        windowEndOffsetMs: completion
          ? relativeOffset(completion, startedAt)
          : undefined,
        windowClosed: Boolean(completion),
        outcome: completion
          ? mapInhibitionOutcome(eventString(completion, "outcome"))
          : "stopped",
        presses: presses.map((press) => ({
          keyId: eventNumber(press, "pressed_key"),
          letter: eventString(press, "pressed_key_letter"),
          offsetMs: relativeOffset(press, startedAt),
          correct: booleanValue(press.correct),
        })),
      }
    })
}

function toMotorSequences(
  events: DeviceEventRecord[],
  startedAt: number
): MotorSequenceEvent[] {
  const prompts = events.filter(
    (event) =>
      event.type === "prompt_start" &&
      eventString(event, "clip") === "msb_watch"
  )

  return prompts.map((prompt) => {
    const sequenceIndex = eventNumber(prompt, "item_index")
    const presentations = matchingEvents(
      events,
      "target_display",
      sequenceIndex
    )
    const presses = matchingEvents(events, "keypress", sequenceIndex)
    const go = matchingEvents(events, "go", sequenceIndex)[0]
    const completion = matchingEvents(events, "item_complete", sequenceIndex)[0]

    return {
      sequenceIndex: sequenceIndex + 1,
      text: eventString(prompt, "requested_content"),
      keyIds: presentations.map((event) =>
        eventNumber(event, "expected_target")
      ),
      presentations: presentations.map((event) => ({
        keyId: eventNumber(event, "expected_target"),
        letter: eventString(event, "expected_target_letter"),
        offsetMs: relativeOffset(event, startedAt),
      })),
      reproductionStartedOffsetMs: go
        ? relativeOffset(go, startedAt)
        : undefined,
      presses: presses.map((press) => ({
        keyId: eventNumber(press, "pressed_key"),
        letter: eventString(press, "pressed_key_letter"),
        expectedKeyId: eventNumber(press, "expected_target"),
        expectedLetter: eventString(press, "expected_target_letter"),
        offsetMs: relativeOffset(press, startedAt),
        correct: booleanValue(press.correct),
      })),
      completedOffsetMs: completion
        ? relativeOffset(completion, startedAt)
        : undefined,
    }
  })
}

export function devicePayloadToRunResult(
  payload: DeviceSessionPayload,
  setup: ExerciseSetup
): ExerciseRunResult {
  const { events, summary } = payload
  const sessionStart = events.find((event) => event.type === "session_start")
  const startedAt = sessionStart?.ts ?? events[0]?.ts ?? 0
  const duration = elapsedSeconds(events)
  const eventTimestamp = createEventTimestamp(events, summary.generated_utc)
  const common = {
    elapsedSeconds: duration,
    keyboardLayout: setup.keyboardLayout,
    keyboardSide: setup.keyboardSide,
    keyLabels: setup.activity === "letter-find" ? "letters" : setup.keyLabels,
    devicePayload: payload,
  }

  switch (setup.activity) {
    case "letter-target":
    case "letter-find": {
      const selectedWords = summary.by_word
        .map((word) => stringValue(word.word))
        .filter(Boolean)
      return {
        ...common,
        activity: setup.activity,
        actualBpm:
          setup.audioMode === "silent" ? undefined : summary.settings.tempo_bpm,
        audioMode: setup.audioMode,
        contentMode: setup.contentMode,
        selectedWords,
        stats: toLetterStats(events, eventTimestamp),
        wordLength: setup.wordLength,
      }
    }
    case "eye-pong": {
      const prompts = events.filter(
        (event) =>
          event.type === "prompt_start" &&
          eventString(event, "item_type") === "pong_target"
      )
      const targetChanges = summary.counts.items_completed
      return {
        ...common,
        activity: "eye-pong",
        actualBpm: summary.settings.tempo_bpm,
        audioMode: setup.audioMode,
        completionRatePercent:
          setup.targetCount > 0
            ? Math.round((targetChanges / setup.targetCount) * 100)
            : 0,
        cueEvents: prompts.map((prompt, index) => ({
          sequence: index + 1,
          keyId: eventNumber(prompt, "expected_target"),
          letter: eventString(prompt, "requested_content"),
          scheduledOffsetMs: relativeOffset(prompt, startedAt),
          presentedOffsetMs: relativeOffset(prompt, startedAt),
          presentationDelayMs: 0,
        })),
        mode: setup.mode,
        targetCount: setup.targetCount,
        targetChanges,
      }
    }
    case "inhibition-challenge":
      return {
        ...common,
        activity: "inhibition-challenge",
        trialCount: setup.trialCount,
        rulePreset: setup.rulePreset,
        responseWindowMs: setup.responseWindowMs,
        cueSpeedBpm: setup.cueSpeedBpm,
        trials: toInhibitionTrials(events, startedAt),
      }
    case "motor-sequence-builder":
      return {
        ...common,
        activity: "motor-sequence-builder",
        audioMode: setup.audioMode,
        contentType: setup.contentType,
        sequenceLength: setup.sequenceLength,
        sequenceCount: setup.sequenceCount,
        presentationSpeedBpm: setup.presentationSpeedBpm,
        sequences: toMotorSequences(events, startedAt),
      }
  }
}

export function getDeviceCompletedUnits(payload: DeviceSessionPayload) {
  return payload.summary.counts.items_completed
}

export function getDeviceRunStatus(payload: DeviceSessionPayload) {
  return payload.summary.end_reason === "completed"
    ? ("completed" as const)
    : ("ended-early" as const)
}
