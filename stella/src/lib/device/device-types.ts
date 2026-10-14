export type DeviceActivity =
  | "letter_target"
  | "letter_find"
  | "eye_pong"
  | "inhibition_challenge"
  | "motor_sequence_builder"

export type DeviceBeatMode = "none" | "metronome" | "music"

export interface DeviceConfig {
  activity: DeviceActivity
  layout: "qwerty" | "alphabetical"
  side: "full" | "left" | "right"
  key_label: "letters" | "blank"
  content: "letters" | "words"
  items: number
  word_length: "3" | "4" | "5" | "6" | "7" | "8" | "0-5" | "5-10" | "10+"
  beat: DeviceBeatMode
  tempo_bpm: number
  pong_mode: "left_right" | "random"
  timeout_enabled: boolean
  timeout_ms: number
  response_window_ms: number
  nogo_percent: number
  wait_percent: number
  sequence_start_length: number
  sequence_progression: boolean
  sequence_max_length: number
  participant: string
}

export interface DeviceKey {
  id: number
  letter: string
}

export interface DeviceBoardKey extends DeviceKey {
  color:
    | "off"
    | "idle"
    | "waiting"
    | "correct"
    | "incorrect"
    | "beat"
    | "wait_cue"
    | "invalid"
}

export interface DeviceState {
  config: DeviceConfig
  capabilities: {
    functioning_keys: DeviceKey[]
    side: DeviceConfig["side"]
    sim: boolean
  }
  device?: {
    serial: string
    firmware_version: string
  }
  presentation?: {
    audio: DeviceAudioEvent | null
    board: DeviceBoardEvent | null
    status: DeviceStatusEvent | null
  }
  session: {
    session_id: string
    activity: DeviceActivity
    phase: DeviceStatusEvent["state"]
    item: number
    items: number
  } | null
}

export interface DeviceStatusEvent {
  state: "idle" | "instruction" | "response" | "feedback" | "complete"
  activity: DeviceActivity
  prompt_text: string
  item: number
  items: number
  trial: number
  trials: number
  beat: DeviceBeatMode
  tempo_bpm: number
  session_id: string | null
}

export interface DeviceBoardEvent {
  keys: DeviceBoardKey[]
  reason?: string
}

export interface DeviceAudioEvent {
  clip: string
}

export interface DeviceResultsReadyEvent {
  session_id: string
}

export interface DeviceEventRecord {
  seq: number
  ts: number
  session_id: string | null
  type: string
  [key: string]: unknown
}

export interface DeviceSessionSummary {
  session_id: string
  generated_utc: string | null
  activity: DeviceActivity
  end_reason: string
  participant: string | null
  settings: DeviceConfig
  counts: {
    items_requested: number
    items_started: number
    items_completed: number
    trials_total: number
    trials_completed: number
  }
  metrics: Record<string, number | null>
  by_key: Array<Record<string, unknown>>
  by_word: Array<Record<string, unknown>>
  ic_metrics: Record<string, number | null> | null
  ic_by_cue_type: Array<Record<string, unknown>>
  msb_metrics: Record<string, number | null> | null
  by_sequence: Array<Record<string, unknown>>
  targeting_metrics: Record<string, unknown> | null
  response_timing_metrics: Record<string, unknown> | null
  rhythm_metrics: Record<string, unknown> | null
  directional_metrics: Record<string, unknown> | null
  sequence_performance: Record<string, unknown> | null
  guardrail_note: string
}

export interface DeviceSessionPayload {
  summary: DeviceSessionSummary
  events: DeviceEventRecord[]
}

export type DeviceEventHandlers = {
  board?: (event: DeviceBoardEvent) => void
  status?: (event: DeviceStatusEvent) => void
  audio?: (event: DeviceAudioEvent) => void
  resultsReady?: (event: DeviceResultsReadyEvent) => void
  connection?: (connected: boolean) => void
}
