# Exercise runtime status

Updated October 10, 2026.

## Runtime modes

Stella now supports two exercise runtime modes selected at deployment time in `stella/public/runtime-config.json`:

- `embedded` keeps the existing in-browser keyboard runtime and is the checked-in default for the demo site.
- `device` sends the configured exercise to a keyboard API, monitors live status, retrieves the finished results, and saves them through the existing Stella data path.

The route remains `/patients/:patientId/run/:exerciseType` in both modes. The setup screen and saved report model are shared.

## Device simulator

`device-simulator/` is a standalone Node web app that represents the Pi and physical keyboard. It provides:

- the REST and SSE API documented in `docs/api-reference.md`;
- a patient-facing web keyboard at `http://localhost:4175`;
- the existing exercise engine and audio library from `jasons-sim/`;
- result summary, JSONL, and CSV exports;
- permissive local-development CORS;
- API integration tests.

## Stella integration

The device-mode implementation is split into:

- `stella/src/lib/device/device-config.ts`: Stella setup to device configuration;
- `stella/src/lib/device/device-client.ts`: REST and SSE client;
- `stella/src/lib/device/device-results.ts`: device summary/events to Stella run result;
- `stella/src/lib/device/embedded-device-payload.ts`: embedded run result to the
  same normalized device configuration, summary, and raw-event payload;
- `stella/src/components/exercise-runtime/device-runtime-page.tsx`: clinician controller and save flow.

Both runtime modes now pass through `devicePayloadToRunResult` before saving.
Embedded mode uses an in-memory adapter rather than HTTP/SSE, while device mode
retrieves the payload from the simulator or physical keyboard API. The full
device payload is retained with every saved run for future reporting fields.
Completion in device mode is detected through both `results_ready` and the
device returning to `idle`, so an SSE reconnect at the end of a run does not
lose the result.

Contract tests cover all four embedded exercise result types plus early-stop
status. The simulator API suite continues to test the external HTTP/SSE path.

## Local workflow

1. Run `cd device-simulator && npm start`.
2. Copy the `exerciseRuntime` values from `stella/public/runtime-config.device.example.json` into `stella/public/runtime-config.json`.
3. Run `cd stella && npm run dev`.
4. Configure and start an exercise in Stella, then press the illuminated keys on the simulator page.

Restore `exerciseRuntime.mode` to `embedded` before deploying the demo build.

## Current scope

- Letter Target, Letter Find, Eye Pong, and Inhibition Challenge are available from the Stella launcher in both runtime modes.
- Eye Pong uses a fixed QWERTY device map with blank key labels. Left / Right
  mode always uses the full keyboard; Random mode allows Full, Left, or Right.
  Its session report intentionally shows configuration and clinician notes,
  without performance claims.
- Inhibition Challenge uses the same Go/Stop distributions, response window, cue pacing, keyboard layout, side, and labels in Stella and the simulator. Wait/Yellow cues are not generated.
- The embedded runtime uses recorded Polly instructions and exercise audio where configured.
- Embedded results use the same snake_case device settings and event envelope
  as simulator and physical-device results, then use the shared Stella result
  mapper and save path.
- Raspberry Pi firmware, network discovery/pairing, authentication, TLS, offline retry, and hardware validation remain future work.

## Word ranges and audio

- Letter Target and Letter Find use the simulator-compatible `0-5`, `5-10`, and `10+` word ranges. The middle range means 6 through 10 letters so the ranges do not overlap.
- The prescribed library contains 180 child-safe words: 60 up to 5 letters, 100 from 6 through 10 letters, and 20 longer than 10 letters.
- Every word has a spoken-word MP3 and a spelling-prompt MP3 in `stella/public/audio/`.
- `npm run audio:generate` validates `scripts/audio/word-catalog.json`, rebuilds the Polly manifest, skips existing files, and generates any missing clips.
- Legacy sessions that stored exact lengths from 3 through 8 remain readable and are mapped to the corresponding range when rerun.
