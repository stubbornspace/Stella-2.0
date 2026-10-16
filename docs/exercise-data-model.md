# Stella Exercise Data Model

Representative JSON payloads for every exercise are available in
[`exercise-data-examples.json`](./exercise-data-examples.json). The examples show both
the saved session/report fields and the runtime events retained in `rawEventPayload`.

This document defines the session-level data model for each Stella exercise. Each table is explicit: metadata, configuration, and metrics are repeated per exercise so each exercise can stand on its own.

## Runtime boundaries

Stella owns the patient context, exercise setup form, saved session, and reports. The keyboard device owns exercise presentation, physical input, timing, audio, and scoring while a session is running.

The device API uses a separate wire model rather than sending Stella's UI objects directly:

| Stella model | Device API | Saved result |
|---|---|---|
| `letter-target` | `letter_target` | `letter-target` |
| `letter-find` | `letter_find` | `letter-find` |
| `eye-pong` | `eye_pong` | `eye-pong` |
| `inhibition-challenge` | `inhibition_challenge` | `inhibition-challenge` |
| `keyboardLayout` | `layout` | Configuration fields on the saved session |
| `keyboardSide` | `side` | Configuration fields on the saved session |
| `keyLabels` | `key_label` | Configuration fields on the saved session |
| Activity-specific count | `items` | Activity-specific completed/total metrics |
| `audioMode: silent` | `beat: none` | `audioMode: silent` |
| Patient code | `participant` | `patientId` remains Stella-owned |

The device returns a summary plus an event-level JSONL log. Stella maps those values into the report fields below and also retains the original payload at `rawEventPayload.devicePayload`. This allows the current reports to work without discarding device data that may support future analysis.

Exact integration shapes and endpoints are defined in `docs/api-reference.md`. The TypeScript source of truth is `stella/src/types/exercise-control.ts` for Stella and `stella/src/lib/device/device-types.ts` for the wire model.

## Letter Target

| Field | Type | Value type | Source / calculation | Description |
|---|---|---|---|---|
| sessionId | metadata | string | Generated when session is saved. | Unique identifier for the completed session. |
| patientId | metadata | string | Selected patient record. | Patient identifier associated with the session. |
| activity | config | enum | Fixed value from exercise config: `Letter Target`. | Exercise name. |
| sessionDate | metadata | date | Timestamp when session is completed. | Date the session was completed. |
| status | metric | enum | Session result status: `completed` or `ended-early`. | Whether the session reached its endpoint. |
| summary | metric | string | Generated from result values. | Human-readable session summary. |
| contentMode | config | enum | User-selected config: `letters` or `words`. | Whether prompts are single letters or words. |
| itemsPerSession | config | number | User-selected config. | Number of prompts configured for the session. |
| wordLength | config | enum | User-selected range: `0-5`, `5-10`, or `10+`. Legacy records may contain exact lengths `3`–`8`. | Word-length range when words are used. |
| audioMode | config | enum | User-selected config: `silent`, `metronome`, or `music`. | Audio support used during the session. |
| tempoBpm | config | number | User-selected config when audio timing is active. | Tempo in beats per minute. |
| itemsCompleted | metric | number | Count of configured prompts completed before finish/stop. | Completed letters or words. |
| itemsTotal | metric | number | Mirrors `itemsPerSession` at session start. | Total configured prompts for the session. |
| totalAttempts | metric | number | `itemsCompleted + incorrectAttempts`. | Total letter/button selections attempted. |
| correctHits | metric | number | Same source as `itemsCompleted` in current prototype. | Number of intended targets successfully selected. |
| accuracyPercent | metric | number | `correctHits / totalAttempts * 100`. | Overall targeting accuracy. |
| firstAttemptSuccessRatePercent | metric | number | Correct first attempts divided by total prompts. Current prototype stores as `firstAttemptAccuracy`. | Correct selections made without correction. |
| meanCorrectLatencyMs | metric | number | Average latency across correct selections. | Mean response latency for correct selections. |
| latencyVariabilityStdDev | metric | number | Standard deviation of per-attempt latency values. | Reserved until per-attempt latency is captured. |
| incorrectAttempts | metric | number | Count of non-target selections. | Incorrect attempts during the session. |
| missDistance | metric | number | Distance from selected location to intended target. | Optional/reserved targeting precision metric. |
| beatActive | config | boolean | `audioMode` is `metronome` or `music`. | Whether rhythm timing should be evaluated. |
| beatTimestamp | metric | datetime | Captured per attempt when beat is active. | Nearest beat timestamp used for timing offset. |
| onBeatAccuracyPercent | metric | number | Attempts within the on-beat window divided by total beat-active attempts. | Percent of selections within the rhythm window. |
| timingVariabilityStdDev | metric | number | Standard deviation of beat offsets. | Rhythm consistency metric. |
| errorDirectionClassification | metric | enum | Most common direction among incorrect selections. | Error pattern: `left`, `right`, `above`, `below`, or `random`. |
| directionalConsistencyPercent | metric | number | Errors in dominant direction divided by total errors. | How consistent the error direction pattern is. |
| lettersCompletedPerSequence | metric | number | Count of completed letters within a word/sequence. | Sequence progress for spelling tasks. |
| sequenceCompletionRatePercent | metric | number | Completed sequence units divided by configured sequence units. | Percent of spelling sequence completed. |
| breakdownPoint | metric | string | First repeated error position in sequence. | Letter or position where errors typically begin. |
| activeEngagementTimeMinutes | metric | number | Active interaction time excluding pauses. | Reserved until timing capture is implemented. |
| totalSessionDurationMinutes | metric | number | Finish timestamp minus start timestamp. | Total elapsed session duration. |
| attemptsPerMinute | metric | number | `totalAttempts / activeEngagementTimeMinutes`. | Session pacing metric. |
| pauseBreakCount | metric | number | Count of pause/break events. | Optional engagement metric. |

### Letter Target Session Report Fields

| Report section | Field | Show as | Include when | Notes |
|---|---|---|---|---|
| Summary | sessionDate | Date | Always | Date the session was completed. |
| Summary | status | Completed / Ended early | Always | Top-level session state. |
| Summary | summary | Sentence summary | Always | Generated from completed items and first-attempt accuracy. |
| Configuration | contentMode | Letters / Words | Always | Shows the prompt type used. |
| Configuration | itemsPerSession | Count | Always | Configured session length. |
| Configuration | wordLength | Word range | When `contentMode` is `words` | Hide for letter-only sessions. |
| Configuration | audioMode | Silent / Metronome / Music | Always | Shows support mode. |
| Configuration | tempoBpm | BPM | When audio timing is active | Hide when audio mode is silent. |
| Results | itemsCompleted | `itemsCompleted / itemsTotal` | Always | Primary completion metric. |
| Results | totalAttempts | Count | Always | Calculated from completed plus incorrect attempts. |
| Results | correctHits | Count | Always | Same source as completed items in current prototype. |
| Results | accuracyPercent | Percent | Always | `correctHits / totalAttempts * 100`. |
| Results | firstAttemptSuccessRatePercent | Percent | Always | Current prototype stores this as first-attempt accuracy. |
| Results | meanCorrectLatencyMs | Milliseconds | Always | Primary response timing metric. |
| Results | incorrectAttempts | Count | Always | Shows correction burden. |
| Results | onBeatAccuracyPercent | Percent | When captured | Rhythm metric from Metrics for Tom. |
| Results | timingVariabilityStdDev | Milliseconds std dev | When captured | Rhythm consistency metric. |
| Results | directionalConsistencyPercent | Percent | When captured | Directional error consistency metric. |
| Results | activeEngagementTimeMinutes | Minutes | When captured | Engagement duration metric. |

## Letter Find

| Field | Type | Value type | Source / calculation | Description |
|---|---|---|---|---|
| sessionId | metadata | string | Generated when session is saved. | Unique identifier for the completed session. |
| patientId | metadata | string | Selected patient record. | Patient identifier associated with the session. |
| activity | config | enum | Fixed value from exercise config: `Letter Find`. | Exercise name. |
| sessionDate | metadata | date | Timestamp when session is completed. | Date the session was completed. |
| status | metric | enum | Session result status: `completed` or `ended-early`. | Whether the session reached its endpoint. |
| summary | metric | string | Generated from result values. | Human-readable session summary. |
| contentMode | config | enum | User-selected config: `letters` or `words`. | Whether prompts are spoken letters or spoken words. |
| itemsPerSession | config | number | User-selected config. | Number of prompts configured for the session. |
| wordLength | config | enum | User-selected range: `0-5`, `5-10`, or `10+`. Legacy records may contain exact lengths `3`–`8`. | Word-length range when words are used. |
| audioMode | config | enum | User-selected config: `silent`, `metronome`, or `music`. | Audio support used during the session. |
| tempoBpm | config | number | User-selected config when audio timing is active. | Tempo in beats per minute. |
| itemsCompleted | metric | number | Count of configured prompts completed before finish/stop. | Completed spoken letters or words. |
| itemsTotal | metric | number | Mirrors `itemsPerSession` at session start. | Total configured prompts for the session. |
| totalAttempts | metric | number | `itemsCompleted + incorrectAttempts`. | Total letter/button selections attempted. |
| correctHits | metric | number | Same source as `itemsCompleted` in current prototype. | Number of intended targets successfully selected. |
| accuracyPercent | metric | number | `correctHits / totalAttempts * 100`. | Overall auditory prompt selection accuracy. |
| firstAttemptSuccessRatePercent | metric | number | Correct first attempts divided by total prompts. Current prototype stores as `firstAttemptAccuracy`. | Correct selections made without correction. |
| meanCorrectLatencyMs | metric | number | Average latency across correct selections. | Mean response latency for correct selections. |
| latencyVariabilityStdDev | metric | number | Standard deviation of per-attempt latency values. | Reserved until per-attempt latency is captured. |
| incorrectAttempts | metric | number | Count of non-target selections. | Incorrect attempts during the session. |
| missDistance | metric | number | Distance from selected location to intended target. | Optional/reserved targeting precision metric. |
| beatActive | config | boolean | `audioMode` is `metronome` or `music`. | Whether rhythm timing should be evaluated. |
| beatTimestamp | metric | datetime | Captured per attempt when beat is active. | Nearest beat timestamp used for timing offset. |
| onBeatAccuracyPercent | metric | number | Attempts within the on-beat window divided by total beat-active attempts. | Percent of selections within the rhythm window. |
| timingVariabilityStdDev | metric | number | Standard deviation of beat offsets. | Rhythm consistency metric. |
| errorDirectionClassification | metric | enum | Most common direction among incorrect selections. | Error pattern: `left`, `right`, `above`, `below`, or `random`. |
| directionalConsistencyPercent | metric | number | Errors in dominant direction divided by total errors. | How consistent the error direction pattern is. |
| lettersCompletedPerSequence | metric | number | Count of completed letters within a word/sequence. | Sequence progress for spelling tasks. |
| sequenceCompletionRatePercent | metric | number | Completed sequence units divided by configured sequence units. | Percent of spelling sequence completed. |
| breakdownPoint | metric | string | First repeated error position in sequence. | Letter or position where errors typically begin. |
| activeEngagementTimeMinutes | metric | number | Active interaction time excluding pauses. | Reserved until timing capture is implemented. |
| totalSessionDurationMinutes | metric | number | Finish timestamp minus start timestamp. | Total elapsed session duration. |
| attemptsPerMinute | metric | number | `totalAttempts / activeEngagementTimeMinutes`. | Session pacing metric. |
| pauseBreakCount | metric | number | Count of pause/break events. | Optional engagement metric. |

### Letter Find Session Report Fields

| Report section | Field | Show as | Include when | Notes |
|---|---|---|---|---|
| Summary | sessionDate | Date | Always | Date the session was completed. |
| Summary | status | Completed / Ended early | Always | Top-level session state. |
| Summary | summary | Sentence summary | Always | Generated from completed prompts and first-attempt accuracy. |
| Configuration | contentMode | Letters / Words | Always | Shows whether prompts were spoken letters or spoken words. |
| Configuration | itemsPerSession | Count | Always | Configured prompt count. |
| Configuration | wordLength | Word range | When `contentMode` is `words` | Hide for letter-only sessions. |
| Configuration | audioMode | Silent / Metronome / Music | Always | Shows support mode. |
| Configuration | tempoBpm | BPM | When audio timing is active | Hide when audio mode is silent. |
| Results | itemsCompleted | `itemsCompleted / itemsTotal` | Always | Label as prompts completed. |
| Results | totalAttempts | Count | Always | Calculated from completed plus incorrect attempts. |
| Results | correctHits | Count | Always | Same source as completed prompts in current prototype. |
| Results | accuracyPercent | Percent | Always | `correctHits / totalAttempts * 100`. |
| Results | firstAttemptSuccessRatePercent | Percent | Always | Current prototype stores this as first-attempt accuracy. |
| Results | meanCorrectLatencyMs | Milliseconds | Always | Primary response timing metric. |
| Results | incorrectAttempts | Count | Always | Shows correction burden. |
| Results | onBeatAccuracyPercent | Percent | When captured | Rhythm metric from Metrics for Tom. |
| Results | timingVariabilityStdDev | Milliseconds std dev | When captured | Rhythm consistency metric. |
| Results | directionalConsistencyPercent | Percent | When captured | Directional error consistency metric. |
| Results | activeEngagementTimeMinutes | Minutes | When captured | Engagement duration metric. |

## Eye Pong

| Field | Type | Value type | Source / calculation | Description |
|---|---|---|---|---|
| sessionId | metadata | string | Generated when session is saved. | Unique identifier for the completed session. |
| patientId | metadata | string | Selected patient record. | Patient identifier associated with the session. |
| activity | config | enum | Fixed value from exercise config: `Eye Pong`. | Exercise name. |
| sessionDate | metadata | date | Timestamp when session is completed. | Date the session was completed. |
| status | metric | enum | Session result status: `completed` or `ended-early`. | Whether the session reached its endpoint. |
| summary | metric | string | Generated from result values. | Human-readable session summary. |
| sessionNotes | clinician input | string | Optional notes saved after the session. | Clinician observations for the session. |
| keyboardSide | config | enum | Fixed to `full` for Left / Right; selected `full`, `left`, or `right` for Random. | Keyboard area used for target presentation. |
| pattern | config | enum | User-selected config: `left-right` or `random`. | Target movement pattern. |
| targetChanges | config | number | User-selected config. | Number of target changes configured. |
| audioMode | config | enum | User-selected config: `silent`, `metronome`, or `music`. | Audio support used during the session. |
| tempoBpm | config | number | User-selected config when audio timing is active. | Tempo in beats per minute. |
| mode | metric | string | Derived display label from `pattern`. | Human-readable target movement mode. |
| targetChangesCompleted | metric | number | Count of target changes completed before finish/stop. | Completed visual target changes. |
| targetChangesTotal | metric | number | Mirrors `targetChanges` at session start. | Total configured target changes. |
| completionRatePercent | metric | number | `targetChangesCompleted / targetChangesTotal * 100`. | Percent of target changes completed. |
| tempoLabel | metric | string | Derived from `audioMode` and `tempoBpm`. | Human-readable tempo result. |
| averageResponseLatencyMs | metric | number | Reserved if target response timing is later captured. | Average response latency. |
| latencyVariabilityStdDev | metric | number | Standard deviation of per-target latency values. | Reserved timing variability metric. |
| beatActive | config | boolean | `audioMode` is `metronome` or `music`. | Whether rhythm timing should be evaluated. |
| beatTimestamp | metric | datetime | Captured per target change when beat is active. | Nearest beat timestamp used for timing offset. |
| onBeatAccuracyPercent | metric | number | Target changes within the on-beat window divided by total beat-active target changes. | Percent of target changes aligned to beat. |
| timingVariabilityStdDev | metric | number | Standard deviation of beat offsets. | Rhythm consistency metric. |
| errorDirectionClassification | metric | enum | Clinician-observed or future captured tracking error direction. | Reserved direction pattern: `left`, `right`, `above`, `below`, or `random`. |
| directionalConsistencyPercent | metric | number | Errors in dominant direction divided by total errors. | Reserved directional consistency metric. |
| activeEngagementTimeMinutes | metric | number | Active interaction time excluding pauses. | Reserved until timing capture is implemented. |
| totalSessionDurationMinutes | metric | number | Finish timestamp minus start timestamp. | Total elapsed session duration. |
| attemptsPerMinute | metric | number | `targetChangesCompleted / activeEngagementTimeMinutes`. | Session pacing metric. |
| pauseBreakCount | metric | number | Count of pause/break events. | Optional engagement metric. |

### Eye Pong Session Report Fields

The UI intentionally presents configuration and clinician-authored notes only.
Completion and timing values remain stored in the session payload for protocol
operation and auditing, but are not presented as patient performance results.

| Report section | Field | Show as | Include when | Notes |
|---|---|---|---|---|
| Configuration | pattern | Left / Right or Random | Always | Target movement pattern used. |
| Configuration | keyboardSide | Full / Left / Right | Random only | Left / Right always uses Full. |
| Configuration | targetChanges | Count | Always | Configured number of target changes. |
| Configuration | audioMode | Silent / Metronome / Music | Always | Shows support mode. |
| Configuration | tempoBpm | BPM | When audio timing is active | Hide when audio mode is silent. |
| Notes | sessionNotes | Editable text | Always | Clinician observations, up to 2,000 characters. |

## Inhibition Challenge

| Field | Type | Value type | Source / calculation | Description |
|---|---|---|---|---|
| sessionId | metadata | string | Generated when session is saved. | Unique identifier for the completed session. |
| patientId | metadata | string | Selected patient record. | Patient identifier associated with the session. |
| activity | config | enum | Fixed value from exercise config: `Inhibition Challenge`. | Exercise name. |
| sessionDate | metadata | date | Timestamp when session is completed. | Date the session was completed. |
| status | metric | enum | Session result status: `completed` or `ended-early`. | Whether the session reached its endpoint. |
| summary | metric | string | Generated from result values. | Human-readable session summary. |
| trialCount | config | number | User-selected config. | Number of Go / Stop trials configured. |
| rulePreset | config | enum | User-selected config: `balanced`, `go-heavy`, or `stop-heavy`. | Trial mix preset. |
| responseWindowMs | config | number | User-selected config. | Allowed response window in milliseconds. |
| cueSpeedBpm | config | number | User-selected config. | Cue presentation speed in beats per minute. |
| goTrialAccuracyPercent | metric | number | Correct Go responses divided by total Go trials. | Accuracy on trials requiring action. |
| noGoInhibitionAccuracyPercent | metric | number | Correctly inhibited No-Go trials divided by total No-Go trials. | Accuracy on trials requiring no action. |
| missedGoRatePercent | metric | number | Missed Go trials divided by total Go trials. | Percent of action-required trials missed. |
| meanGoLatencyMs | metric | number | Average latency across correct Go responses. | Mean response latency for Go trials. |
| latencyVariabilityStdDev | metric | number | Standard deviation of per-trial Go latency values. | Reserved until per-trial latency is captured. |
| beatActive | config | boolean | Derived from cue pacing if beat alignment is enabled. | Whether rhythm timing should be evaluated. |
| beatTimestamp | metric | datetime | Captured per trial when beat is active. | Nearest beat timestamp used for timing offset. |
| onBeatAccuracyPercent | metric | number | Trials within the on-beat window divided by total beat-active trials. | Percent of responses aligned to beat. |
| timingVariabilityStdDev | metric | number | Standard deviation of beat offsets. | Rhythm consistency metric. |
| errorDirectionClassification | metric | enum | Most common direction among incorrect responses, if spatial response is captured. | Reserved direction pattern: `left`, `right`, `above`, `below`, or `random`. |
| directionalConsistencyPercent | metric | number | Errors in dominant direction divided by total errors. | Reserved directional consistency metric. |
| activeEngagementTimeMinutes | metric | number | Active interaction time excluding pauses. | Reserved until timing capture is implemented. |
| totalSessionDurationMinutes | metric | number | Finish timestamp minus start timestamp. | Total elapsed session duration. |
| attemptsPerMinute | metric | number | `trialCount / activeEngagementTimeMinutes`. | Session pacing metric. |
| pauseBreakCount | metric | number | Count of pause/break events. | Optional engagement metric. |

### Inhibition Challenge Session Report Fields

| Report section | Field | Show as | Include when | Notes |
|---|---|---|---|---|
| Summary | sessionDate | Date | Always | Date the session was completed. |
| Summary | status | Completed / Ended early | Always | Top-level session state. |
| Summary | summary | Sentence summary | Always | Generated from Go accuracy and No-Go inhibition accuracy. |
| Configuration | trialCount | Count | Always | Configured trial count. |
| Configuration | rulePreset | Balanced / Go-heavy / Stop-heavy | Always | Trial mix used. |
| Configuration | responseWindowMs | Milliseconds | Always | Allowed response window. |
| Configuration | cueSpeedBpm | BPM | Always | Cue presentation speed. |
| Results | goTrialAccuracyPercent | Percent | Always | Initiation metric: responding when action is required. |
| Results | noGoInhibitionAccuracyPercent | Percent | Always | Inhibition metric: withholding response when action is not required. |
| Results | missedGoRatePercent | Percent | Always | Missed action-required trials. |
| Results | meanGoLatencyMs | Milliseconds | Always | Primary Go response timing metric. |
| Results | latencyVariabilityStdDev | Milliseconds std dev | When captured | Response timing variability metric. |
| Results | onBeatAccuracyPercent | Percent | When captured | Rhythm metric if cue timing is evaluated. |
| Results | timingVariabilityStdDev | Milliseconds std dev | When captured | Rhythm consistency metric. |
| Results | activeEngagementTimeMinutes | Minutes | When captured | Engagement duration metric. |
| Results | attemptsPerMinute | Trials per minute | When captured | `trialCount / activeEngagementTimeMinutes`. |

## Common Fields Across Exercises

| Field | Type | Value type | Applies to | Source / calculation | Description |
|---|---|---|---|---|---|
| sessionId | metadata | string | All exercises | Generated when session is saved. | Unique identifier for the completed session. |
| patientId | metadata | string | All exercises | Selected patient record. | Patient identifier associated with the session. |
| activity | config | enum | All exercises | Fixed value from exercise config. | Exercise name. |
| sessionDate | metadata | date | All exercises | Timestamp when session is completed. | Date the session was completed. |
| status | metric | enum | All exercises | Session result status: `completed` or `ended-early`. | Whether the session reached its endpoint. |
| summary | metric | string | All exercises | Generated from result values. | Human-readable session summary. |
| audioMode | config | enum | Letter Target, Letter Find, Eye Pong | User-selected config: `silent`, `metronome`, or `music`. | Audio support used during the session. |
| tempoBpm | config | number | Letter Target, Letter Find, Eye Pong | User-selected config when audio timing is active. | Tempo in beats per minute. |
| beatActive | config | boolean | All exercises | Derived from audio/cue timing when beat alignment is enabled. | Whether rhythm timing should be evaluated. |
| beatTimestamp | metric | datetime | All exercises | Captured per attempt/trial/step when beat is active. | Nearest beat timestamp used for timing offset. |
| onBeatAccuracyPercent | metric | number | All exercises | Beat-aligned attempts divided by total beat-active attempts. | Percent of actions aligned to beat. |
| timingVariabilityStdDev | metric | number | All exercises | Standard deviation of beat offsets. | Rhythm consistency metric. |
| averageResponseLatencyMs | metric | number | Letter Target, Letter Find; reserved for Eye Pong | Average of per-attempt or per-step response latencies. | Average response latency. |
| latencyVariabilityStdDev | metric | number | All exercises | Standard deviation of per-attempt/trial/step latency values. | Response timing variability metric. |
| errorDirectionClassification | metric | enum | All exercises | Most common direction among incorrect responses when spatial errors are captured. | Error pattern: `left`, `right`, `above`, `below`, or `random`. |
| directionalConsistencyPercent | metric | number | All exercises | Errors in dominant direction divided by total errors. | How consistent the error direction pattern is. |
| activeEngagementTimeMinutes | metric | number | All exercises | Active interaction time excluding pauses. | Engagement duration metric. |
| totalSessionDurationMinutes | metric | number | All exercises | Finish timestamp minus start timestamp. | Total elapsed session duration. |
| attemptsPerMinute | metric | number | All exercises | Exercise-specific attempt count divided by active engagement time. | Session pacing metric. |
| pauseBreakCount | metric | number | All exercises | Count of pause/break events. | Optional engagement metric. |
