## Context Loading (MUST follow at session start)

Before starting work, load available project context:

- You MUST read `.kiro/steering/**/*.md` if present — workspace steering rules.
- You MUST read `.konductor/memory/*.md` if present — persistent facts and preferences.
- Workspace-specific skills may exist at `.kiro/skills/**/ws-*.md` — be aware and load when relevant.
- You MUST read `Stella_Prototype_Exercise_Functional_Requirements_v1.md` before product, UX, or frontend work.
- You MUST read `Stella_Persona_Capability_Matrix.md` before product, UX, or frontend work if that file exists.
- You MUST read `Stella_Clinician_Workflow.md` before designing clinician flows, navigation, or mockups if that file exists.
- You MUST read `Stella_Clinician_Screen_Inventory.md` before designing clinician routes, information architecture, or mockups if that file exists.
- You MUST read `Stella_Patient_Workflow.md` before designing patient flows, routes, or mockups if that file exists.
- You MUST inspect `stella/package.json` and `stella/components.json` before changing frontend tooling or UI conventions.
- For frontend work, you MUST read the relevant files in `stella/src/` before editing. Start with `App.tsx` and `index.css` unless the task clearly targets other files.

If a path does not exist, skip it silently and continue.

## Project Overview

Stella is a prototype therapy application built around a keyboard-like hardware device with illuminated letter keys and clinician-configured exercises. This repository contains the functional requirements at the repo root and a React app in `stella/` that will become the software component for administration, clinic operations, activity delivery, and completion review. The product must support three personas: admins, clinicians, and patients, with role-appropriate access and navigation.

## Project Structure

- `Stella_Prototype_Exercise_Functional_Requirements_v1.md`: product source of truth for activities, prototype constraints, session behavior, and reporting requirements.
- `Stella_Persona_Capability_Matrix.md`: role and access model for admins, clinicians, and patients.
- `Stella_Clinician_Workflow.md`: first-pass clinician operating flow and screen model.
- `Stella_Clinician_Screen_Inventory.md`: clinician information architecture, route map, and first-pass screen inventory.
- `Stella_Patient_Workflow.md`: patient execution flow, states, and patient-facing route model.
- `stella/`: Vite + React + TypeScript frontend workspace.
- `stella/src/`: app source.
- `stella/src/components/ui/`: shadcn UI components.
- `stella/src/index.css`: shared theme tokens and CSS variable definitions.

## Setup & Commands

Run frontend commands from `stella/`.

- `npm install`
- `npm run dev`
- `npm run build`
- `npm run lint`
- `npm run typecheck`
- `npm run format`
- `npm run preview`

## Code Style & Conventions

- Use TypeScript and React for all app code.
- Use shadcn components, styling primitives, and tokens for new UI work. Prefer extending `stella/src/components/ui/` over introducing a parallel component system.
- Reuse the existing aliases from `stella/components.json` such as `@/components`, `@/components/ui`, and `@/lib`.
- Reuse the CSS variables and theme tokens defined in `stella/src/index.css`. Do not introduce one-off colors or ad hoc spacing scales when the existing design tokens can cover the need.
- Keep components small, composable, and readable. Prefer explicit props and straightforward state over opaque abstractions.
- Treat `stella/` as the active software workspace. Root-level changes should usually be limited to product or agent guidance unless the task explicitly requires broader repo work.

## Testing

Run validation from `stella/`.

- Use `npm run typecheck` for TypeScript safety.
- Use `npm run lint` for static checks.
- Use `npm run build` before handing off UI work that changes app structure, routes, or shared components.
- When reviewing mockups or flows against requirements, verify that the UI preserves activity-specific differences such as visible target cues in Letter Target versus audio-only prompts in Letter Find.

## Workflow

- Start from the requirements doc, then inspect the current React implementation before proposing or making UI changes.
- For product design work, follow this order:
  1. map the user flows
  2. derive the view inventory
  3. define navigation and handoff points
  4. create mockups
- Do not jump directly to high-fidelity screens without a clear flow model.
- Define flows separately for each persona before combining them into an app shell:
  - Admin: global administration and full access
  - Clinician: clinic-scoped management, patient management, exercise configuration, metrics, and analysis
  - Patient: guided exercise completion
- Early UX work should cover role entry, session setup, activity run, completion summary, and early-stop or incomplete-session handling where relevant.
- Group mockups and implementation work by workflow stage rather than by isolated components.

## Domain Knowledge

- The app must support three personas:
  - Admin: full access to the application
  - Clinician: full access within their clinic, including creating and editing patients, viewing metrics and analysis, and configuring/managing exercises
  - Patient: works through assigned exercises
- The product currently defines five activities: Letter Target, Letter Find, Eye Pong, Inhibition Challenge, and Motor Sequence Builder.
- The current prototype has limited working keys and some simulated or manually coordinated behaviors. The software should acknowledge those constraints rather than assuming full keyboard capability.
- Letter Target and Letter Find must remain distinct in the UI and reporting model because one reveals the target visually and the other does not.
- Eye Pong is a visual tracking exercise and does not currently provide objective eye-tracking measurements.
- Inhibition Challenge requires a response window because successful inhibition must be measured explicitly.
- Motor Sequence Builder is an observe-then-repeat sequence task and should be treated as a distinct flow, not a minor variant of spelling.

## Design Rules

- The UI should be minimalist, calm, and easy to navigate.
- Prefer obvious next actions, strong layout hierarchy, and generous spacing over dense controls.
- Use restrained accent color and motion. Clarity and state readability matter more than visual flourish.
- Favor neutral surfaces and accessible contrast. Avoid decorative clutter, ambiguous icon-only navigation, and dashboard noise.
- Design role-specific experiences:
  - Admin and clinician screens can expose more management context, but should remain clean and task-driven.
  - Patient screens should be especially simple, guided, and distraction-free.
- Do not collapse admin, clinician, and patient navigation into one undifferentiated experience.
