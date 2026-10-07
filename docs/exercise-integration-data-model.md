# Stella Exercise Integration Data Model

Status: proposed contract, 2026-09-27. This document specifies an API boundary and data model; it does not describe an existing keyboard API. It covers all five exercises, including Inhibition Challenge and Motor Sequence Builder even when a particular keyboard does not support them.

## 1. Source review and decisions

Sources: [exercise-data-model.md](./exercise-data-model.md), [data-samples.xlsx](./data-samples.xlsx), [functional requirements](./Stella_Prototype_Exercise_Functional_Requirements_v1.md), [session table template](./exercise-session-table-template.md), [Stella types](../stella/src/types.ts), [exercise setup types](../stella/src/types/exercise-control.ts), [exercise reporting metadata](../stella/src/config/exercises.ts), [local/remote session API](../stella/src/api/stella.ts), [hosted session handler](../infra/lambda/app-handler.js), and [CDK stack](../infra/lib/stellaportal-stack.ts).

The workbook contains a Codebook and two populated examples for each exercise. Its rows are illustrative summaries, not measured raw runs. It contains no formulas or raw keypress records. The reference model likewise mixes session metrics with values that occur once per attempt, such as `beatTimestamp`. Neither is sufficient as a wire contract.

| Source issue | Evidence | Contract decision |
|---|---|---|
| Letter-only sessions have word-length values. | `Letter Target!G4`, `Letter Find!G5` | Word length applies only to word runs. |
| An item is sometimes treated as a whole word and sometimes as one correct keypress. | `Letter Find!F4=4`, `K4=9`; model says `correctHits` mirrors `itemsCompleted`. | Separate configured items, started items, completed items, target trials, and presses. One word can contain many correct target trials. |
| Some rates cannot be reproduced from the stated counts. | `Motor Sequence!G4=5`, `J4=88%`; `Letter Find!F5=6`, `M5=78%` if prompts are the denominator. | Persist integer numerators and denominators alongside calculated percentages. Do not import these examples as measured results. |
| Directional rates cannot be audited from aggregate errors. | `Letter Target!J5=7`, `K5=4`, `S5=25%`; three incorrect presses cannot yield a 25% dominant direction share. | Directional metrics remain unavailable until per-press key identity and a validated spatial rule are present. |
| Eye Pong examples imply patient timing performance. | `Eye Pong!N4:O5`; requirements section 5.3 says no eye movement is measured. | Report delivered target transitions and program completion only. Do not chart on-beat "accuracy" as patient performance. |
| Audio fields conflict. | Workbook has music BPM, while Stella configures music by `musicPlaybackRate`; model implies a beat for every music run. | Metronome has BPM. Music has track ID and playback rate. Rhythm metrics require actual beat timestamps. |
| Historical/session shapes differ. | Model uses display names as `activity`; Stella and DynamoDB use slugs. Eye Pong model `pattern` is Stella `mode`; Inhibition metric names differ. | Use Stella exercise slugs as wire discriminants and a versioned reporting projection. Keep legacy summaries readable. |

In the current app, Start advances a ten-second simulator, and `saveExerciseRun` constructs approximate summary values from `completedUnits` and elapsed seconds. The hosted `POST /sessions` repeats this calculation and stores one item keyed by `patientId` and `sessionKey`; `rawEventPayload` is `null`. The patient exercise pages and analysis endpoints read flat session fields. The integration must replace the simulated save input without breaking those read routes.

## 2. Canonical boundaries and vocabulary

The clinician chooses exact letters, words, or sequences. Stella checks them against device capabilities and sends an immutable execution plan. The keyboard controls cues and measures time. It returns a timestamped record plus advisory totals. Stella derives session values from that record, associates them with a patient, and uploads them to AWS. The device receives no patient name, code, or ID.

| Layer | Owner | Contents |
|---|---|---|
| Device capability | Keyboard | Functioning keys and positions, supported exercises, firmware/contract versions, and setting limits. |
| Start request | Stella | Client-generated `runId`, exercise slug, configuration, and exact plan where applicable. |
| Accepted run | Keyboard | The accepted request, state, and progress. |
| Raw result | Keyboard | Observations, pauses, terminal reason, monotonic millisecond offsets, and advisory summary. |
| Report session | Stella/AWS | Patient link, immutable configuration snapshot, integer counts, computed metrics, provenance, and raw-result reference. |

An **item** is one requested letter or word. A **target trial** is one expected key; a word has one trial per letter. A **press** is one detectable functioning-key press, including an incorrect press. A **sequence** is one demonstrated/reproduced set of keys. A **transition** is one Eye Pong target illumination. A **cue trial** is one Go, No-Go, or Wait response window. "Configured" counts come from the accepted start plan; "started" counts come from observations; "completed" and "correct" counts come from observed outcomes. Store all three separately.

Use a UUID `runId` as the stable idempotency key and eventual `sessionId`. Use `schemaVersion: 1` on all requests and results, and the slugs `letter-target`, `letter-find`, `eye-pong`, `inhibition-challenge`, and `motor-sequence-builder`. Device event time is an integer `atMs >= 0` measured by its monotonic clock from run start; it must not be computed from HTTP arrival times. Stella records a UTC start anchor when the device accepts the run and derives completion UTC from that anchor plus `endedAtMs`. Record `clockSource: "stella-anchor"` so its wall-clock precision is not confused with device-measured latency.

On the wire, unavailable values are `null` or absent; measured zero is `0`. Percent values are on a 0-100 scale, rounded to one decimal only after calculating from counts. Durations/latencies are in milliseconds in the raw contract and report model; minutes are derived for the current UI. An empty denominator produces `null`, never `0%`.

## 3. Keyboard API

This is a transport-neutral HTTP-shaped contract. The deployment adapter must be validated separately for the hosted app and a clinic device. All mutations with the same `runId` and identical content are idempotent; reusing a `runId` with different content returns `409 run-conflict`.

| Operation | Success | Other results |
|---|---|---|
| `GET /device/capabilities` | `200` capability document | `503 device-unavailable` |
| `POST /runs` | `201` `{schemaVersion, runId, state:"running", acceptedRequest}`; identical retry returns `200` | `400 invalid-plan`, `409 run-conflict`, `422 unsupported-capability` |
| `GET /runs/{runId}` | `200` `{schemaVersion, runId, state, completedUnits, configuredUnits, acceptedRequest}` | `404 unknown-run` |
| `POST /runs/{runId}/stop` | `202` stop accepted; repeated stop returns same terminal/pending state | `404 unknown-run` |
| `GET /runs/{runId}/result` | `200` immutable terminal result | `404 unknown-run`, `409 run-not-finished` |

Errors use `{ "code": "...", "message": "..." }`. A run moves `running -> completed | ended-early | failed`. `failed` is an operational outcome, not a patient performance session; retain its raw diagnostic result separately. Stop during a trial preserves all observations already recorded. An accepted request is available from `GET /runs/{runId}` after a reconnect.

Example capability response (IDs and limits are illustrative):

```json
{
  "schemaVersion": 1,
  "deviceId": "keyboard-01",
  "firmwareVersion": "prototype",
  "supportedActivities": ["letter-target", "letter-find", "eye-pong", "inhibition-challenge", "motor-sequence-builder"],
  "keys": [
    {"keyId": "key-a", "letter": "A", "row": 2, "column": 1},
    {"keyId": "key-e", "letter": "E", "row": 1, "column": 3},
    {"keyId": "key-n", "letter": "N", "row": 3, "column": 6},
    {"keyId": "key-l", "letter": "L", "row": 2, "column": 9}
  ],
  "audio": {"modes": ["silent", "metronome", "music"], "metronomeBpm": {"min": 30, "max": 120}, "musicPlaybackRate": {"min": 0.5, "max": 2.0}, "tracks": [{"trackId": "track-1"}]},
  "limits": {"letterItems": 10, "eyePongTransitions": 100, "cueTrials": 100, "sequences": 20}
}
```

All key IDs in a plan must occur in this response. A device that lacks an exercise does not expose Start for it. Words and sequences must use functioning letters only. For v1, all words in a run share one nonoverlapping band: `1-5`, `6-10`, or `11+` letters; zero-length words and mixed-band runs are invalid. For Motor Sequence Builder, every sequence has the selected length. Stella prevents Start when no valid content has been selected. Existing `0-5`, `5-10`, and `10+` labels stay attached to legacy sessions; their overlapping boundaries must not be silently reinterpreted.

The audio object is exactly one of `{"mode":"silent"}`, `{"mode":"metronome","tempoBpm":54}`, or `{"mode":"music","trackId":"track-1","playbackRate":1.0}`. Spoken instructions and letter feedback remain enabled in every mode. A beat is measurable only when the result contains a timestamp for the beat nearest an action. The default on-beat window for measured actions is +/-150 ms; it is recorded as `onBeatWindowMs: 150` in the accepted configuration when beat analysis is enabled.

### Complete start requests

The clinician selects the exact text for the letter and sequence activities. `itemId`, `trialId`, and `sequenceId` are unique within a run. Stella maps each letter to the key ID in the accepted capability document.

Letter Target, one four-letter word:

```json
{
  "schemaVersion": 1, "runId": "00000000-0000-4000-8000-000000000001", "activity": "letter-target",
  "config": {"contentMode": "words", "itemsPerSession": 1, "wordLengthBand": "1-5", "audio": {"mode": "metronome", "tempoBpm": 54}, "timeoutMs": null, "onBeatWindowMs": 150},
  "plan": {"items": [{"itemId": "item-1", "text": "LANE", "keyIds": ["key-l", "key-a", "key-n", "key-e"]}]}
}
```

Letter Find, two single letters; unlike Letter Target, the expected key is not illuminated before the press:

```json
{
  "schemaVersion": 1, "runId": "00000000-0000-4000-8000-000000000002", "activity": "letter-find",
  "config": {"contentMode": "letters", "itemsPerSession": 2, "audio": {"mode": "silent"}, "timeoutMs": null},
  "plan": {"items": [{"itemId": "item-1", "text": "A", "keyIds": ["key-a"]}, {"itemId": "item-2", "text": "E", "keyIds": ["key-e"]}]}
}
```

Eye Pong, two left/right transitions. The two eligible IDs are ordered left to right. Random mode uses two or more eligible keys; the keyboard selects and records the realized sequence and avoids immediate repeats.

```json
{
  "schemaVersion": 1, "runId": "00000000-0000-4000-8000-000000000003", "activity": "eye-pong",
  "config": {"mode": "left-right", "targetChanges": 2, "intervalMs": 1000, "audio": {"mode": "silent"}},
  "plan": {"eligibleKeyIds": ["key-a", "key-l"]}
}
```

Inhibition Challenge. Stella expands the selected preset into the explicit trial plan; the keyboard does not infer the distribution. `cueSpeedBpm` specifies the gap *after* each response window (`60000 / cueSpeedBpm` ms), so a 1200 ms window and 68 BPM do not overlap. For a new run, Stella uses minimum 10 and maximum 100 trials; preset shares are balanced 50/25/25, go-heavy 70/15/15, and stop-heavy 30/50/20 for Go/No-Go/Wait. Allocate integer counts by largest remainder, breaking ties in that order, then shuffle and retain the final plan. The example has five Go, three No-Go, and two Wait trials.

```json
{
  "schemaVersion": 1, "runId": "00000000-0000-4000-8000-000000000004", "activity": "inhibition-challenge",
  "config": {"trialCount": 10, "rulePreset": "balanced", "responseWindowMs": 1200, "cueSpeedBpm": 68},
  "plan": {"trials": [
    {"trialId": "trial-1", "cue": "go", "targetKeyId": "key-a"},
    {"trialId": "trial-2", "cue": "no-go", "targetKeyId": "key-l"},
    {"trialId": "trial-3", "cue": "go", "targetKeyId": "key-e"},
    {"trialId": "trial-4", "cue": "wait", "targetKeyId": "key-n"},
    {"trialId": "trial-5", "cue": "go", "targetKeyId": "key-l"},
    {"trialId": "trial-6", "cue": "no-go", "targetKeyId": "key-a"},
    {"trialId": "trial-7", "cue": "go", "targetKeyId": "key-n"},
    {"trialId": "trial-8", "cue": "wait", "targetKeyId": "key-e"},
    {"trialId": "trial-9", "cue": "go", "targetKeyId": "key-a"},
    {"trialId": "trial-10", "cue": "no-go", "targetKeyId": "key-l"}
  ]}
}
```

Motor Sequence Builder, one prescribed sequence:

```json
{
  "schemaVersion": 1, "runId": "00000000-0000-4000-8000-000000000005", "activity": "motor-sequence-builder",
  "config": {"contentType": "letter-sequence", "sequenceLength": 3, "sequenceCount": 1, "presentationSpeedBpm": 72, "audio": {"mode": "silent"}},
  "plan": {"sequences": [{"sequenceId": "sequence-1", "text": "LAN", "keyIds": ["key-l", "key-a", "key-n"]}]}
}
```

For a real balanced Inhibition run, use at least ten trials as stated above. Setup validation also enforces the existing Letter Target/Find range of 1-10 items, response window 500-3000 ms, cue speed and presentation speed 30-120 BPM, sequence length 2-5, and sequence count 1-20. Eye Pong starts at the current app default of 20 transitions but exposes a configurable count (1-100) and interval (300-3000 ms). The accepted device limits may narrow these ranges.

## 4. Raw result contract

Every terminal result has `schemaVersion`, `runId`, `activity`, `state`, `endedAtMs`, `pauses`, `unassignedPresses`, one activity-specific `observations` object, and `deviceSummary`. `pauses` contains nonoverlapping `[startMs,endMs]` intervals. V1 has no Pause control, so this array is normally empty. `endedAtMs` is inclusive of pauses; active time is `endedAtMs - sum(pause duration)`. `deviceSummary` is advisory: if its counts disagree with observations, do not publish metrics until the discrepancy is resolved. Observations are ordered by their start offsets. Every detectable functioning-key press during a trial is retained in order, including incorrect presses. Presses outside a trial or reproduction phase are retained in `unassignedPresses` but excluded from scored `totalAttempts`; they cannot be classified as correct or incorrect. A press has `keyId`, `atMs`, and optional `nearestBeatAtMs`; an absent beat is not a measured zero offset.

For a letter trial, `readyAtMs` is the end of its spoken Go marker or, for a later letter in the same word, the point after prior-letter feedback when the next target becomes actionable. It is the latency origin. `cueShownAtMs` exists only in Letter Target. `outcome` is `correct`, `timeout`, or `stopped`; an incomplete trial is still retained. `itemCompletedAtMs` is present only after the final correct letter. A wrong press does not advance the expected target.

For an inhibition trial, `cueAtMs` starts the response window; `windowEndAtMs` closes it. `windowClosed` distinguishes a scored window from a clinician stop during the window. A Go trial succeeds on the first correct press in the window. No-Go and Wait succeed only if no press occurs during a closed window. Wait is reported separately from No-Go.

For Motor Sequence Builder, each `presentations` entry records a shown key and timestamp; `reproductionGoAtMs` is the response timing origin. Presses follow in order, and the expected position advances only after its correct key. `completedAtMs` exists only after the final correct key.

### Complete terminal result examples

Letter Target: one word, four correct target trials, one incorrect press. The device summary is deliberately limited to counts that Stella can verify.

```json
{
  "schemaVersion": 1, "runId": "00000000-0000-4000-8000-000000000001", "activity": "letter-target", "state": "completed", "endedAtMs": 3500, "pauses": [], "unassignedPresses": [],
  "observations": {"items": [{"itemId": "item-1", "text": "LANE", "startedAtMs": 0, "itemCompletedAtMs": 3200, "trials": [
    {"trialId": "item-1-step-1", "expectedKeyId": "key-l", "readyAtMs": 0, "cueShownAtMs": 0, "outcome": "correct", "presses": [{"keyId": "key-l", "atMs": 200, "nearestBeatAtMs": 0}]},
    {"trialId": "item-1-step-2", "expectedKeyId": "key-a", "readyAtMs": 1000, "cueShownAtMs": 1000, "outcome": "correct", "presses": [{"keyId": "key-e", "atMs": 1100, "nearestBeatAtMs": 1111}, {"keyId": "key-a", "atMs": 1200, "nearestBeatAtMs": 1111}]},
    {"trialId": "item-1-step-3", "expectedKeyId": "key-n", "readyAtMs": 2000, "cueShownAtMs": 2000, "outcome": "correct", "presses": [{"keyId": "key-n", "atMs": 2200, "nearestBeatAtMs": 2222}]},
    {"trialId": "item-1-step-4", "expectedKeyId": "key-e", "readyAtMs": 3000, "cueShownAtMs": 3000, "outcome": "correct", "presses": [{"keyId": "key-e", "atMs": 3200, "nearestBeatAtMs": 3333}]}
  ]}]},
  "deviceSummary": {"itemsCompleted": 1, "correctHits": 4, "totalAttempts": 5}
}
```

Letter Find: two letter items, one corrected error, with no visual target cue:

```json
{
  "schemaVersion": 1, "runId": "00000000-0000-4000-8000-000000000002", "activity": "letter-find", "state": "completed", "endedAtMs": 1500, "pauses": [], "unassignedPresses": [],
  "observations": {"items": [
    {"itemId": "item-1", "text": "A", "startedAtMs": 0, "itemCompletedAtMs": 250, "trials": [{"trialId": "item-1-step-1", "expectedKeyId": "key-a", "readyAtMs": 0, "outcome": "correct", "presses": [{"keyId": "key-a", "atMs": 250}]}]},
    {"itemId": "item-2", "text": "E", "startedAtMs": 1000, "itemCompletedAtMs": 1200, "trials": [{"trialId": "item-2-step-1", "expectedKeyId": "key-e", "readyAtMs": 1000, "outcome": "correct", "presses": [{"keyId": "key-l", "atMs": 1100}, {"keyId": "key-e", "atMs": 1200}]}]}
  ]},
  "deviceSummary": {"itemsCompleted": 2, "correctHits": 2, "totalAttempts": 3}
}
```

Eye Pong: only the programmed targets are observed, not a gaze response:

```json
{
  "schemaVersion": 1, "runId": "00000000-0000-4000-8000-000000000003", "activity": "eye-pong", "state": "completed", "endedAtMs": 2000, "pauses": [], "unassignedPresses": [],
  "observations": {"transitions": [{"index": 1, "targetKeyId": "key-a", "atMs": 0}, {"index": 2, "targetKeyId": "key-l", "atMs": 1000}]},
  "deviceSummary": {"targetChangesCompleted": 2}
}
```

Inhibition Challenge: five correct Go responses and five correctly withheld responses:

```json
{
  "schemaVersion": 1, "runId": "00000000-0000-4000-8000-000000000004", "activity": "inhibition-challenge", "state": "completed", "endedAtMs": 19938, "pauses": [], "unassignedPresses": [],
  "observations": {"trials": [
    {"trialId": "trial-1", "cue": "go", "targetKeyId": "key-a", "cueAtMs": 0, "windowEndAtMs": 1200, "windowClosed": true, "presses": [{"keyId": "key-a", "atMs": 300}]},
    {"trialId": "trial-2", "cue": "no-go", "targetKeyId": "key-l", "cueAtMs": 2082, "windowEndAtMs": 3282, "windowClosed": true, "presses": []},
    {"trialId": "trial-3", "cue": "go", "targetKeyId": "key-e", "cueAtMs": 4164, "windowEndAtMs": 5364, "windowClosed": true, "presses": [{"keyId": "key-e", "atMs": 4464}]},
    {"trialId": "trial-4", "cue": "wait", "targetKeyId": "key-n", "cueAtMs": 6246, "windowEndAtMs": 7446, "windowClosed": true, "presses": []},
    {"trialId": "trial-5", "cue": "go", "targetKeyId": "key-l", "cueAtMs": 8328, "windowEndAtMs": 9528, "windowClosed": true, "presses": [{"keyId": "key-l", "atMs": 8628}]},
    {"trialId": "trial-6", "cue": "no-go", "targetKeyId": "key-a", "cueAtMs": 10410, "windowEndAtMs": 11610, "windowClosed": true, "presses": []},
    {"trialId": "trial-7", "cue": "go", "targetKeyId": "key-n", "cueAtMs": 12492, "windowEndAtMs": 13692, "windowClosed": true, "presses": [{"keyId": "key-n", "atMs": 12792}]},
    {"trialId": "trial-8", "cue": "wait", "targetKeyId": "key-e", "cueAtMs": 14574, "windowEndAtMs": 15774, "windowClosed": true, "presses": []},
    {"trialId": "trial-9", "cue": "go", "targetKeyId": "key-a", "cueAtMs": 16656, "windowEndAtMs": 17856, "windowClosed": true, "presses": [{"keyId": "key-a", "atMs": 16956}]},
    {"trialId": "trial-10", "cue": "no-go", "targetKeyId": "key-l", "cueAtMs": 18738, "windowEndAtMs": 19938, "windowClosed": true, "presses": []}
  ]},
  "deviceSummary": {"trialsPresented": 10, "goCorrect": 5, "noGoCorrect": 3, "waitCorrect": 2}
}
```

Motor Sequence Builder: three demonstrated keys and three correct reproduction presses:

```json
{
  "schemaVersion": 1, "runId": "00000000-0000-4000-8000-000000000005", "activity": "motor-sequence-builder", "state": "completed", "endedAtMs": 3500, "pauses": [], "unassignedPresses": [],
  "observations": {"sequences": [{
    "sequenceId": "sequence-1", "text": "LAN",
    "presentations": [{"keyId": "key-l", "atMs": 0}, {"keyId": "key-a", "atMs": 833}, {"keyId": "key-n", "atMs": 1666}],
    "reproductionGoAtMs": 2500,
    "presses": [{"keyId": "key-l", "atMs": 2700}, {"keyId": "key-a", "atMs": 3000}, {"keyId": "key-n", "atMs": 3300}],
    "completedAtMs": 3300
  }]},
  "deviceSummary": {"sequencesStarted": 1, "sequencesCompleted": 1, "totalAttempts": 3}
}
```

In all examples, the corresponding accepted start request is recoverable by `GET /runs/{runId}`.

## 5. Derivation and report fields

Stella derives metrics only from validated observations and the accepted plan. A raw result must use existing plan IDs and key IDs, monotonic offsets within `0..endedAtMs`, no duplicate observation IDs, no press outside its recorded trial/sequence, no overlapping pause intervals, and no observations after terminal time. If validation or device-summary reconciliation fails, show a recoverable "result needs review" state and do not add that run to patient performance charts.

| Exercise | Result field | Derivation |
|---|---|---|
| Letter Target / Find | `itemsCompleted`, `itemsTotal` | Items with a final correct trial / configured items. Also store `itemsStarted`. |
| Letter Target / Find | `correctHits`, `incorrectAttempts`, `totalAttempts` | Correct target-trial presses / wrong presses / all detectable presses assigned to target trials. `correctHits + incorrectAttempts = totalAttempts`. A correct press advances one target trial, not necessarily one item. Unassigned presses remain in the raw log. |
| Letter Target / Find | `accuracyPercent` | `100 * correctHits / totalAttempts`. |
| Letter Target / Find | `firstAttemptSuccessRatePercent` | `100 * completed target trials whose first press was correct / completed target trials`. An interrupted, unresolved trial is excluded; retain its presses in total attempts. |
| Letter Target / Find | `meanCorrectLatencyMs`, `latencyVariabilityStdDev` | Mean and population standard deviation of `first correct press atMs - readyAtMs`, for completed target trials. One observation has variability `0`; none gives `null`. |
| Letter Target / Find | `onBeatAccuracyPercent`, `timingVariabilityStdDev` | Among presses with `nearestBeatAtMs`, proportion with absolute offset <= configured window and population standard deviation of signed offsets. No beat timestamps gives `null`. |
| Eye Pong | `targetChangesCompleted`, `targetChangesTotal`, `completionRatePercent` | Observed transitions / configured target changes / their ratio. Label the percent "program completion". No patient accuracy or response latency is produced. |
| Inhibition Challenge | `goAccuracyPercent`, `missedGoRatePercent` | Correct key within a *closed* Go window / closed Go windows; no correct key within the window / closed Go windows. Wrong-key-only Go trials count in the latter. Store Go counts and wrong-key count for interpretation. |
| Inhibition Challenge | `noGoAccuracyPercent`, `waitAccuracyPercent` | No press in a closed No-Go or Wait window / closed windows of the same cue type. Never combine Wait with No-Go. |
| Inhibition Challenge | `meanGoLatencyMs` | Mean of first correct Go press minus cue time, for successful Go trials only. |
| Motor Sequence Builder | `sequenceCompletionRatePercent` | Completed sequences / sequences started. A sequence interrupted by early stop is incomplete. With retry-until-correct and no timeout, fully run sessions will normally reach 100%; do not present this alone as performance accuracy. |
| Motor Sequence Builder | `firstAttemptSequenceAccuracyPercent` | Started sequences completed with no incorrect press / sequences started. |
| Motor Sequence Builder | `longestCompletedSequence`, `meanCompletionTimeMs` | Maximum completed key count; mean `completedAtMs - reproductionGoAtMs` over completed sequences. |
| All | `totalSessionDurationMinutes`, `activeEngagementTimeMinutes`, `pauseBreakCount` | Convert `endedAtMs` and pause-subtracted time to minutes; count pause intervals. |
| All except Eye Pong | `attemptsPerMinute` | Detectable key presses for Letter Target/Find and Motor Sequence Builder; closed cue trials for Inhibition Challenge, divided by active minutes. Store the numerator as well. |

For Eye Pong, show target changes per minute only if useful, under that name; do not call transitions "attempts". `missDistance`, error direction, breakdown point, and movement-start latency remain `null` until the necessary observation method and scoring rule are specified. Directional or rhythm fields in workbook examples do not establish that the keyboard captured those measures.

The report projection retains the current Stella keys needed by [exercise metadata](../stella/src/config/exercises.ts). `activity` is the slug; `sessionDate` is an ISO UTC completion timestamp; `status` is `completed` or `ended-early`; `summary` is a factual sentence generated from measured counts. `sessionId=runId`. Add `schemaVersion`, `source:"keyboard"`, `deviceId`, `configuration` (accepted snapshot), metric numerators/denominators, and `rawEventKey`. Existing legacy seed rows get `source:"legacy-simulated"` at read time, with no fabricated raw key.

Per-exercise projection details:

- Letter Target/Find keep `contentMode`, `itemsPerSession`, `wordLength` (derived band for word runs only), `audioMode`, `tempoBpm` for metronome only, `musicPlaybackRate` for music only, `itemsCompleted`, `itemsTotal`, `totalAttempts`, `correctHits`, `accuracyPercent`, `firstAttemptSuccessRatePercent`, `meanCorrectLatencyMs`, and `incorrectAttempts`. Add count denominators and nullable optional metrics.
- Eye Pong keeps `mode` and, temporarily for current table compatibility, derives `pattern:"horizontal"` for left-right or `"mixed"` for random. Keep `targetChanges` as actual transitions for current cards, and add `targetChangesConfigured` and `targetChangesCompleted`. `completionRatePercent` describes program delivery.
- Inhibition Challenge uses the app's `goAccuracyPercent` and `noGoAccuracyPercent` names, not the reference document's longer names. Keep `trialCount`, `rulePreset`, `responseWindowMs`, `cueSpeedBpm`, `missedGoRatePercent`, and `meanGoLatencyMs`. Add presented/closed counts per cue and separate Wait accuracy.
- Motor Sequence Builder keeps `contentType`, `sequenceLength`, `sequenceCount`, `presentationSpeedBpm`, `audioMode`, `sequenceCompletionRatePercent`, `firstAttemptSequenceAccuracyPercent`, `longestCompletedSequence`, and `meanCompletionTimeMs`. Add started/completed sequence counts.

The frontend must treat numeric `null` as unavailable, not as zero, in cards, charts, sort, detail rows, and AI analysis. Update analysis recommendations that currently emit the legacy `0-5` band to the new `1-5` band for new runs. Cross-session averages remain an unweighted mean of available session rates to preserve current UI behavior; show the session count and configuration filters, and do not imply a clinical outcome from a trend.

## 6. Stella and AWS data flow

1. Stella loads capabilities and allows only supported exercises. The clinician selects exact content for Letter Target, Letter Find, and Motor Sequence Builder. Stella validates key availability and settings and builds the complete plan. Eye Pong uses the selected eligible keys and mode; Inhibition Challenge uses an explicit shuffled trial plan.
2. Stella creates a UUID `runId`, stores `{patientId, startRequest, startAnchorUtc, deviceId}` locally, and calls `POST /runs`. The UI uses `GET /runs/{runId}` for progress and `POST /runs/{runId}/stop` for early stop. A reload resumes by run ID rather than starting another run.
3. When terminal, Stella fetches the immutable raw result. A single versioned, pure projection function validates the event record, compares device totals, calculates metrics, and produces the flat session DTO. The UI can preview the same DTO immediately.
4. Stella writes an upload envelope to an IndexedDB outbox, then calls the authenticated AWS `POST /sessions` with `schemaVersion`, `patientId`, `startAnchorUtc`, `acceptedRequest`, and `deviceResult`. Keep the outbox entry until AWS returns the canonical saved session. Retry the identical envelope under the same `runId` after a network failure.
5. The AWS handler validates patient existence, run ID, accepted settings, event shape, and the derived counts/metrics (using the same versioned projection rules). It stores raw events in a private S3 object keyed by both run and digest, such as `runs/{runId}/{digest}.json`, then transactionally records a `runId` claim in a new DynamoDB run-claims table and the summary in the existing sessions table. The claim stores `patientId`, `sessionKey`, `rawEventKey`, and a SHA-256 digest of the upload envelope after recursive key sorting and compact JSON serialization. A repeated upload with the same digest returns the original session; a different patient or payload for the same run is rejected without overwriting its raw object. A failed DynamoDB transaction leaves an identifiable orphan object for cleanup, not a duplicate patient session.
6. Existing `GET /patients/{patientId}/sessions` and exercise-session routes keep returning the flat projection, so the metadata-driven cards, charts, filters, table, and analysis API continue to read the same field names. The simulator implements the same keyboard contract with deterministic raw fixtures. Historical seeded data stays visible with legacy provenance.

Raw observations belong outside the single DynamoDB summary item because a run can contain an unbounded number of corrections; DynamoDB has a 400 KB item limit ([AWS guidance](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-use-s3-too.html)). Keep the S3 bucket private, and never put patient names in the device payload or raw object key. The hosted CloudFront app-to-keyboard transport is deliberately outside this contract; before building the adapter, validate the actual iPad browser and network path because browser access from a hosted page to local devices is constrained ([MDN local network access](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Local_network_access)).

## 7. Acceptance checks for implementation

- Each of five start examples passes schema and device-capability validation; unsupported keys, missing content, mixed word-length bands, and unsupported exercise types fail before Start.
- Same `runId` plus same payload starts or uploads once. Same ID plus changed payload or patient link is rejected.
- The five result examples reproduce their integer counts and rates: Letter Target 4/5 accuracy and 3/4 first attempt; Letter Find 2/3 accuracy and 1/2 first attempt; Eye Pong 2/2 program completion; Inhibition Challenge 5/5 Go, 3/3 No-Go, and 2/2 Wait; Motor Sequence Builder 1/1 completion and first attempt.
- A wrong letter press does not advance a word or sequence. First-response and correct-response times both use the recorded actionable cue, not network time.
- An early stop keeps completed units and partial raw observations. An open No-Go/Wait window is not scored as successful inhibition. Empty denominators and missing beats display as unavailable; measured zero remains visible.
- The backend rejects observation/device-summary mismatches and does not put invalid runs in chart history. Failed AWS uploads remain retryable in the outbox; legacy summaries remain readable without claimed raw evidence.
- Eye Pong UI and analysis describe only programmed transitions, duration, and program completion.
