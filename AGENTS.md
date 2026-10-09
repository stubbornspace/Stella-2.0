# AGENTS.md

## Context Loading (MUST follow at session start)

Before starting work, load available project context:

- You MUST read `.kiro/steering/**/*.md` if present.
- You MUST read `memory/*.md` if present.
- Workspace-specific skills may exist at `.kiro/skills/**/ws-*.md` - load them when relevant.

If a path does not exist, skip it silently and continue.

## Project Overview

- `Stella-2.0` is a mockup/prototype workspace for Stella patient reporting.
- The active frontend app lives in `stella/` and is a React + TypeScript + Vite UI.
- The app supports both local mock persistence and deployed backend mode via `stella/public/runtime-config.json`.
- `docs/` and `poc.md` hold supporting product and prototype documentation.

## Project Structure

- `stella/` - main app
- `stella/src/App.tsx` - primary page flows and detail views
- `stella/src/api/stella.ts` - mock data access and create-patient behavior
- `stella/src/lib/runtime-config.ts` - runtime switch for backend/auth vs local mock mode
- `stella/src/data/seed.ts` - seeded patient/session data
- `stella/src/config/exercises.ts` - exercise metadata, summary cards, charts, table columns, configuration filters
- `stella/src/config/exercise-control.ts` - runnable exercise setup defaults and runtime configuration helpers
- `stella/src/components/exercise-control/exercise-control-panel.tsx` - exercise launcher and setup UI
- `stella/src/components/exercise-runtime/keyboard-runtime-page.tsx` - live keyboard exercise runtime and save flow
- `stella/src/components/exercise-runtime/keyboard-layout.tsx` - on-screen keyboard layout
- `stella/public/audio/` - generated prompts, letters, words, and effect audio assets
- `stella/src/components/` - shared UI components
- `docs/` - reference docs and mockup assets
- `docs/exercise-runtime-status.md` - current exercise implementation summary and handoff notes
- `poc.md` - broader POC notes

## Setup & Commands

Run app commands from `stella/`:

- `npm run dev` - start local dev server
- `npm run build` - production build
- `npm run lint` - lint
- `npm run typecheck` - TypeScript check
- `npm run format` - Prettier for `ts/tsx`
- `npm run preview` - preview production build

## Code Style & Conventions

- Use TypeScript and React function components.
- Preserve the existing Tailwind utility style and current component patterns in `App.tsx`.
- Keep edits ASCII unless the file already requires otherwise.
- Use `apply_patch` for manual file edits.
- Prefer small, explicit helpers over adding one-off branching inline.
- Exercise-detail filtering and sorting is driven from metadata in `stella/src/config/exercises.ts`; keep new exercise-specific table/filter behavior declarative there when possible.

## Testing

- Minimum verification for UI changes is `cd stella && npm run build`.
- Use `npm run lint` or `npm run typecheck` when changes touch broader logic or types.

## Workflow

- Do not assume the repo root is the app root; most implementation work is in `stella/`.
- Mock patient creation currently generates patient IDs in the mock API rather than taking manual entry from the UI.
- Theme behavior is currently light-only; do not reintroduce dark-mode behavior unless explicitly requested.
- When updating exercise detail views, keep summary cards, charts, filters, and table rows based on the same filtered dataset.
- Keep patient/exercise page headers consistent: back action on the left, primary CTA on the right.
- Treat `docs/exercise-runtime-status.md` as the place for implementation progress/history; keep `AGENTS.md` focused on durable working instructions.

## Domain Knowledge

- Exercise detail pages support configuration-focused filtering and sortable session tables.
- Filter definitions live in `exerciseDefinitions[*].configurationFilters`.
- Table columns for exercise detail pages live in `exerciseDefinitions[*].tableColumns`.
- The exercise launcher route is `/patients/:patientId/exercises` and the live runtime route is `/patients/:patientId/run/:exerciseType`.
- Keyboard exercises currently have real runtime behavior for `letter-target`, `letter-find`, and `eye-pong` rather than mock-only placeholders.
- Completed exercise runs save through `saveExerciseRun`; in backend mode they POST to the API, otherwise they persist in browser `localStorage`.
- Keyboard audio is organized under `stella/public/audio/letters/`, `stella/public/audio/words/`, `stella/public/audio/prompts/`, and `stella/public/audio/effects/`.
- Maria Sanchez (`p-1021`) is the primary demo patient: she has sessions for all exercise types and her seeded data trends upward over time for chart demos.
- Mock persistence uses browser `localStorage` plus seeded fallback data.
