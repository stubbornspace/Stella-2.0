# Device API reference

This document defines the HTTP contract between Stella and the keyboard device. The same contract is implemented by the standalone simulator in `device-simulator/` so Stella can be developed without a Raspberry Pi or physical keyboard.

## Implementation status

As of October 10, 2026:

- The reference exercise engine is `jasons-sim/engine.js`.
- The working mock device API and keyboard web page are in `device-simulator/`.
- Stella's client, configuration mapper, and result mapper are in `stella/src/lib/device/`.
- Stella can select the embedded or device runtime through `stella/public/runtime-config.json`.
- Raspberry Pi firmware and hardware transport are not part of this repository and have not been verified here. They should implement this contract.

The API uses JSON over HTTP under `/api` and Server-Sent Events (SSE) for live updates. Activity and field names on the wire use `snake_case`; Stella's internal model uses `kebab-case` activity names and `camelCase` fields.

## Running the mock device

From the repository root:

```sh
cd device-simulator
npm start
```

The API and simulated keyboard page are then available at `http://localhost:4175`.

To point Stella at it, use the values shown in `stella/public/runtime-config.device.example.json`:

```json
{
  "exerciseRuntime": {
    "mode": "device",
    "deviceBaseUrl": "http://localhost:4175"
  }
}
```

The checked-in `runtime-config.json` remains in `embedded` mode so the hosted demo keeps its in-browser keyboard.

## Configuration

`POST /api/config` accepts a partial configuration. The device merges it with its current configuration and returns the complete, normalized object.

| Field | Type / values | Applies to |
|---|---|---|
| `activity` | `letter_target`, `letter_find`, `eye_pong`, `inhibition_challenge`, `motor_sequence_builder` | All |
| `layout` | `qwerty`, `alphabetical` | All |
| `side` | `full`, `left`, `right` | All |
| `key_label` | `letters`, `blank` | All; Letter Find forces visible letters |
| `content` | `letters`, `words` | Letter Target, Letter Find, Motor Sequence Builder |
| `items` | integer 1–10 for Letter Target, Letter Find, and Eye Pong; 1–100 for Inhibition Challenge; 1–20 for Motor Sequence Builder | All |
| `word_length` | `0-5`, `5-10`, or `10+`; legacy exact lengths `3`–`8` are also accepted | Letter Target and Letter Find in word mode |
| `beat` | `none`, `metronome`, `music` | All |
| `tempo_bpm` | integer 30–120 | All |
| `pong_mode` | `left_right`, `random` | Eye Pong |
| `timeout_enabled` | boolean | Letter Target and Letter Find |
| `timeout_ms` | integer 250–60000 | Letter Target and Letter Find |
| `response_window_ms` | integer 500–10000 | Inhibition Challenge |
| `nogo_percent` | integer 0–100 | Inhibition Challenge |
| `wait_percent` | integer 0–100 | Inhibition Challenge |
| `sequence_start_length` | integer 2–5 | Motor Sequence Builder |
| `sequence_progression` | boolean | Motor Sequence Builder |
| `sequence_max_length` | integer 2–5 | Motor Sequence Builder |
| `participant` | string, at most 32 characters | All |

Unknown fields and invalid enum values return `400`. Numeric values are rounded and clamped to the ranges above. If `nogo_percent + wait_percent` exceeds 100, `wait_percent` is reduced. `sequence_max_length` cannot be below `sequence_start_length`.

Example request:

```json
{
  "activity": "letter_target",
  "content": "letters",
  "items": 3,
  "layout": "qwerty",
  "side": "full",
  "key_label": "letters",
  "beat": "metronome",
  "tempo_bpm": 54,
  "participant": "P-1021"
}
```

Example response:

```json
{
  "config": {
    "activity": "letter_target",
    "layout": "qwerty",
    "side": "full",
    "key_label": "letters",
    "content": "letters",
    "items": 3,
    "word_length": "0-5",
    "beat": "metronome",
    "tempo_bpm": 54,
    "pong_mode": "left_right",
    "timeout_enabled": false,
    "timeout_ms": 5000,
    "response_window_ms": 1500,
    "nogo_percent": 40,
    "wait_percent": 10,
    "sequence_start_length": 2,
    "sequence_progression": true,
    "sequence_max_length": 5,
    "participant": "P-1021"
  }
}
```

## REST endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/state` | Current configuration, capabilities, device identity, running session, and latest presentation state |
| `POST` | `/api/config` | Merge and validate a partial configuration; rejected with `409` during a run |
| `POST` | `/api/start` | Start the configured exercise and return `{ "session_id": "..." }` |
| `POST` | `/api/stop` | End the active run with `clinician_stopped` |
| `POST` | `/api/press` | Simulator-only physical key injection: `{ "key_id": 11 }` |
| `POST` | `/api/audio-ended` | Report completion of a clip when the API host is not playing its own audio |
| `GET` | `/api/results` | Summary for the latest completed run, or `204` when none exists |
| `GET` | `/api/export.jsonl` | Raw events for the latest completed run as newline-delimited JSON |
| `GET` | `/api/export.csv` | The same raw events as CSV |
| `GET` | `/api/events` | Live SSE stream |
| `GET` | `/sounds/<clip>.wav` | Exercise audio asset |

### State response

```json
{
  "config": { "activity": "letter_target", "items": 3 },
  "capabilities": {
    "functioning_keys": [
      { "id": 1, "letter": "Q" },
      { "id": 11, "letter": "A" }
    ],
    "side": "full",
    "sim": true
  },
  "device": {
    "serial": "SIM-0001",
    "firmware_version": "sim-0.1.0"
  },
  "session": {
    "session_id": "S-20261010-0001",
    "activity": "letter_target",
    "phase": "response",
    "item": 1,
    "items": 3
  },
  "presentation": {
    "board": { "keys": [], "reason": "target", "key_label": "letters" },
    "status": { "state": "response", "prompt_text": "Press the green key (A)" },
    "audio": { "clip": "lt_single_beat" }
  }
}
```

`session` is `null` while idle. `presentation` contains the most recent live values so a client that connects or reloads in the middle of an exercise can rebuild its display. SSE remains the primary source after connection.

The 30 keyboard positions use IDs 1–30. QWERTY letter positions are 1–19 and 22–28; IDs 20, 21, 29, and 30 are reserved. A real device should set `capabilities.sim` to `false` and reject `/api/press`, since its key presses come from hardware.

## SSE events

`GET /api/events` responds with `text/event-stream`. Each named event carries one JSON object in its `data` field.

### `board`

Emitted whenever key colors change.

```text
event: board
data: {"keys":[{"id":1,"letter":"Q","color":"idle"},{"id":11,"letter":"A","color":"waiting"}],"reason":"target","key_label":"letters"}
```

Color values are `off`, `idle`, `waiting`, `correct`, `incorrect`, `beat`, `wait_cue`, and `invalid`. The simulator page uses `key_label` to show or hide the mapped letter without removing the letter from the API event.

### `status`

Emitted when the exercise phase, prompt, or progress changes.

```text
event: status
data: {"state":"response","activity":"letter_target","prompt_text":"Press the green key (A)","item":1,"items":3,"trial":1,"trials":1,"beat":"metronome","tempo_bpm":54,"session_id":"S-20261010-0001"}
```

State values are `idle`, `instruction`, `response`, `feedback`, and `complete`.

### `audio`

```text
event: audio
data: {"clip":"lt_single_beat"}
```

The simulator plays the referenced WAV and advances its engine automatically. A Pi implementation can play the clip locally.

### `results_ready`

```text
event: results_ready
data: {"session_id":"S-20261010-0001"}
```

After this event, Stella fetches `/api/results` and `/api/export.jsonl`, maps the payload to its exercise session model, and saves it. Clients should also treat a transition from an active session to `idle` as a completion signal; this recovers cleanly if an SSE reconnect misses `results_ready`.

## Results

The summary returned by `/api/results` includes:

- session identity, activity, participant, generation time, and `end_reason`;
- the complete normalized configuration in `settings`;
- requested, started, and completed item/trial counts;
- activity metrics and per-key, per-word, per-cue, or per-sequence breakdowns;
- targeting, response timing, rhythm, directional, and sequence-performance metric blocks when applicable.

The raw JSONL export is authoritative event-level data. Every line includes `seq`, `ts`, `session_id`, and `type`, plus event-specific fields. Stella preserves both the summary and raw events under `rawEventPayload.devicePayload` while also translating the key values needed by its existing reports.

## Transport and deployment notes

- The simulator sends permissive CORS headers so Stella can run on a different localhost port.
- A browser-hosted Stella deployment must not call a plain-HTTP Pi from an HTTPS page; use same-scheme hosting, a trusted HTTPS endpoint on the device, or a local bridge/proxy.
- Authentication, pairing, discovery, TLS, retries, and API versioning are still production design decisions. The mock API intentionally focuses on the exercise boundary.
- The current simulator keeps only the latest completed session in memory and resets when restarted.
