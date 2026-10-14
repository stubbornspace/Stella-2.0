import { STOMP_DOWNBEAT_BPM } from "@/lib/audio/stomp-beat-map"
import type { ExerciseSetup } from "@/types/exercise-control"
import type { DeviceConfig } from "@/lib/device/device-types"

const baseConfig: DeviceConfig = {
  activity: "letter_target",
  layout: "qwerty",
  side: "full",
  key_label: "letters",
  content: "letters",
  items: 4,
  word_length: "0-5",
  beat: "none",
  tempo_bpm: 54,
  pong_mode: "left_right",
  timeout_enabled: false,
  timeout_ms: 5000,
  response_window_ms: 1500,
  nogo_percent: 40,
  wait_percent: 10,
  sequence_start_length: 2,
  sequence_progression: true,
  sequence_max_length: 5,
  participant: "",
}

function getTempoBpm(setup: ExerciseSetup) {
  if (setup.activity === "inhibition-challenge") {
    return setup.cueSpeedBpm
  }

  if (setup.activity === "motor-sequence-builder") {
    return setup.presentationSpeedBpm
  }

  if (setup.audioMode === "music") {
    return Math.round(STOMP_DOWNBEAT_BPM * (setup.musicPlaybackRate ?? 1))
  }

  return setup.tempoBpm ?? 54
}

function getBeatMode(setup: ExerciseSetup): DeviceConfig["beat"] {
  if (setup.activity === "inhibition-challenge") {
    return "none"
  }

  return setup.audioMode === "silent" ? "none" : setup.audioMode
}

function getInhibitionMix(
  setup: Extract<ExerciseSetup, { activity: "inhibition-challenge" }>
) {
  switch (setup.rulePreset) {
    case "go-heavy":
      return { nogo_percent: 20, wait_percent: 10 }
    case "stop-heavy":
      return { nogo_percent: 60, wait_percent: 10 }
    default:
      return { nogo_percent: 40, wait_percent: 10 }
  }
}

export function toDeviceConfig(
  setup: ExerciseSetup,
  participant = ""
): DeviceConfig {
  const common: DeviceConfig = {
    ...baseConfig,
    activity: setup.activity.replaceAll("-", "_") as DeviceConfig["activity"],
    layout: setup.keyboardLayout,
    side: setup.keyboardSide,
    key_label: setup.activity === "letter-find" ? "letters" : setup.keyLabels,
    beat: getBeatMode(setup),
    tempo_bpm: getTempoBpm(setup),
    participant: participant.slice(0, 32),
  }

  switch (setup.activity) {
    case "letter-target":
    case "letter-find":
      return {
        ...common,
        content: setup.contentMode,
        items:
          setup.contentMode === "letters"
            ? setup.numberOfLetters
            : setup.numberOfWords,
        word_length: setup.wordLength ?? "0-5",
      }
    case "eye-pong":
      return {
        ...common,
        items: setup.targetCount,
        pong_mode: setup.mode === "left-right" ? "left_right" : "random",
      }
    case "inhibition-challenge":
      return {
        ...common,
        items: setup.trialCount,
        response_window_ms: setup.responseWindowMs,
        ...getInhibitionMix(setup),
      }
    case "motor-sequence-builder":
      return {
        ...common,
        content: setup.contentType === "word-sequence" ? "words" : "letters",
        items: setup.sequenceCount,
        sequence_start_length: setup.sequenceLength,
        sequence_progression: false,
        sequence_max_length: setup.sequenceLength,
      }
  }
}
