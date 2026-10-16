import { describe, expect, it } from "vitest"

import { createEmbeddedDevicePayload } from "@/lib/device/embedded-device-payload"
import { toDeviceConfig } from "@/lib/device/device-config"
import {
  devicePayloadToRunResult,
  getDeviceCompletedUnits,
  getDeviceRunStatus,
} from "@/lib/device/device-results"
import type { ExerciseRunResult, ExerciseSetup } from "@/types/exercise-control"

function roundTrip(
  setup: ExerciseSetup,
  result: ExerciseRunResult,
  completedUnits: number,
  status: "completed" | "ended-early" = "completed"
) {
  const payload = createEmbeddedDevicePayload({
    completedUnits,
    participant: "P-TEST",
    result,
    runId: "test-run",
    setup,
    status,
  })

  return {
    mapped: devicePayloadToRunResult(payload, setup),
    payload,
  }
}

describe("embedded device payload parity", () => {
  it("uses the canonical device configuration and event envelope", () => {
    const setup: ExerciseSetup = {
      activity: "letter-target",
      audioMode: "metronome",
      contentMode: "words",
      keyboardLayout: "qwerty",
      keyboardSide: "full",
      keyLabels: "letters",
      numberOfLetters: 3,
      numberOfWords: 1,
      tempoBpm: 54,
      wordLength: "0-5",
    }
    const result: ExerciseRunResult = {
      activity: "letter-target",
      actualBpm: 54,
      audioMode: "metronome",
      contentMode: "words",
      elapsedSeconds: 3,
      keyboardLayout: "qwerty",
      keyboardSide: "full",
      keyLabels: "letters",
      selectedWords: ["CAT"],
      stats: [
        { attempts: 2, letter: "C", timeMs: 400 },
        { attempts: 1, letter: "A", timeMs: 300 },
        { attempts: 1, letter: "T", timeMs: 250 },
      ],
      wordLength: "0-5",
    }

    const { mapped, payload } = roundTrip(setup, result, 1)

    expect(payload.summary.settings).toEqual(toDeviceConfig(setup, "P-TEST"))
    expect(payload.events[0]).toMatchObject({
      activity: "letter_target",
      type: "session_start",
    })
    expect(payload.events.at(-1)).toMatchObject({
      end_reason: "completed",
      type: "session_end",
    })
    expect(mapped).toMatchObject({
      activity: "letter-target",
      contentMode: "words",
      selectedWords: ["CAT"],
    })
    if (mapped.activity !== "letter-target") throw new Error("Wrong activity")
    expect(
      mapped.stats.map(({ attempts, letter, timeMs }) => ({
        attempts,
        letter,
        timeMs,
      }))
    ).toEqual([
      { attempts: 2, letter: "C", timeMs: 400 },
      { attempts: 1, letter: "A", timeMs: 300 },
      { attempts: 1, letter: "T", timeMs: 250 },
    ])
    expect(mapped.devicePayload).toBe(payload)
  })

  it("round-trips Eye Pong through the device result mapper", () => {
    const setup: ExerciseSetup = {
      activity: "eye-pong",
      audioMode: "silent",
      keyboardLayout: "alphabetical",
      keyboardSide: "left",
      keyLabels: "blank",
      mode: "left-right",
      targetCount: 2,
    }
    const result: ExerciseRunResult = {
      activity: "eye-pong",
      actualBpm: 54,
      audioMode: "silent",
      completionRatePercent: 100,
      cueEvents: [
        {
          keyId: 1,
          letter: "A",
          presentationDelayMs: 0,
          presentedOffsetMs: 100,
          scheduledOffsetMs: 100,
          sequence: 1,
        },
        {
          keyId: 5,
          letter: "E",
          presentationDelayMs: 0,
          presentedOffsetMs: 1100,
          scheduledOffsetMs: 1100,
          sequence: 2,
        },
      ],
      elapsedSeconds: 2,
      keyboardLayout: "alphabetical",
      keyboardSide: "left",
      keyLabels: "blank",
      mode: "left-right",
      targetChanges: 2,
      targetCount: 2,
    }

    const { mapped, payload } = roundTrip(setup, result, 2)
    expect(payload.summary.settings).toMatchObject({
      key_label: "blank",
      layout: "qwerty",
      side: "full",
    })
    expect(mapped).toMatchObject({
      activity: "eye-pong",
      completionRatePercent: 100,
      keyboardLayout: "qwerty",
      keyboardSide: "full",
      keyLabels: "blank",
      targetChanges: 2,
    })
  })

  it("round-trips Go and Stop inhibition trials", () => {
    const setup: ExerciseSetup = {
      activity: "inhibition-challenge",
      cueSpeedBpm: 60,
      keyboardLayout: "qwerty",
      keyboardSide: "full",
      keyLabels: "letters",
      responseWindowMs: 1000,
      rulePreset: "balanced",
      trialCount: 2,
    }
    const result: ExerciseRunResult = {
      activity: "inhibition-challenge",
      cueSpeedBpm: 60,
      elapsedSeconds: 3,
      keyboardLayout: "qwerty",
      keyboardSide: "full",
      keyLabels: "letters",
      responseWindowMs: 1000,
      rulePreset: "balanced",
      trialCount: 2,
      trials: [
        {
          cue: "go",
          cueOffsetMs: 100,
          outcome: "correct",
          presses: [
            {
              correct: true,
              keyId: 1,
              letter: "Q",
              offsetMs: 350,
            },
          ],
          targetKeyId: 1,
          targetLetter: "Q",
          trialIndex: 1,
          windowClosed: true,
          windowEndOffsetMs: 350,
        },
        {
          cue: "no-go",
          cueOffsetMs: 1300,
          outcome: "correct",
          presses: [],
          targetKeyId: 2,
          targetLetter: "W",
          trialIndex: 2,
          windowClosed: true,
          windowEndOffsetMs: 2300,
        },
      ],
    }

    const { mapped } = roundTrip(setup, result, 2)
    expect(mapped).toMatchObject({ activity: "inhibition-challenge" })
    if (mapped.activity !== "inhibition-challenge") {
      throw new Error("Wrong activity")
    }
    expect(mapped.trials.map(({ cue, outcome }) => ({ cue, outcome }))).toEqual(
      [
        { cue: "go", outcome: "correct" },
        { cue: "no-go", outcome: "correct" },
      ]
    )
  })

  it("uses the same completion helpers for an embedded early stop", () => {
    const setup: ExerciseSetup = {
      activity: "letter-find",
      audioMode: "silent",
      contentMode: "letters",
      keyboardLayout: "qwerty",
      keyboardSide: "right",
      keyLabels: "letters",
      numberOfLetters: 4,
      numberOfWords: 1,
    }
    const result: ExerciseRunResult = {
      activity: "letter-find",
      audioMode: "silent",
      contentMode: "letters",
      elapsedSeconds: 1,
      keyboardLayout: "qwerty",
      keyboardSide: "right",
      keyLabels: "letters",
      selectedWords: [],
      stats: [{ attempts: 1, letter: "Y", timeMs: 250 }],
    }

    const { payload } = roundTrip(setup, result, 1, "ended-early")
    expect(getDeviceCompletedUnits(payload)).toBe(1)
    expect(getDeviceRunStatus(payload)).toBe("ended-early")
    expect(payload.summary.end_reason).toBe("clinician_stopped")
  })
})
