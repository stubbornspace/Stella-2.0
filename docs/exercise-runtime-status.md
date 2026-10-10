# Exercise Runtime Status

## Current State

The Stella prototype now supports runnable exercise flows for the keyboard activities instead of mock-only exercise cards.

Implemented runtime path:

- Exercise launcher: `/patients/:patientId/exercises`
- Exercise detail page: `/patients/:patientId/exercises/:exerciseType`
- Live runtime: `/patients/:patientId/run/:exerciseType`

## Implemented Exercises

### Letter Target

- Runs with live on-screen keyboard interaction.
- Supports letters and words modes.
- Uses generated audio prompts, letters, and words.
- Saves completed or early-ended sessions.
- Uses letter- or word-specific instructions based on the configured content mode.
- Keeps metronome and music transport continuous while feedback temporarily ducks it.
- Briefly flashes the active target green on each scheduled beat without scaling the key.
- Preserves partial target stats and attempt events when a run ends early.
- Supports physical letter-key input in addition to pointer/touch input.
- Reports on-beat accuracy and timing variability for beat-enabled sessions.

### Letter Find

- Runs with live on-screen keyboard interaction.
- Supports letters and words modes.
- Uses generated audio prompts, letters, and words.
- Saves completed or early-ended sessions.
- Requires an explicit start action so browser audio is unlocked before instructions.
- Pauses beat/input handling while feedback and target audio play.
- Preserves partial target stats and attempt events when a run ends early.
- Supports physical letter-key input in addition to pointer/touch input.
- Reports on-beat accuracy and timing variability for beat-enabled sessions.

### Eye Pong

- Presents exactly 20 visual targets before completing a full run.
- Supports alternating left/right targets and full-keyboard random targets without
  consecutive duplicates.
- Aligns visual targets to metronome beats, analyzed music downbeats, or a silent
  visual cadence.
- Keeps the keyboard non-interactive without visually dimming it.
- Saves accurate partial progress when a run ends early.
- Records each cue's key, scheduled offset, presentation offset, and presentation delay.
- Reports protocol completion and targets presented without making eye-tracking or gaze claims.

### Inhibition Challenge

- Runs explicit shuffled Go, No-Go and Wait trial plans from the selected preset.
- Uses green, red and yellow key cues with the configured response window.
- Records every in-window keypress, response timing, cue type and trial outcome.
- Keeps wrong-key Go trials active so the patient can still make a correct response.
- Scores No-Go and Wait success only after a closed response window with no keypress.
- Saves accurate closed-trial progress and the open trial when a run ends early.

### Motor Sequence Builder

- Presents letter or word sequences one key at a time at the configured speed.
- Supports 2–5 letter random sequences and 3–5 letter words from the audio library.
- Locks input during demonstration, then records ordered reproduction attempts.
- Keeps the expected sequence position active after an incorrect keypress.
- Supports metronome, music and silent presentation modes.
- Saves presentation timestamps, reproduction timing and partial sequences when stopped early.

## Audio Status

Audio has been regenerated for consistency and is organized as:

- `stella/public/audio/letters/`
- `stella/public/audio/words/`
- `stella/public/audio/prompts/`
- `stella/public/audio/effects/`

Notes:

- Polly generation was set up to use `us-east-1` and Joanna generative for synthesized assets.
- The keyboard runtime also uses the legacy success sound restored from the older POC for correct hits.
- The old typed-letter display bar above the keyboard has been removed to better match the physical device.
- Music mode currently uses the curated `stomp.mp3` asset and its pre-analyzed pulse map.
- Live music and metronome input timing is mapped through the Web Audio output clock when the
  browser exposes it, with an output-latency fallback for older browsers.

## Persistence Behavior

Exercise runs do update patient data.

- In backend mode, saves go through `POST /sessions`.
- In local/mock mode, saves persist to browser `localStorage` and refresh the patient dashboards/details through query invalidation.

Backend mode is enabled when runtime config has both:

- `auth.enabled: true`
- `api.baseUrl` set

Current runtime config is loaded from `stella/public/runtime-config.json`.

## Current UX State

### Patient Pages

- Patient top-level tabs are now `Dashboard` and `Analysis`.
- `Run Exercise` is promoted out of the tab model and routed through its own launcher page.
- Exercise detail pages include a `Run Exercise` CTA that opens the launcher with that exercise preselected.

### Session End State

- Completed and stopped-early runs now land on a summary screen.
- Summary screen includes:
  - status
  - duration
  - save state
  - `Run Again`
  - `View Dashboard`
- `Run Again` reopens the launcher with the last presets restored.

### Header/Layout Conventions

- Back action appears on the left of page headers.
- Primary CTA appears on the right.
- Duplicate exercise page headings were consolidated.

## Keyboard UI State

- Keyboard is now responsive and scales to use more of the runtime viewport.
- Layout preserves proportions with square keys.
- Letter keys are semantic buttons with focus and disabled states.
- The extra right-side tab scrollbar on the exercise launcher was removed.

## Result Integrity

- Live letter results retain per-target attempt events, input timestamps, analyzed beat index,
  latency, and signed nearest-beat offset.
- Pointer and physical-key timing uses the originating input event timestamp rather than the
  later React handler execution time.
- On-beat accuracy uses a ±150 ms nearest-beat window. New live sessions compare directly with
  the exact analyzed music pulse or scheduled metronome beat; historical and seeded sessions
  retain their prior constant-tempo normalization.
- Eye Pong continues to report music-paced cue presentation timing only. It does not report
  patient beat-hit accuracy because its keyboard is intentionally non-interactive.
- Letter Target seed metrics are derived from deterministic event-shaped stats so accuracy,
  first-attempt success, throughput, duration, and beat reporting remain internally consistent.
- Letter Target seed word lengths use the same exact-length values as live runtime sessions.
- Letter Find seed metrics are derived from deterministic event-shaped stats so accuracy,
  first-attempt success, throughput, and duration remain internally consistent.
- Eye Pong completion is derived from targets presented out of 20; seeded sessions use the
  same cue-event shape, supported patterns, cadence, and sub-minute duration model as the live
  runtime.
- Letter Find seed word lengths now use the same exact-length values as live runtime sessions.
- Inhibition Challenge accuracy and Go latency are derived from captured closed trials rather
  than simulated completion progress.
- Motor Sequence Builder completion, first-attempt accuracy and completion time are derived
  from captured presentation and reproduction events.

## Open Follow-Up Ideas

These are not necessarily bugs, but likely next polish items:

- Review prompt wording and add more prompt variants.
- Tune keyboard responsiveness further for tablet/landscape layouts.
- Consider reducing large bundle size warnings from Vite build output.
- Review all logos/branding surfaces for consistency (`logo.png`, login page, favicon, header).

## Key Files

- `stella/src/App.tsx`
- `stella/src/components/exercise-control/exercise-control-panel.tsx`
- `stella/src/components/exercise-runtime/keyboard-runtime-page.tsx`
- `stella/src/components/exercise-runtime/advanced-keyboard-runtimes.tsx`
- `stella/src/components/exercise-runtime/keyboard-layout.tsx`
- `stella/src/components/exercise-runtime/keyboard-key.tsx`
- `stella/src/config/exercise-control.ts`
- `stella/src/api/stella.ts`
- `stella/src/lib/runtime-config.ts`
