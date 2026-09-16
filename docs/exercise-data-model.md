# Stella Exercise Data Model

This document defines the session-level data model for each Stella exercise. Each table is explicit: metadata, configuration, and metrics are repeated per exercise so each exercise can stand on its own.

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
| wordLength | config | enum | User-selected config: `0-5`, `5-10`, or `10+`. | Word length band when words are used. |
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
| Configuration | wordLength | Word length band | When `contentMode` is `words` | Hide for letter-only sessions. |
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
| wordLength | config | enum | User-selected config: `0-5`, `5-10`, or `10+`. | Word length band when words are used. |
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
| Configuration | wordLength | Word length band | When `contentMode` is `words` | Hide for letter-only sessions. |
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

| Report section | Field | Show as | Include when | Notes |
|---|---|---|---|---|
| Summary | sessionDate | Date | Always | Date the session was completed. |
| Summary | status | Completed / Ended early | Always | Top-level session state. |
| Summary | summary | Sentence summary | Always | Generated from target changes completed. |
| Configuration | pattern | Left / Right or Random | Always | Target movement pattern used. |
| Configuration | targetChanges | Count | Always | Configured number of target changes. |
| Configuration | audioMode | Silent / Metronome / Music | Always | Shows support mode. |
| Configuration | tempoBpm | BPM | When audio timing is active | Hide when audio mode is silent. |
| Results | targetChangesCompleted | `targetChangesCompleted / targetChangesTotal` | Always | Primary completion metric. |
| Results | completionRatePercent | Percent | Always | `targetChangesCompleted / targetChangesTotal * 100`. |
| Results | mode | Display label | Always | Human-readable pattern label. |
| Results | tempoLabel | Display label | Always | Human-readable tempo/audio result. |
| Results | onBeatAccuracyPercent | Percent | When captured | Rhythm metric if beat/music alignment is tracked. |
| Results | timingVariabilityStdDev | Milliseconds std dev | When captured | Rhythm consistency metric. |
| Results | activeEngagementTimeMinutes | Minutes | When captured | Engagement duration metric. |
| Results | attemptsPerMinute | Target changes per minute | When captured | Use target changes completed as the activity count. |

## Inhibition Challenge

| Field | Type | Value type | Source / calculation | Description |
|---|---|---|---|---|
| sessionId | metadata | string | Generated when session is saved. | Unique identifier for the completed session. |
| patientId | metadata | string | Selected patient record. | Patient identifier associated with the session. |
| activity | config | enum | Fixed value from exercise config: `Inhibition Challenge`. | Exercise name. |
| sessionDate | metadata | date | Timestamp when session is completed. | Date the session was completed. |
| status | metric | enum | Session result status: `completed` or `ended-early`. | Whether the session reached its endpoint. |
| summary | metric | string | Generated from result values. | Human-readable session summary. |
| trialCount | config | number | User-selected config. | Number of Go / Stop / Wait trials configured. |
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

## Motor Sequence Builder

| Field | Type | Value type | Source / calculation | Description |
|---|---|---|---|---|
| sessionId | metadata | string | Generated when session is saved. | Unique identifier for the completed session. |
| patientId | metadata | string | Selected patient record. | Patient identifier associated with the session. |
| activity | config | enum | Fixed value from exercise config: `Motor Sequence Builder`. | Exercise name. |
| sessionDate | metadata | date | Timestamp when session is completed. | Date the session was completed. |
| status | metric | enum | Session result status: `completed` or `ended-early`. | Whether the session reached its endpoint. |
| summary | metric | string | Generated from result values. | Human-readable session summary. |
| contentType | config | enum | User-selected config: `letter-sequence` or `word-sequence`. | Sequence content type. |
| sequenceLength | config | number | User-selected config. | Number of steps in each sequence. |
| sequenceCount | config | number | User-selected config. | Number of sequences configured for the session. |
| presentationSpeedBpm | config | number | User-selected config. | Speed at which the sequence is presented. |
| audioMode | config | enum | User-selected config: `silent`, `metronome`, or `music`. | Audio support used during the session. |
| sequenceCompletionRatePercent | metric | number | Completed sequences divided by configured sequences. | Percent of configured sequences completed. |
| firstAttemptSequenceAccuracyPercent | metric | number | First-attempt successful sequences divided by total attempted sequences. | Percent of sequences completed correctly on first attempt. |
| longestCompletedSequence | metric | number | Max sequence length completed during the session. | Longest successful sequence. |
| meanCompletionTimeMs | metric | number | Average completion time across attempted sequences. | Mean sequence completion time. |
| lettersCompletedPerSequence | metric | number | Completed steps or letters divided by attempted sequences. | Sequence progress count. |
| breakdownPoint | metric | string | First repeated error position in sequence. | Step where errors typically begin. |
| averageResponseLatencyMs | metric | number | Average response latency across sequence steps. | Reserved until per-step latency is captured. |
| latencyVariabilityStdDev | metric | number | Standard deviation of per-step latency values. | Reserved timing variability metric. |
| beatActive | config | boolean | `audioMode` is `metronome` or `music`. | Whether rhythm timing should be evaluated. |
| beatTimestamp | metric | datetime | Captured per sequence step when beat is active. | Nearest beat timestamp used for timing offset. |
| onBeatAccuracyPercent | metric | number | Sequence steps within the on-beat window divided by total beat-active steps. | Percent of sequence responses aligned to beat. |
| timingVariabilityStdDev | metric | number | Standard deviation of beat offsets. | Rhythm consistency metric. |
| errorDirectionClassification | metric | enum | Most common direction among incorrect sequence selections. | Direction pattern: `left`, `right`, `above`, `below`, or `random`. |
| directionalConsistencyPercent | metric | number | Errors in dominant direction divided by total errors. | How consistent the error direction pattern is. |
| activeEngagementTimeMinutes | metric | number | Active interaction time excluding pauses. | Reserved until timing capture is implemented. |
| totalSessionDurationMinutes | metric | number | Finish timestamp minus start timestamp. | Total elapsed session duration. |
| attemptsPerMinute | metric | number | Sequence step attempts divided by active engagement time. | Session pacing metric. |
| pauseBreakCount | metric | number | Count of pause/break events. | Optional engagement metric. |

### Motor Sequence Builder Session Report Fields

| Report section | Field | Show as | Include when | Notes |
|---|---|---|---|---|
| Summary | sessionDate | Date | Always | Date the session was completed. |
| Summary | status | Completed / Ended early | Always | Top-level session state. |
| Summary | summary | Sentence summary | Always | Generated from longest completed sequence and completion rate. |
| Configuration | contentType | Letter sequence / Word sequence | Always | Sequence content type used. |
| Configuration | sequenceLength | Count | Always | Number of steps per sequence. |
| Configuration | sequenceCount | Count | Always | Number of configured sequences. |
| Configuration | presentationSpeedBpm | BPM | Always | Sequence presentation speed. |
| Configuration | audioMode | Silent / Metronome / Music | Always | Shows support mode. |
| Results | sequenceCompletionRatePercent | Percent | Always | Primary completion metric. |
| Results | firstAttemptSequenceAccuracyPercent | Percent | Always | Clean first-attempt sequence performance. |
| Results | longestCompletedSequence | Count | Always | Longest successful sequence reached. |
| Results | meanCompletionTimeMs | Milliseconds or seconds | Always | Average sequence completion time. |
| Results | lettersCompletedPerSequence | Count | When captured | Detailed sequence progress metric. |
| Results | breakdownPoint | Step or letter | When captured | Where sequence errors typically begin. |
| Results | onBeatAccuracyPercent | Percent | When captured | Rhythm metric if beat/music alignment is tracked. |
| Results | timingVariabilityStdDev | Milliseconds std dev | When captured | Rhythm consistency metric. |
| Results | activeEngagementTimeMinutes | Minutes | When captured | Engagement duration metric. |
| Results | attemptsPerMinute | Sequence steps per minute | When captured | Sequence step attempts divided by active engagement time. |

## Common Fields Across Exercises

| Field | Type | Value type | Applies to | Source / calculation | Description |
|---|---|---|---|---|---|
| sessionId | metadata | string | All exercises | Generated when session is saved. | Unique identifier for the completed session. |
| patientId | metadata | string | All exercises | Selected patient record. | Patient identifier associated with the session. |
| activity | config | enum | All exercises | Fixed value from exercise config. | Exercise name. |
| sessionDate | metadata | date | All exercises | Timestamp when session is completed. | Date the session was completed. |
| status | metric | enum | All exercises | Session result status: `completed` or `ended-early`. | Whether the session reached its endpoint. |
| summary | metric | string | All exercises | Generated from result values. | Human-readable session summary. |
| audioMode | config | enum | Letter Target, Letter Find, Eye Pong, Motor Sequence Builder | User-selected config: `silent`, `metronome`, or `music`. | Audio support used during the session. |
| tempoBpm | config | number | Letter Target, Letter Find, Eye Pong | User-selected config when audio timing is active. | Tempo in beats per minute. |
| beatActive | config | boolean | All exercises | Derived from audio/cue timing when beat alignment is enabled. | Whether rhythm timing should be evaluated. |
| beatTimestamp | metric | datetime | All exercises | Captured per attempt/trial/step when beat is active. | Nearest beat timestamp used for timing offset. |
| onBeatAccuracyPercent | metric | number | All exercises | Beat-aligned attempts divided by total beat-active attempts. | Percent of actions aligned to beat. |
| timingVariabilityStdDev | metric | number | All exercises | Standard deviation of beat offsets. | Rhythm consistency metric. |
| averageResponseLatencyMs | metric | number | Letter Target, Letter Find; reserved for Eye Pong and Motor Sequence Builder | Average of per-attempt or per-step response latencies. | Average response latency. |
| latencyVariabilityStdDev | metric | number | All exercises | Standard deviation of per-attempt/trial/step latency values. | Response timing variability metric. |
| errorDirectionClassification | metric | enum | All exercises | Most common direction among incorrect responses when spatial errors are captured. | Error pattern: `left`, `right`, `above`, `below`, or `random`. |
| directionalConsistencyPercent | metric | number | All exercises | Errors in dominant direction divided by total errors. | How consistent the error direction pattern is. |
| activeEngagementTimeMinutes | metric | number | All exercises | Active interaction time excluding pauses. | Engagement duration metric. |
| totalSessionDurationMinutes | metric | number | All exercises | Finish timestamp minus start timestamp. | Total elapsed session duration. |
| attemptsPerMinute | metric | number | All exercises | Exercise-specific attempt count divided by active engagement time. | Session pacing metric. |
| pauseBreakCount | metric | number | All exercises | Count of pause/break events. | Optional engagement metric. |
