# Stella Reporting POC

## 1. Product Overview

### Product Name
**Stella**

### Purpose
Build a polished proof-of-concept React application for clinicians or administrators to review patients and longitudinal performance data captured from Stella therapy keyboard exercises.

This POC is focused on **reporting and patient review**, not running the therapy exercises themselves.

The application should behave as a clean **single-page application** with only three primary views:

1. **Patient List**
2. **Patient Summary**
3. **Exercise Details**

The user should move naturally from broad program information to patient-level information and finally exercise-specific longitudinal data.

The primary interaction flow is:

```text
Patient List
     ↓
Patient Summary
     ↓
Exercise Details
```

There should be **no sidebar navigation**.

---

# 2. Core Product Objectives

The POC should allow a clinician to:

1. View total patients and session activity.
2. Search and browse patients.
3. Add a new patient.
4. Open a patient record.
5. Review high-level patient activity.
6. See which Stella exercises that patient has performed.
7. See session counts and high-level results by exercise.
8. Open an exercise.
9. Review performance trends over time.
10. Review all sessions for that exercise.
11. Inspect detailed values directly from the exercise sessions table.

The experience should feel:

- professional
- clinical
- modern
- calm
- data-focused
- easy to scan

It should not feel like:

- a gaming interface
- a children's application
- a generic admin template
- an Excel spreadsheet
- a highly complex analytics platform

---

# 3. Technology Stack

Use:

## Core

- Vite
- React
- TypeScript
- React Router
- Tailwind CSS
- shadcn/ui

## Data

- TanStack Query
- TanStack Table
- Zod

## Visualization

- Recharts
- shadcn Chart components where appropriate

## Utilities

Recommended:

- date-fns
- Lucide React
- shadcn `cn()` utility

Do not add:

- Redux
- Material UI
- Ant Design
- Bootstrap
- AG Grid

The POC does not require those dependencies.

---

# 4. Application Structure

This should be a true SPA-style interface.

Use one lightweight global shell:

```text
┌──────────────────────────────────────────────────────────────┐
│ Stella                                      Clinician / User │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                      CURRENT VIEW                            │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

The global header should remain minimal.

### Header left

Display:

**Stella**

Optional small subtitle:

**Patient Reporting**

Clicking the Stella logo/name returns to the Patient List.

### Header right

For the POC:

- user avatar or initials
- optional user name

Do not build user-management functionality.

---

# 5. Routes

Use:

```text
/
    Patient List

/patients/:patientId
    Patient Summary

/patients/:patientId/exercises/:exerciseType
    Exercise Details
```

These are the only three main application views.

Do not create separate:

- dashboard
- reports section
- session details route
- settings page

for this POC.

---

# 6. Navigation Model

Navigation happens primarily through content.

### Patient List

Click patient row:

```text
Patient List
    ↓
Patient Summary
```

### Patient Summary

Click exercise row:

```text
Patient Summary
    ↓
Exercise Details
```

### Exercise Details

Use breadcrumb/back navigation:

```text
Patients / Maria Sanchez / Letter Target
```

Clicking:

**Maria Sanchez**

returns to Patient Summary.

Clicking:

**Patients**

returns to Patient List.

This should feel like drilling into increasingly detailed reporting rather than navigating between application modules.

---

# 7. View One — Patient List

Route:

```text
/
```

This is both the landing page and high-level application dashboard.

---

# 8. Patient List Header

Use a page header:

```text
Patients

Review Stella patient activity and exercise performance.
```

Right side:

```text
+ Add Patient
```

Use a shadcn Button.

Keep the heading area clean and spacious.

---

# 9. High-Level Metrics

At the top of the Patient List page display a compact metric row.

Use four cards:

### Total Patients

Example:

```text
24
```

### Total Sessions

Example:

```text
318
```

### Sessions This Month

Example:

```text
42
```

### Active Patients

Example:

```text
17
```

For POC purposes:

> Active Patient = patient with at least one recorded Stella session during the previous 30 days.

These are operational statistics, not clinical metrics.

Cards should be restrained and relatively compact.

Example:

```text
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ TOTAL PATIENTS   │ │ TOTAL SESSIONS   │ │ THIS MONTH       │ │ ACTIVE PATIENTS  │
│                  │ │                  │ │                  │ │                  │
│ 24               │ │ 318              │ │ 42               │ │ 17               │
└──────────────────┘ └──────────────────┘ └──────────────────┘ └──────────────────┘
```

Do not use giant numbers or decorative charts here.

---

# 10. Patient Table

Directly underneath the metric cards display:

## Patients

Place search on the left.

Place Add Patient on the right if desired in addition to the page header action.

Example:

```text
Patients

[ Search patients... ]                          [+ Add Patient]
```

Use **TanStack Table**.

Columns:

| Column | Purpose |
|---|---|
| Patient | Patient name |
| Patient ID | Human-readable identifier |
| Sessions | Total recorded sessions |
| Exercises | Unique exercise types |
| Last Session | Most recent session |
| Status | Active / Inactive |
| | Navigation chevron |

Example:

```text
Patient             Patient ID    Sessions    Exercises    Last Session     Status
─────────────────────────────────────────────────────────────────────────────────
Maria Sanchez       P-1021           28           4        Sep 10, 2026     Active     >
Daniel Brooks       P-1022           17           3        Sep 8, 2026      Active     >
Emily Carter        P-1023           11           2        Aug 20, 2026     Inactive   >
```

The entire row should be clickable.

---

# 11. Patient Table Behavior

Implement:

- search
- sorting
- pagination
- page-size selector

Optional:

- Active / Inactive filter

Do not implement complicated report-builder filters.

Use approximately:

```text
10 rows per page
```

as default.

---

# 12. Add Patient

Clicking:

```text
+ Add Patient
```

opens a shadcn Dialog.

Fields:

- First Name
- Last Name
- Patient ID
- Notes — optional

Validate using Zod.

Example schema:

```ts
const patientSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  patientCode: z.string().min(1),
  notes: z.string().optional(),
})
```

For the POC:

- use localStorage or mock repository persistence
- create with a TanStack Query mutation
- invalidate patient queries after success
- display a toast

Do not require a real backend.

---

# 13. View Two — Patient Summary

Route:

```text
/patients/:patientId
```

This page answers:

> What activity has this patient completed, and what does their Stella performance look like at a high level?

---

# 14. Patient Summary Header

Display breadcrumb:

```text
Patients / Maria Sanchez
```

Below:

```text
Maria Sanchez

Patient ID P-1021
```

Optional supporting line:

```text
28 sessions • Last session Sep 10, 2026
```

Do not create a large patient-profile interface.

This is a reporting page.

---

# 15. Patient Summary Metrics

Display four summary cards.

### Total Sessions

Example:

```text
28
```

### Exercises

Example:

```text
4
```

### First Session

Example:

```text
Jun 12, 2026
```

### Last Session

Example:

```text
Sep 10, 2026
```

Do not create a single universal clinical performance score.

The Stella data model defines different performance metrics depending on the exercise rather than one universal metric.

---

# 16. Optional Patient Summary Narrative

Immediately below the summary cards, optionally include a small neutral summary.

Example:

```text
Maria has completed 28 Stella sessions across four exercise types since June 12, 2026.
The most recent session was Letter Target on September 10, 2026.
```

This is descriptive only.

Do not generate interpretations such as:

- improving
- declining
- good
- poor
- progressing clinically

unless objectively describing a displayed measured trend.

---

# 17. Patient Exercise Table

The primary component on this page is:

## Exercises

Use TanStack Table.

There should be one row for each exercise used by the patient.

The five Stella exercise types are:

- Letter Target
- Letter Find
- Eye Pong
- Inhibition Challenge
- Motor Sequence Builder

These exercises have different task structures and therefore should retain exercise-specific reporting metrics.

---

# 18. Exercise Summary Table

Suggested structure:

| Exercise | Sessions | Last Session | Performance | Response / Secondary |
|---|---:|---|---|---|

Example:

```text
Exercise                  Sessions   Last Session    Performance          Secondary
──────────────────────────────────────────────────────────────────────────────────────
Letter Target                 9      Sep 10          88% first attempt    820 ms
Letter Find                   7      Sep 7           82% first attempt    960 ms
Eye Pong                      4      Aug 30          100% completion      48 changes
Inhibition Challenge          5      Sep 5           91% Go accuracy      87% No-Go
Motor Sequence Builder        3      Aug 28          83% completion       Longest 5
```

Add a chevron at the end of each row.

Entire row should navigate.

---

# 19. Exercise Summary Metrics Must Be Exercise-Specific

Do not force every exercise into the same metric labels.

Use an exercise definition registry.

Example:

```ts
type MetricDefinition = {
  key: string
  label: string
  shortLabel?: string
  format:
    | "percent"
    | "milliseconds"
    | "count"
    | "duration"
    | "text"
}

type ExerciseDefinition = {
  id: ExerciseType
  label: string
  description: string

  patientSummaryMetrics: MetricDefinition[]
  detailMetrics: MetricDefinition[]
  chartMetrics: MetricDefinition[]
  tableColumns: MetricDefinition[]
}
```

---

# 20. Patient Summary Exercise Rows

### Letter Target

High-level display:

```text
First-Attempt Accuracy
Mean Correct Latency
```

### Letter Find

High-level display:

```text
First-Attempt Accuracy
Mean Correct Latency
```

### Eye Pong

High-level display:

```text
Completion Rate
Target Changes
```

### Inhibition Challenge

High-level display:

```text
Go Accuracy
No-Go Inhibition Accuracy
```

### Motor Sequence Builder

High-level display:

```text
Sequence Completion Rate
Longest Completed Sequence
```

---

# 21. View Three — Exercise Details

Route:

```text
/patients/:patientId/exercises/:exerciseType
```

Example:

```text
/patients/P-1021/exercises/letter-target
```

This is the deepest reporting view in the POC.

There is **no separate session details page**.

All useful session information should be accessible directly from this view.

---

# 22. Exercise Details Header

Breadcrumb:

```text
Patients / Maria Sanchez / Letter Target
```

Page title:

```text
Letter Target
```

Supporting information:

```text
Maria Sanchez

9 sessions • Jun 12 – Sep 10, 2026
```

Optionally show a short activity description.

Example:

> Visual-guided intentional target selection.

---

# 23. Exercise Metric Cards

Directly under the header show approximately four aggregate cards.

Example for Letter Target:

```text
Sessions
9

Avg First-Attempt Accuracy
86%

Avg Correct Response
842 ms

Avg Incorrect Attempts
1.3
```

These values should be calculated from the patient's sessions for the selected exercise.

---

# 24. Letter Target Metrics

The source model identifies core Letter Target reporting fields including:

- items completed
- total attempts
- correct hits
- accuracy
- first-attempt success rate
- mean correct latency
- incorrect attempts

Additional optional metrics include:

- on-beat accuracy
- timing variability
- directional consistency
- engagement time



---

# 25. Performance Trend Section

Below the cards create:

## Performance Over Time

Supporting copy:

> Session-level measured performance over time.

Use Recharts.

Prefer two charts.

Example for Letter Target:

### First-Attempt Accuracy

```text
100 ┤
 90 ┤                       ●
 80 ┤        ●    ●    ●
 70 ┤ ●
    └────────────────────────────
       Jun   Jul   Aug   Sep
```

### Correct Response Latency

```text
1100 ┤ ●
1000 ┤       ●
 900 ┤            ●
 800 ┤                  ●    ●
     └────────────────────────────
        Jun   Jul   Aug   Sep
```

Do not combine these onto two Y axes.

---

# 26. Chart Behavior

Each point represents one session.

Tooltip should display:

```text
Sep 10, 2026

First-Attempt Accuracy
90%

Mean Correct Latency
782 ms
```

Use:

- ResponsiveContainer
- LineChart
- CartesianGrid
- XAxis
- YAxis
- Tooltip
- Line

Keep styling minimal.

No:

- 3D charts
- gradients
- oversized legends
- heavy animation
- gauge charts

---

# 27. Performance Trend Terminology

Use:

```text
Performance Over Time
```

or:

```text
Session Performance Trend
```

Do not label the chart:

```text
Clinical Improvement
Recovery
Motor Improvement
Therapy Progress
```

unless those measures are validated in future versions.

The functional requirements explicitly specify that cross-session comparisons should be labeled as performance trends rather than clinical outcomes.

---

# 28. Exercise Sessions Table

Below charts display:

## Sessions

This table contains all individual sessions for the selected exercise.

Use TanStack Table.

Rows should not navigate to another page.

Instead, the user should be able to inspect the important session metrics directly.

---

# 29. Letter Target Session Table

Recommended columns:

| Date | Status | Mode | Completed | Accuracy | First Attempt | Avg Latency | Errors |
|---|---|---|---|---|---|---|---|

Example:

```text
Date        Status       Mode      Completed   Accuracy   First Attempt   Avg Latency   Errors
──────────────────────────────────────────────────────────────────────────────────────────────
Sep 10      Completed    Words       10/10       91%          90%          782 ms        1
Sep 03      Completed    Words       10/10       88%          80%          810 ms        2
Aug 27      Completed    Letters     15/15       84%          80%          902 ms        3
```

---

# 30. Expandable Session Rows

Because there is no fourth view, session rows can optionally expand.

Clicking a session row can reveal a compact detail panel underneath.

Example:

```text
Sep 10      Completed    Words   10/10   91%   90%   782ms   1

    Configuration
    ─────────────────────────────
    Content             Words
    Word Length         5–10
    Audio               Metronome
    Tempo               72 BPM

    Additional Results
    ─────────────────────────────
    Total Attempts      11
    Correct Hits        10
    On-Beat Accuracy    83%
    Timing Variability  121 ms
```

Use a shadcn Collapsible or table-row expansion pattern.

This keeps the application limited to three views while still giving access to detailed session values.

---

# 31. Conditional Session Data

Only show fields that apply.

For example:

`wordLength`

only appears when:

```ts
contentMode === "words"
```

`tempoBpm`

only appears when:

```ts
audioMode !== "silent"
```

The supplied reporting specification defines these conditional fields explicitly.

---

# 32. Letter Find Exercise Details

Charts:

1. First-Attempt Accuracy
2. Mean Correct Latency

Table columns:

```text
Date
Status
Content Mode
Completed
Accuracy
First Attempt
Mean Correct Latency
Incorrect Attempts
```

Letter Find remains separate from Letter Target because it uses audio-guided search rather than advance visual indication of the target.

---

# 33. Eye Pong Exercise Details

Aggregate cards:

```text
Sessions
Average Completion Rate
Average Target Changes
Average Session Duration
```

Charts could include:

```text
Completion Rate
Target Changes / Duration
```

Table columns:

```text
Date
Status
Pattern
Target Changes
Completion Rate
Audio
Tempo
Duration
```

Do not report:

- eye-movement accuracy
- gaze accuracy
- saccadic performance

The current prototype has no objective eye-tracking capability.

---

# 34. Inhibition Challenge Exercise Details

Aggregate cards:

```text
Sessions
Average Go Accuracy
Average No-Go Accuracy
Mean Go Latency
```

Charts:

1. Go Accuracy and/or No-Go Accuracy
2. Mean Go Latency

If displaying Go and No-Go accuracy on one chart, both share the same percentage scale and can reasonably appear as two series.

Table columns:

```text
Date
Status
Trials
Rule Preset
Go Accuracy
No-Go Accuracy
Missed Go Rate
Mean Go Latency
```

A configured response window is required for determining successful inhibition in this exercise.

---

# 35. Motor Sequence Builder Exercise Details

Aggregate cards:

```text
Sessions
Sequence Completion
First-Attempt Sequence Accuracy
Longest Completed Sequence
```

Charts:

1. Sequence Completion Rate
2. Mean Completion Time

Table columns:

```text
Date
Status
Content Type
Sequence Length
Completion Rate
First Attempt
Longest Sequence
Mean Completion Time
```

The reporting model identifies these as core Motor Sequence Builder measures.

---

# 36. Overall Page Layout

Use a centered content container.

Recommended:

```css
max-width: 1440px;
margin: 0 auto;
padding: 32px;
```

Exercise Details can use slightly more width because of tables.

---

# 37. Visual Design

Target the visual quality of modern healthcare SaaS software.

Design principles:

### Neutral foundation

Use:

- white
- off-white
- neutral gray
- dark slate text

### Accent

Choose one restrained primary accent.

Recommended:

- blue
- blue-indigo
- muted teal-blue

Do not create multiple competing brand colors.

---

# 38. Cards

Cards should have:

- subtle border
- light background
- 8–12px radius
- minimal or no shadow

Avoid floating card-heavy layouts.

Use cards primarily for:

- metric groups
- charts
- important summaries

Tables can sit inside a bordered container.

---

# 39. Typography

Use a modern sans-serif.

Default application typography from shadcn is acceptable.

Suggested hierarchy:

```text
Page title:
28–32px / semibold

Section title:
18–20px / semibold

Metric:
26–30px / semibold

Body:
14–16px

Supporting:
13–14px muted
```

Avoid overly large dashboard typography.

---

# 40. Table Styling

Tables should feel like application reporting tables.

Use:

- muted header
- horizontal row dividers
- approximately 52px row height
- generous cell padding
- tabular numbers
- medium-weight primary column
- hover background

Do not use heavy vertical borders.

---

# 41. Status Badges

Use shadcn Badge.

Examples:

```text
Completed
Ended Early

Active
Inactive
```

Use color sparingly.

Do not use performance badges such as:

```text
Excellent
Poor
Needs Improvement
```

---

# 42. Responsive Behavior

Primary target:

```text
1280px+
```

The application should remain usable at:

```text
768px+
```

On narrower screens:

- metric cards can wrap 2 × 2
- tables may horizontally scroll
- header controls can wrap

Mobile optimization is not required for POC.

---

# 43. Domain Data Model

Use a normalized frontend model.

## Patient

```ts
export interface Patient {
  id: string
  patientCode: string
  firstName: string
  lastName: string
  createdAt: string
  notes?: string
}
```

---

# 44. Exercise Type

```ts
export type ExerciseType =
  | "letter-target"
  | "letter-find"
  | "eye-pong"
  | "inhibition-challenge"
  | "motor-sequence-builder"
```

---

# 45. Base Session

```ts
export interface BaseSession {
  sessionId: string
  patientId: string

  activity: ExerciseType

  sessionDate: string

  status:
    | "completed"
    | "ended-early"

  summary: string

  activeEngagementTimeMinutes?: number
  totalSessionDurationMinutes?: number

  attemptsPerMinute?: number
  pauseBreakCount?: number
}
```

The supplied model defines session ID, patient ID, activity, session date, status and summary as common session-level fields.

---

# 46. Discriminated Session Union

Use:

```ts
export type ExerciseSession =
  | LetterTargetSession
  | LetterFindSession
  | EyePongSession
  | InhibitionChallengeSession
  | MotorSequenceBuilderSession
```

Do not create one interface with dozens of optional fields.

---

# 47. Letter Target Example

```ts
export interface LetterTargetSession extends BaseSession {
  activity: "letter-target"

  contentMode:
    | "letters"
    | "words"

  itemsPerSession: number

  wordLength?:
    | "0-5"
    | "5-10"
    | "10+"

  audioMode:
    | "silent"
    | "metronome"
    | "music"

  tempoBpm?: number

  itemsCompleted: number
  itemsTotal: number

  totalAttempts: number
  correctHits: number

  accuracyPercent: number

  firstAttemptSuccessRatePercent: number

  meanCorrectLatencyMs: number

  incorrectAttempts: number

  latencyVariabilityStdDev?: number

  onBeatAccuracyPercent?: number

  timingVariabilityStdDev?: number

  directionalConsistencyPercent?: number
}
```

This mirrors the supplied Letter Target session-level data structure.

---

# 48. Exercise Registry

Create:

```text
src/config/exercises.ts
```

This is one of the most important implementation decisions.

Example:

```ts
export const exerciseDefinitions = {
  "letter-target": {
    label: "Letter Target",

    description:
      "Visual-guided intentional target selection.",

    patientSummary: [
      {
        key: "firstAttemptSuccessRatePercent",
        label: "First Attempt",
        format: "percent",
      },
      {
        key: "meanCorrectLatencyMs",
        label: "Response",
        format: "milliseconds",
      },
    ],

    summaryCards: [
      {
        key: "sessionCount",
        label: "Sessions",
      },
      {
        key: "firstAttemptSuccessRatePercent",
        label: "Avg First-Attempt Accuracy",
        format: "percent",
      },
      {
        key: "meanCorrectLatencyMs",
        label: "Avg Correct Response",
        format: "milliseconds",
      },
      {
        key: "incorrectAttempts",
        label: "Avg Incorrect Attempts",
        format: "decimal",
      },
    ],

    charts: [
      {
        key: "firstAttemptSuccessRatePercent",
        label: "First-Attempt Accuracy",
        format: "percent",
      },
      {
        key: "meanCorrectLatencyMs",
        label: "Correct Response Latency",
        format: "milliseconds",
      },
    ],
  },
}
```

Pages should pull labels and display configuration from this registry rather than containing repeated exercise-specific switch statements.

---

# 49. Mock API Layer

Do not directly import seed arrays into pages.

Create:

```text
src/api/
```

Methods:

```ts
getPatients()

getPatient(patientId)

createPatient(input)

getPatientSessions(patientId)

getExerciseSessions(
  patientId,
  exerciseType
)

getDashboardStats()
```

All functions return Promises.

Simulate network latency:

```ts
await delay(200)
```

This allows TanStack Query to be implemented as it would be with a real backend.

---

# 50. TanStack Query Hooks

Create hooks such as:

```ts
usePatients()

usePatient(patientId)

usePatientSessions(patientId)

useExerciseSessions(
  patientId,
  exerciseType
)

useDashboardStats()
```

Suggested keys:

```ts
["patients"]

["patient", patientId]

["patientSessions", patientId]

[
  "exerciseSessions",
  patientId,
  exerciseType
]

["dashboardStats"]
```

---

# 51. TanStack Table Usage

Use TanStack Table for:

### View 1

Patient table.

### View 2

Exercise summary table.

### View 3

Exercise session table.

Create reusable table helpers where sensible.

Do not try to build one single generic component capable of representing every table in the entire app if that makes the API overly complicated.

---

# 52. Seed Data

Generate deterministic realistic demo data.

Minimum:

```text
15 patients
```

Each patient:

```text
2–5 exercise types

5–25 total sessions
```

Create at least three rich demo patients.

One should serve as the primary demonstration record.

Example:

```text
Maria Sanchez

28 sessions

Letter Target
Letter Find
Inhibition Challenge
Motor Sequence Builder
```

Give this patient approximately three months of data.

---

# 53. Realistic Trends

Do not generate perfectly linear improvement.

Bad:

```text
70
72
74
76
78
80
82
84
```

Better:

```text
76
82
79
85
83
88
86
91
```

Response times should similarly fluctuate.

Example:

```text
1100
1030
1075
965
990
910
875
```

---

# 54. Seed Data Variation

Include:

- completed sessions
- occasional ended-early sessions
- letters mode
- words mode
- silent audio
- music
- metronome
- different tempos
- missing optional metrics

Optional metrics must be undefined rather than fake zero values.

---

# 55. Raw Event Future Compatibility

The source requirements recommend preserving raw events wherever possible because summary metrics can be recalculated later, while missing events cannot be reconstructed.

You may define:

```ts
export interface AttemptEvent {
  id: string
  sessionId: string

  itemIndex?: number
  trialIndex?: number

  expectedTarget?: string
  pressedKey?: string

  correct?: boolean

  goTimestamp?: string
  keypressTimestamp?: string

  firstResponseLatencyMs?: number
  correctResponseLatencyMs?: number

  beatTimestamp?: string
  beatOffsetMs?: number

  sequenceId?: string
}
```

Do not build an event-log UI for the POC.

---

# 56. Project Structure

Recommended:

```text
src/
│
├── api/
│   ├── patients.ts
│   ├── sessions.ts
│   └── delay.ts
│
├── components/
│   │
│   ├── app-header.tsx
│   ├── page-header.tsx
│   ├── breadcrumb-nav.tsx
│   │
│   ├── metrics/
│   │   ├── metric-card.tsx
│   │   └── metric-grid.tsx
│   │
│   ├── patients/
│   │   ├── patient-table.tsx
│   │   └── add-patient-dialog.tsx
│   │
│   ├── exercises/
│   │   ├── exercise-summary-table.tsx
│   │   ├── session-table.tsx
│   │   ├── session-row-detail.tsx
│   │   └── performance-chart.tsx
│   │
│   └── ui/
│       └── shadcn
│
├── config/
│   └── exercises.ts
│
├── data/
│   └── seed.ts
│
├── lib/
│   ├── aggregations.ts
│   ├── formatters.ts
│   └── utils.ts
│
├── pages/
│   ├── patient-list-page.tsx
│   ├── patient-summary-page.tsx
│   └── exercise-detail-page.tsx
│
├── queries/
│   ├── patients.ts
│   └── sessions.ts
│
├── schemas/
│   └── patient.ts
│
├── types/
│   ├── patient.ts
│   └── sessions.ts
│
├── router.tsx
├── app.tsx
└── main.tsx
```

---

# 57. Formatting Utilities

Create centralized utilities.

```ts
formatPercent(86.4)
// 86%

formatMilliseconds(842)
// 842 ms

formatDuration(7.4)
// 7.4 min

formatDate(date)
// Sep 10, 2026
```

Do not repeat formatting logic inside cells or page components.

---

# 58. Loading States

Every view should have:

- loading state
- loaded state
- empty state
- not-found state

Use shadcn Skeleton.

Avoid full-screen spinners.

---

# 59. Patient Empty State

Example:

```text
No patients yet

Add your first patient to begin viewing Stella session data.

[ Add Patient ]
```

---

# 60. Patient Session Empty State

Example:

```text
No Stella sessions yet

Exercise activity will appear here once this patient completes a session.
```

---

# 61. Exercise Empty State

Example:

```text
No Letter Target sessions

No Letter Target activity has been recorded for this patient.
```

---

# 62. Accessibility

Implement:

- semantic HTML
- visible keyboard focus
- accessible Dialog
- keyboard-operable table rows
- sufficient contrast
- chart tooltips
- table representation of chart data
- no reliance on color alone

---

# 63. Reporting Guardrails

The interface should display objective measured behavior.

Appropriate statements include:

```text
First-attempt accuracy increased across recent sessions.

Average correct-response latency was lower in the most recent sessions.

The patient made fewer detectable incorrect selections.
```

Avoid unsupported clinical interpretations such as:

```text
Motor control improved.

Communication ability improved.

Therapy is working.

The patient is recovering.
```

The supplied requirements specifically instruct reporting to use objective measures and note that current accuracy only reflects detectable functioning-key presses.

---

# 64. Three-View Visual Flow

## View 1 — Patient List

```text
┌────────────────────────────────────────────────────────────────┐
│ Stella                                             JD          │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│ Patients                                      + Add Patient    │
│ Review Stella patient activity.                               │
│                                                                │
│ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐   │
│ │ Patients   │ │ Sessions   │ │ This Month │ │ Active     │   │
│ │ 24         │ │ 318        │ │ 42         │ │ 17         │   │
│ └────────────┘ └────────────┘ └────────────┘ └────────────┘   │
│                                                                │
│ Patients                                                       │
│ [ Search patients... ]                                         │
│                                                                │
│ Maria Sanchez     P-1021     28     4     Sep 10    Active  > │
│ Daniel Brooks     P-1022     17     3     Sep 08    Active  > │
│ Emily Carter      P-1023     11     2     Aug 20    Inactive> │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

# 65. View 2 — Patient Summary

```text
┌────────────────────────────────────────────────────────────────┐
│ Stella                                             JD          │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│ Patients / Maria Sanchez                                       │
│                                                                │
│ Maria Sanchez                                                  │
│ Patient ID P-1021                                              │
│                                                                │
│ ┌───────────┐ ┌───────────┐ ┌─────────────┐ ┌─────────────┐  │
│ │ Sessions  │ │ Exercises │ │ First       │ │ Last        │  │
│ │ 28        │ │ 4         │ │ Jun 12      │ │ Sep 10      │  │
│ └───────────┘ └───────────┘ └─────────────┘ └─────────────┘  │
│                                                                │
│ Exercises                                                      │
│                                                                │
│ Letter Target        9    Sep 10    88% first    820 ms      > │
│ Letter Find          7    Sep 07    82% first    960 ms      > │
│ Inhibition           5    Sep 05    91% Go       87% No-Go   > │
│ Motor Sequence       3    Aug 28    83% complete Longest 5   > │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

# 66. View 3 — Exercise Details

```text
┌────────────────────────────────────────────────────────────────┐
│ Stella                                             JD          │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│ Patients / Maria Sanchez / Letter Target                       │
│                                                                │
│ Letter Target                                                  │
│ Maria Sanchez • 9 sessions                                     │
│                                                                │
│ ┌────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐  │
│ │Sessions│ │ First Attempt│ │ Avg Response │ │ Avg Errors │  │
│ │ 9      │ │ 86%          │ │ 842 ms       │ │ 1.3        │  │
│ └────────┘ └──────────────┘ └──────────────┘ └────────────┘  │
│                                                                │
│ Performance Over Time                                          │
│                                                                │
│ ┌──────────────────────────────────────────────────────────┐   │
│ │ First-Attempt Accuracy                                  │   │
│ │                      ●                 ●                 │   │
│ │            ●    ●          ●                             │   │
│ └──────────────────────────────────────────────────────────┘   │
│                                                                │
│ ┌──────────────────────────────────────────────────────────┐   │
│ │ Correct Response Latency                                │   │
│ │ ●       ●                                               │   │
│ │              ●          ●         ●                     │   │
│ └──────────────────────────────────────────────────────────┘   │
│                                                                │
│ Sessions                                                       │
│ Sep 10   Completed  Words   10/10   91%   90%   782 ms   1  │
│ Sep 03   Completed  Words   10/10   88%   80%   810 ms   2  │
│ Aug 27   Completed  Letters 15/15   84%   80%   902 ms   3  │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

# 67. POC Demonstration Flow

The main demo should be:

```text
Patient List

↓ Select Maria Sanchez

Patient Summary

↓ Select Letter Target

Exercise Details

↓ Review metrics

↓ Review performance charts

↓ Expand one session row
```

That is the complete core product journey.

It should feel finished before adding any additional screens.

---

# 68. POC Non-Goals

Do not implement:

- sidebar
- dashboard as a separate view
- individual session page
- separate reports module
- keyboard hardware communication
- exercise runtime
- audio prompts
- authentication
- clinician administration
- roles and permissions
- production database
- billing
- messaging
- scheduling
- predictive analytics
- clinical diagnosis
- objective Eye Pong tracking
- AI-generated clinical recommendations

---

# 69. Development Sequence

Build in this order.

### Phase 1

Project setup and dependencies.

### Phase 2

Domain TypeScript models.

### Phase 3

Exercise configuration registry.

### Phase 4

Seed data.

### Phase 5

Mock API/repository.

### Phase 6

TanStack Query hooks.

### Phase 7

Global header and page layout.

### Phase 8

Patient List.

Get this page polished before proceeding.

### Phase 9

Patient Summary.

### Phase 10

Exercise Details.

### Phase 11

Charts.

### Phase 12

Expandable session details.

### Phase 13

Visual polish, loading, empty and error states.

---

# 70. Code Quality Requirements

Prefer:

- small typed components
- reusable metric components
- reusable chart components
- centralized exercise configuration
- centralized formatting
- TanStack Query for async state
- TanStack Table for all three reporting tables
- discriminated unions
- derived aggregation functions

Avoid:

- broad `any`
- huge page components
- duplicated metric labels
- duplicated switch statements
- direct seed-data imports inside pages
- calculations scattered throughout JSX
- storing values that can easily be derived

---

# 71. Success Criteria

The POC is successful when a new user can understand the application immediately without explanation.

The hierarchy should be obvious:

```text
All Patients
     ↓
One Patient
     ↓
One Exercise
     ↓
Sessions + Trends
```

The result should look like a professional Stella product rather than a developer dashboard.

The interface should demonstrate that the underlying exercise data can support clear longitudinal performance reporting while remaining flexible enough for additional Stella exercises and metrics in future iterations.