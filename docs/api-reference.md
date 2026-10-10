# API reference — clinician app ⇄ device

For whoever's building the client that talks to the keyboard (the collaborator's
iPad app, or anyone driving the simulator's engine over HTTP instead of
in-process). This is the **wire contract** defined by `SPEC.md §7`: REST +
Server-Sent Events, base path `/api`.

## Status — read this first (updated 2026-10-10)

This is the **wire contract** of the keyboard (`SPEC.md §7`). Two implementations exist and they now **behave the same**:

- **The simulator (`sim/engine.js`)** is the reference. It runs **in the browser** and calls the engine in-process (`app.js` calls `engine.configure()`, `engine.start()` …), so there
  is no HTTP `/api` in `sim/` itself. Every JSON example below was captured from a real run of it.
- **The firmware (`firmware/core/`, served by `firmware/port/pico/net_http.c`)** is a port of that engine that does the same thing: all five activities, every setting in §1, the same
  raw events and the same summary. A parity test (`firmware/tests/run_parity.py`) replays 206 randomised sessions through both engines and compares every event, every key colour, every
  spoken clip, every status message and the full summary; they are identical. **What has not been exercised is the hardware itself**: the HTTP layer, the SD card, the speaker and the beat
  have been built (the firmware compiles and links for the Pico 2 W) but not yet run on a keyboard, and the SD card is still a stub (voice clips are silent, paced by a time estimate).
- **The web app has a keyboard mode** (`sim/remote_engine.js`): when the page is served by the keyboard it drives the keyboard through the `/api` below instead of running the engine in
  the browser, and shows the keyboard's own board, prompts and results. It is tested end to end against the real C engine (`firmware/tests/run_device_mode.py`).

### Differences between the keyboard and the simulator that remain (all deliberate)

| | Simulator | Keyboard |
|---|---|---|
| `capabilities.sim` | `true` | `false` (`POST /api/press` answers `403`; presses come from the switches) |
| Session id | `S-YYYYMMDD-NNNN` | `S-NNNNNN`: a counter since power-on (no wall clock until NTP). The id is only a label; the cloud assigns its own. |
| `generated_utc` in the summary | the time | `null`; the web app fills it in with its own clock when it receives the results |
| `device` block in `GET /api/state` | absent | `{ "serial": "<chip id>", "firmware_version": "<x.y.z>" }` |
| Raw event capacity | unlimited | **1,024 events** per session. A 10-item session is about 300-400 events even with a beat, so this is not reached in normal use; if it is, beat ticks are dropped first and the events that matter are kept. |
| Summary | computed when asked | computed once when the session ends and kept (16 KB buffer); `GET /api/results` returns the last finished session |
| Voice clips | the browser plays `sounds/<clip>.wav` | the keyboard plays them from the SD card; **until the SD driver is finished** each clip is silent and "ends" after a rough spoken length so a session runs at a human pace |
| Beat (metronome / music) | the browser's | a click from the keyboard's speaker at the tempo. "Music" is the same pulse at a lower pitch: a real music bed is not implemented. |
| Serving the app | `sim_server.py` (static files + the `/sdcard/` emulation, §5) | the files of `sim/` are **embedded in the image** by `firmware/tools/embed_web.py` (gzip; test pages and the emulated SD folder excluded) |
| Connections | n/a | up to **4 SSE listeners** (the oldest is dropped when a fifth connects), and the page's own requests alongside them; a request (headers + body) must fit in **1.5 KB**. Everything runs in the keyboard's main loop, one thing at a time. |

Large responses (the UI scripts, a summary up to 16 KB, a whole-session export of up to ~300 KB, a voice clip) are **streamed** in pieces that fit lwIP's send buffer; exports have no
`Content-Length` and end when the connection closes.

**Not on the wire:** `participant`/patient lists, history, "Repeat" and lessons are **client-side** features. The simulator keeps patients and history in files on the (emulated) SD
card (`docs/patient-database-design.md`); the cloud service (§6) is reached by the clinician app, never by the keyboard.

## Hosting / transport

- Base path `/api`, plain HTTP (no TLS) at `http://picoboard.local/` — the
  device joins the clinic Wi-Fi and serves the clinician app's own static
  files from itself. This is required, not optional: a page loaded over HTTPS
  cannot call `http://` from a browser (mixed content), so the client app must
  be served *by* the device, same-origin. See `SPEC.md §7`.
- The clinician app is also what talks to the cloud (§6). It is served over plain HTTP from the keyboard and calls the HTTPS cloud API (allowed: only the reverse is blocked).
- Live updates push over **SSE** (`GET /api/events`, `text/event-stream`), not
  WebSocket. See `docs/open-questions.md` item 14 if you need a WS adapter
  instead.

---

## 1. The config object

Every session is configured by one JSON object. Fields are additive across
activities — a client only needs to send the ones relevant to the activity
it's driving; the rest keep their last value server-side.

| Field | Type | Applies to | Notes |
|---|---|---|---|
| `activity` | `"letter_target"\|"letter_find"\|"eye_pong"\|"inhibition_challenge"\|"motor_sequence_builder"` | all | |
| `layout` | `"qwerty"\|"alphabetical"` | all | default `"qwerty"`; which physical key id shows which letter — see `capabilities.functioning_keys` below |
| `side` | `"full"\|"left"\|"right"` | all | default `"full"`; keep the exercise on the left (columns 1–5) or right (columns 6–10) half of the board. The other side stays dark; a press there is logged as `invalid_keypress` (`reason: "outside_side"`) and never scored. Words mode uses only words spelled with that side's letters, so the available words depend on `layout` (`SPEC.md §1.4`) |
| `key_label` | `"letters"\|"blank"` | LT, Eye Pong, IC, MSB | default `"letters"`; server forces `"letters"` when `activity` is `letter_find` |
| `content` | `"letters"\|"words"` | LT, LF, MSB | |
| `items` | int 1–10 | all | letters/words/sequences, Eye Pong target changes, or IC trial count |
| `word_length` | `"0-5"\|"5-10"\|"10+"` | LT, LF (words) | |
| `beat` | `"none"\|"metronome"\|"music"` | all | |
| `tempo_bpm` | int 30–120 | all | |
| `pong_mode` | `"left_right"\|"random"` | Eye Pong | |
| `timeout_enabled` | bool | LT, LF | default `false` |
| `timeout_ms` | int | LT, LF | only if enabled |
| `response_window_ms` | int 500–10000 | Inhibition Challenge | **required** for IC; default 1500 |
| `nogo_percent` / `wait_percent` | int 0–100 | Inhibition Challenge | remainder is Go; default 40 / 10 |
| `sequence_start_length` | int 2–5 | Motor Sequence Builder | |
| `sequence_progression` | bool | Motor Sequence Builder | default `true` |
| `sequence_max_length` | int | Motor Sequence Builder | default 5 |
| `participant` | string ≤32 chars | all | optional label; becomes the patient *code* if the cloud service is built |

Defaults (what the device starts with / falls back to for any field not yet
set):

```json
{
  "activity": "letter_target",
  "layout": "qwerty",
  "side": "full",
  "key_label": "letters",
  "content": "letters",
  "items": 4,
  "word_length": "0-5",
  "beat": "none",
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
  "participant": ""
}
```

**Engine behaviours worth knowing** (not config fields): in words mode the word order is **random per session** (`sim/engine.js`; every word once before a repeat, none twice in a row), and when a
side limit leaves no word that fits, the session falls back to letters and `session_start` records `content_fallback: "letters"`. A saved config can be re-run exactly with
`StellaEngine.loadConfig()` (used by History *Repeat* and the cloud's *Repeat*); it applies a stored `config` without changing the clamps.

Source: `sim/engine.js` `DEFAULT_CONFIG`. Validation/clamping rules (e.g.
`items` clamped to 1–10, `nogo_percent + wait_percent ≤ 100`) live in
`StellaEngine.configure()` — the server must apply the same clamps before
persisting, not trust the client.

---

## 2. REST endpoints

| Method | Path | Body → Result |
|---|---|---|
| GET | `/api/state` | → `{ config, capabilities, session }` |
| POST | `/api/config` | partial config → `{ config }` (full, post-clamp) |
| POST | `/api/start` | `{}` → `{ session_id }` |
| POST | `/api/stop` | `{}` → `{ end_reason: "clinician_stopped" }` |
| POST | `/api/press` | `{ "key_id": 11 }` — **simulator dev server only**; injects a key press, functioning or one of the 4 reserved "invalid" ids (20/21/29/30, §4 below). **`403` on the keyboard** (real presses come from the switches). |
| POST | `/api/audio-ended` | `{ "clip": "lt_single" }` — a client that is itself the audio device reports a clip finished playing; that drives the Go marker. The keyboard plays its own clips and reports their end internally; the web app in keyboard mode does not call this. |
| GET | `/api/results` | → latest session summary (§4 below) or `204 No Content` if none yet |
| GET | `/api/export.jsonl` | → raw event log of the latest session, JSON Lines |
| GET | `/api/export.csv` | → same, CSV |
| GET | `/api/events` | → SSE stream, see §3 |
| GET | `/sounds/<clip>.wav` | → static audio clip |
| GET | `/`, `/app.js`, `/styles.css`, … | → static clinician UI |

### `GET /api/state`

```json
{
  "config": { "...": "the config object from §1" },
  "capabilities": {
    "functioning_keys": [
      { "id": 1,  "letter": "Q" }, { "id": 2,  "letter": "W" }, { "id": 3,  "letter": "E" },
      { "id": 4,  "letter": "R" }, { "id": 5,  "letter": "T" }, { "id": 6,  "letter": "Y" },
      { "id": 7,  "letter": "U" }, { "id": 8,  "letter": "I" }, { "id": 9,  "letter": "O" },
      { "id": 10, "letter": "P" }, { "id": 11, "letter": "A" }, { "id": 12, "letter": "S" },
      { "id": 13, "letter": "D" }, { "id": 14, "letter": "F" }, { "id": 15, "letter": "G" },
      { "id": 16, "letter": "H" }, { "id": 17, "letter": "J" }, { "id": 18, "letter": "K" },
      { "id": 19, "letter": "L" }, { "id": 22, "letter": "Z" }, { "id": 23, "letter": "X" },
      { "id": 24, "letter": "C" }, { "id": 25, "letter": "V" }, { "id": 26, "letter": "B" },
      { "id": 27, "letter": "N" }, { "id": 28, "letter": "M" }
    ],
    "sim": true
  },
  "session": null
}
```

The keyboard adds a `device` block (the simulator does not have one): `"device": { "serial": "2E41A9C0D7F36B15", "firmware_version": "0.4.0" }` — the chip's unique id and the
version the image was built with (`-DSTELLA_FIRMWARE_VERSION=`). The web app uses the serial as `device_serial` when it uploads to the cloud (§6).

`session` is `null` when idle; while a session is running it's
`{ session_id, activity, phase, item, items }`. `capabilities.sim` tells the
client whether `POST /api/press` is accepted (true on the simulator/dev
server, false on real hardware, which should 403 that route).

`capabilities.functioning_keys` reflects **`config.layout`** and **`config.side`** (only the keys on the chosen side;
`capabilities.side` echoes it) — the example
above is `"qwerty"`; under `"alphabetical"` it's the same 26 letters at
different ids (A-T fill ids 1-20, U-Z centered at ids 23-28 — `SPEC.md §1.2`).
Re-fetch `/api/state` (or watch the `board` SSE event) after changing `layout`
rather than caching this array.

### `POST /api/config`

Request — send only what's changing:

```json
{ "activity": "letter_target", "content": "words", "items": 1, "word_length": "0-5", "participant": "PT-042" }
```

Response — the full config after merging + clamping:

```json
{
  "config": {
    "activity": "letter_target", "content": "words", "items": 1,
    "word_length": "0-5", "beat": "none", "tempo_bpm": 54,
    "pong_mode": "left_right", "timeout_enabled": false, "timeout_ms": 5000,
    "response_window_ms": 1500, "nogo_percent": 40, "wait_percent": 10,
    "sequence_start_length": 2, "sequence_progression": true,
    "sequence_max_length": 5, "participant": "PT-042"
  }
}
```

Inhibition Challenge example body:

```json
{ "activity": "inhibition_challenge", "items": 6, "response_window_ms": 1200, "nogo_percent": 40, "wait_percent": 15 }
```

Motor Sequence Builder example body:

```json
{ "activity": "motor_sequence_builder", "content": "letters", "items": 2, "sequence_start_length": 2, "sequence_progression": true }
```

### `POST /api/start`

```json
{ "session_id": "S-20260914-0001" }
```

Session IDs are `S-YYYYMMDD-NNNN` in the simulator; the keyboard uses `S-NNNNNN` (a counter since power-on; no wall clock until NTP is added) — see `docs/porting.md`.

### `POST /api/press`

```json
{ "key_id": 11 }
```

`key_id` is one of the 30 grid positions (`SPEC.md §1.1`). All 26 letter
positions are functioning; a press on one of the 4 reserved positions (20,
21, 29, 30) is **not** ignored — it's recorded as its own `invalid_keypress`
event (`SPEC.md §4.0`/`§6.1`), just never scored as an exercise error.

### `POST /api/audio-ended`

```json
{ "clip": "lt_single" }
```

---

## 3. SSE stream — `GET /api/events`

`Content-Type: text/event-stream`. Each frame's `data:` is one JSON object;
the `event:` name is the `type` below. Captured live from a real Letter Target
session (`sim/app.js`'s `onBoard`/`onStatus`/`onAudio` hooks *are* these
payloads verbatim):

### `board` — any key visual change

`keys` always carries all 30 grid positions (26 functioning + 4 reserved),
captured live from a running Letter Target session — target key 3 ("E") is
lit, and key 20 (a reserved position) has just been pressed:

```json
{
  "keys": [
    { "id": 1,  "letter": "Q", "color": "idle" },
    { "id": 2,  "letter": "W", "color": "idle" },
    { "id": 3,  "letter": "E", "color": "waiting" },
    { "id": 4,  "letter": "R", "color": "idle" },
    { "id": 5,  "letter": "T", "color": "idle" },
    { "id": 6,  "letter": "Y", "color": "idle" },
    { "id": 7,  "letter": "U", "color": "idle" },
    { "id": 8,  "letter": "I", "color": "idle" },
    { "id": 9,  "letter": "O", "color": "idle" },
    { "id": 10, "letter": "P", "color": "idle" },
    { "id": 11, "letter": "A", "color": "idle" },
    { "id": 12, "letter": "S", "color": "idle" },
    { "id": 13, "letter": "D", "color": "idle" },
    { "id": 14, "letter": "F", "color": "idle" },
    { "id": 15, "letter": "G", "color": "idle" },
    { "id": 16, "letter": "H", "color": "idle" },
    { "id": 17, "letter": "J", "color": "idle" },
    { "id": 18, "letter": "K", "color": "idle" },
    { "id": 19, "letter": "L", "color": "idle" },
    { "id": 22, "letter": "Z", "color": "idle" },
    { "id": 23, "letter": "X", "color": "idle" },
    { "id": 24, "letter": "C", "color": "idle" },
    { "id": 25, "letter": "V", "color": "idle" },
    { "id": 26, "letter": "B", "color": "idle" },
    { "id": 27, "letter": "N", "color": "idle" },
    { "id": 28, "letter": "M", "color": "idle" },
    { "id": 20, "letter": "",  "color": "invalid" },
    { "id": 21, "letter": "",  "color": "off" },
    { "id": 29, "letter": "",  "color": "off" },
    { "id": 30, "letter": "",  "color": "off" }
  ],
  "reason": "invalid"
}
```

`color` ∈ `off | idle | waiting | correct | incorrect | beat | wait_cue | invalid`
(`wait_cue` = steady yellow, Inhibition Challenge's "Wait" cue only;
`invalid` = grey flash, a reserved position (20/21/29/30) was pressed —
`SPEC.md §1.3`). `reason` is a free-text debug hint, not part of the contract.

A correct press produces `"color": "correct"` on that key; item completion
resets to `"idle"` (reserved positions shown trimmed here for brevity — the
real payload always has all 30):

```json
{ "keys": [ { "id": 3,  "letter": "E", "color": "idle" },
            { "id": 11, "letter": "A", "color": "correct" },
            { "id": 19, "letter": "L", "color": "idle" },
            { "id": 27, "letter": "N", "color": "idle" }, "..." ],
  "reason": "correct" }
```

### `status` — phase / progress change

```json
{
  "state": "instruction",
  "activity": "letter_target",
  "prompt_text": "Press the green key (A)",
  "item": 1,
  "items": 2,
  "trial": 1,
  "trials": 1,
  "beat": "none",
  "tempo_bpm": 54,
  "session_id": "S-20260914-0001"
}
```

`state` ∈ `idle | instruction | response | feedback | complete`. Before a
session starts, `item`/`items` are `0` and `session_id` is `null`:

```json
{ "state": "idle", "activity": "letter_target", "prompt_text": "", "item": 0,
  "items": 0, "trial": 1, "trials": 1, "beat": "none", "tempo_bpm": 54,
  "session_id": null }
```

### `audio` — the engine wants a clip played

```json
{ "clip": "lt_single" }
```

The client plays `/sounds/lt_single.wav` and, when it finishes, calls
`POST /api/audio-ended {"clip":"lt_single"}` — that's what advances the
engine (it's the Go marker for an instruction clip). Sequence from one real
Letter Target trial: `lt_single` (instruction) → `letter_a` (spoken
confirmation on correct press) → `great_job` (item complete) → `lt_single`
(next item's instruction).

### `results_ready` — summary computed and stored

```json
{ "session_id": "S-20260914-0001" }
```

Client should then `GET /api/results` (or `/api/export.jsonl` /
`/api/export.csv`) — see `docs/results-format.md`.

---

## 4. Results & raw events

Covered in a dedicated document: **`docs/results-format.md`** — the session
summary object (with a real example per activity), the raw event log / CSV
export formats, and the product-owner "Metrics for Tom" fields (per-attempt
targeting/timing/rhythm data on `keypress`, and the five session-level
metrics blocks computed from them) — the shape a cloud analytics platform
would ingest.

---

## 5. Simulator-only: the emulated microSD card (`/sdcard/`)

`sim/sim_server.py` (the simulator's web server) also emulates the keyboard's microSD card so the patient list and history persist between runs. It is **not part of the
device contract** (the firmware does not serve it; on hardware the same data is files on the real card). It exists so the file layout in `docs/patient-database-design.md` can be
exercised and later reimplemented on the Pico.

| Request | Result |
|---|---|
| `GET /sdcard/?ping` | `{"sdcard": true, "folder": "sim/sdcard"}` (the app uses this to detect the server; without it, it falls back to browser storage) |
| `GET /sdcard/?ls=<prefix>` | JSON list `[{"path", "size"}]` of files whose path starts with the prefix |
| `GET /sdcard/<path>` | the file (`text/plain`); `404` if missing, or `204` if `?optional` is added |
| `PUT /sdcard/<path>` | replaces the whole file (written to a temp file, then renamed, so a crash never leaves half a file); `400` for a bad path or more than 8 MB |
| `DELETE /sdcard/<path>` | removes the file |

Paths are relative, made of letters, digits, `.`, `_`, `-` and `/`, with no `.` or `..` segments.

---

## 6. Using this API with the cloud service

The keyboard never talks to the cloud. The **clinician app** reads a finished session from this API and uploads it with the signed-in clinician's token
(`docs/cloud-architecture.md` §0 and §3.1). The mapping, for whoever implements an app or a firmware-side relay:

| Cloud `POST /v1/ingest` field | Comes from |
|---|---|
| `config` | `summary.settings` (the full config the session ran with; same object as §1) |
| `summary` | `GET /api/results` |
| `events` | `GET /api/export.jsonl`, one JSON object per line |
| `patient_code` | `config.participant` (must equal it, or be empty) |
| `started_at`, `ended_at`, `end_reason` | the `session_start` / `session_end` events and `summary.end_reason` (the device has no wall clock before NTP, so the app stamps real times) |
| `client_record_id` | **made by the app** (8–64 chars of `A-Za-z0-9._-`): the retry key, so an upload retried after a dead network creates no second row. The engine's own session ids restart on every page load and cannot be used. |
| `lesson`, `content_pack` | the app, if the session was started from a saved lesson / word list |
| `device_serial`, `firmware_version` | `GET /api/state` → `device.serial` / `device.firmware_version` on the keyboard (the web app in keyboard mode uses them). The simulator uses a configured serial (`SIM-0001`). |
| `app_version` | the app |

Minimal upload (an `Authorization: Bearer <Cognito ID token>` header is also required):

```json
POST /v1/ingest
{
  "client_record_id": "rec-8f3a9c2d41b7",
  "patient_code": "PT-042",
  "device_serial": "SIM-0001",
  "config": { "activity": "letter_target", "content": "words", "items": 1, "word_length": "0-5", "participant": "PT-042" },
  "summary": { "...": "the object from GET /api/results" },
  "events": [ { "seq": 1, "ts": 200157, "type": "session_start", "...": "..." } ],
  "started_at": "2026-10-09T14:00:00Z",
  "ended_at": "2026-10-09T14:03:10Z",
  "end_reason": "completed",
  "firmware_version": "0.9.3",
  "app_version": "app-0.4.2"
}
```

The cloud **rejects** (rather than clamps) a config outside the ranges in §1, refuses any field that looks like a name, and requires the keyboard's serial to be registered to the
signed-in clinician's organisation first. Full request and response rules: `docs/cloud-architecture.md` §0.4.
