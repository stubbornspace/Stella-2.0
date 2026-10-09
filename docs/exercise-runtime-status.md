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

### Letter Find
- Runs with live on-screen keyboard interaction.
- Supports letters and words modes.
- Uses generated audio prompts, letters, and words.
- Saves completed or early-ended sessions.

### Eye Pong
- Runs as an implemented runtime flow.
- Saves completed or early-ended sessions.

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
- The extra right-side tab scrollbar on the exercise launcher was removed.

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
- `stella/src/components/exercise-runtime/keyboard-layout.tsx`
- `stella/src/components/exercise-runtime/keyboard-key.tsx`
- `stella/src/config/exercise-control.ts`
- `stella/src/api/stella.ts`
- `stella/src/lib/runtime-config.ts`
