**STELLA PROTOTYPE**  
**EXERCISE FUNCTIONAL REQUIREMENTS**

*Version 1.0 — Four-button prototype | Letter Target, Letter Find, Eye Pong,*   
*Inhibition Challenge, Motor Sequence Builder*

**Purpose.** Translate current clinical exercise concepts into implementation-ready software and hardware behavior for the existing prototype and planned near-term activities. Current versus future capabilities are identified throughout.

# **1\. Prototype Scope and Known Constraints**

* Physical form: full QWERTY keyboard housing with only a limited subset of keys currently functional.  
* Known functioning letters described in the working session: A, E, N and L  
* Each functioning key contains a digital display and can show its assigned letter and solid colors, currently red, green, and yellow.  
* The app and keyboard are not yet fully integrated. Some demo behaviors are simulated or manually coordinated.  
* Exercise instructions are audio-only. Letter Target also uses visible green-key prompts.  
* Current word and letter content is manually prescribed and limited to words that can be produced with functioning keys.  
* Eye Pong currently requires clinician observation; the prototype does not objectively measure eye movement.  
* Inhibition Challenge and Motor Sequence Builder are specified for future implementation and may not be functional in the current prototype build.

# **2\. Shared Terminology**

| Term | Definition |
| :---- | :---- |
| **Session** | One clinician-configured run of an activity. |
| **Item** | One requested response unit: either one letter or one word. |
| **Trial** | One target-level response opportunity. A single-letter item has one trial; a four-letter word has four trials. |
| **Prompt completion / Go marker** | The end of the spoken instruction, typically the word “Go.” This is Time Zero for response latency. |
| **Target** | The expected physical key for the current trial. |
| **Correct response** | The expected functioning key is pressed. |
| **Incorrect response** | A functioning key other than the expected target is pressed. |
| **Missed response** | No correct response is received within the configured timeout, if timeout is enabled. |
| **Latency** | Elapsed time from the Go marker to the first keypress, and separately to the correct keypress. |
| **Item completion time** | Elapsed time from the Go marker to completion of the final correct letter in the item. |

# **3\. Global Session Configuration**

| Setting | Prototype Requirement / Direction |
| :---- | :---- |
| **Activity** | Letter Target / Letter Find / Eye Pong / Inhibition Challenge / Motor Sequence Builder |
| **Content type** | Single letters, words or sequences, depending on activity. Eye Pong uses visual target sequences; Inhibition Challenge uses response-rule trials; Motor Sequence Builder uses prescribed letter sequences or words. |
| **Items per session** | Clinician selects how many letters, words, or Eye Pong target changes occur before automatic completion. |
| **Word length** | Prototype: manually prescribed valid words. Future: clinician selects maximum word length, such as ≤3, 4, or ≥5 letters. |
| **Audio mode** | Music, metronome, or silent background. Spoken instructions and feedback remain active unless separately muted. |
| **Tempo** | Clinician-selectable music/metronome speed. |
| **Content order** | Prototype: prescribed. Future: randomized from an approved library within selected constraints. |
| **Retry behavior** | After an incorrect functioning-key press, remain on the same target until the correct key is pressed. |
| **Timeout** | Recommended optional setting. Prototype may default to no timeout if not yet implemented. |
| **Early stop** | Clinician can stop a session at any time; completed trials remain saved. |
| **Sequence length** | Motor Sequence Builder only. Prototype uses prescribed sequence lengths; future versions allow clinician-selected minimum/maximum sequence length. |
| **Response window** | Required for Inhibition Challenge; configurable duration used to determine successful inhibition, missed Go responses and response latency. |

# **4\. Shared Audio and Visual Rules**

* All instructions must clearly identify the task, followed by a distinct Go marker.  
* Response timing starts at the completion of the Go marker, not at the beginning of the spoken prompt.  
* A correct keypress should immediately display solid green on the pressed key.  
* An incorrect functioning-key press should display solid red and trigger a concise correction prompt such as “Try again.”  
* During word entry, each correct keypress triggers spoken confirmation of that letter.  
* After the final correct letter, the system speaks the completed word and then gives positive completion feedback such as “Great job.”  
* A nonfunctioning keypress cannot currently be detected and must not be represented as a recorded error in prototype reporting.  
* Color displays should reset before the next target unless the exercise intentionally requires persistence.

# **5\. Activity Requirements**

## **5.1 LETTER TARGET — Visual-Guided Targeting**

**Clinical intent.** Practice intentional target selection using a visible green cue, with optional rhythm or music.

| Phase | System behavior | Expected user behavior |
| :---- | :---- | :---- |
| Start | Speak task instruction, for example “Hit the green letter. Ready, go.” | Wait for Go. |
| Target presentation | One functioning key displays its letter and turns solid green. | Locate and press the green key. |
| Correct response | Record key, timestamps, and correctness. Keep/flash green briefly. Speak the letter. | Continue to next letter if applicable. |
| Incorrect functioning-key response | Record incorrect key and timestamp. Pressed key turns red; speak “Try again.” Expected target remains active. | Correct the response. |
| Word progression | Present letters in the prescribed word one at a time as green targets. | Press each target in sequence. |
| Item completion | Speak completed word, then positive feedback. Reset keys. | Prepare for next item. |
| Session completion | After configured item count, speak completion message and save summary. | Activity ends. |

### **Letter Target Content Modes**

* Single letter: one visually cued target.  
* Word spelling: visually cue each letter in the prescribed word, in order.  
* Prototype content must use only functioning letters.  
* Future: random letter selection and randomized words by maximum word length.

## **5.2 LETTER FIND — Audio-Guided Targeting**

**Clinical intent.** Practice translating an auditory instruction into visual search and intentional key selection without advance illumination.

| Phase | System behavior | Expected user behavior |
| :---- | :---- | :---- |
| Start — letter | Speak “Hit the letter A. Ready, go.” No key illuminates before the press. | Search for and press the named letter. |
| Start — word | Speak “Spell LANE. Ready, go.” No key illuminates before each press. | Recall the word and press its letters in order. |
| Correct response | Record key, timestamps, and correctness. Pressed key turns green and the system speaks the letter. | Continue. |
| Incorrect functioning-key response | Record incorrect key and timestamp. Pressed key turns red; speak “Try again.” Remain on expected letter. | Correct the response. |
| Word completion | After final correct letter, speak the completed word and then positive feedback. | Prepare for next item. |
| Session completion | After configured item count, speak completion message and save summary. | Activity ends. |

### **Key Difference from Letter Target**

* Letter Target provides the answer visually by turning the expected key green.  
* Letter Find provides the instruction through audio only; keys remain visually neutral until pressed.  
* The two activities must be reported separately because they impose different visual-search, memory, and language-to-action demands.

## **5.3 EYE PONG — Visual Tracking**

**Clinical intent.** Provide a moving visual target for clinician-observed tracking. No button response is required.

| Phase | System behavior | Expected user behavior |
| :---- | :---- | :---- |
| Start | Speak “Follow the lights with your eyes. Ready, go.” | Direct gaze to the board. |
| Predictable mode | Alternate solid illuminated targets in a fixed left-right pattern using available functioning keys. | Track with eyes; clinician observes. |
| Random mode | Select the next target randomly from functioning keys and illuminate it for the configured interval. | Track unpredictable target changes. |
| Target transition | Turn off prior target before or at activation of the next target; avoid ambiguous overlap unless intentionally configured. | Shift gaze to new target. |
| Session completion | After configured number of target changes, turn all targets off and speak completion message. | Activity ends. |

### **Eye Pong Prototype Limitations**

* No objective eye-tracking data is currently captured.  
* The clinician must observe gaze following and document qualitative results outside the system.  
* The system can report only the programmed target sequence, tempo, duration, and completion status.  
* Random mode should initially avoid immediate repeats of the same key, unless engineers need a simpler implementation for the first demo.

## **5.4 INHIBITION CHALLENGE — Response Inhibition**

**Clinical intent.** Practice intentional initiation and inhibition of movement in response to changing visual cues.

| Phase | System behavior | Expected user behavior |
| :---- | :---- | :---- |
| Start | Speak task instruction, for example: “Green means hit. Red means stop. Yellow means wait. Ready, go.” | Attend to instruction and wait for Go. |
| Green cue | A functioning key illuminates green. | Press the illuminated key.  |
| Red cue | A functioning key illuminates red. | Do not press the key. |
| Correct GO response | Record correct response and timestamp. Provide positive visual/audio feedback. | Prepare for next cue. |
| Correct NO-GO response | Record successful inhibition when the configured response window expires with no detectable keypress. | Continue to next cue. |
| Incorrect GO response | User fails to press the green target within the configured response window. Record as missed response. | Prepare for next cue. |
| Incorrect NO-GO response | User presses a functioning key during a red/no-go trial. Record key and timestamp. Provide concise correction feedback | Prepare for next cue. |
| Session completion | After configured trial count, speak completion message and save summary. | Activity ends. |

### **Inhibition Challenge Modes / Variations**

* Increase or decrease cue presentation speed.  
* Adjust the proportion of Go / No-Go / Wait trials.  
* Add conditional rules, such as “Hit only green keys that flash twice.”  
* Future: vary cue meaning or introduce more complex response rules.

**Important implementation note:** This exercise requires a **response window**, even if timeout remains optional for Letter Target and Letter Find. Otherwise the system has no objective point at which it can determine that the user successfully *didn't* press a red key. That's an important functional distinction from the existing activities.

## **5.5 MOTOR SEQUENCE BUILDER — Sequential Motor Planning**

**Clinical intent.** Practice learning, retaining and reproducing intentional movement sequences using letter targets, progressing toward sequences used in spelling. 

| Phase | System behavior | Expected user behavior |
| :---- | :---- | :---- |
| Start | Speak task instruction, for example: “Watch the letters. Then repeat the sequence. Ready, go.” | Attend to the board. |
| Sequence presentation | Illuminate a prescribed sequence of functioning letters one at a time. No user response required during presentation. | Watch and retain the sequence. |
| Sequence completion cue | After the final demonstrated letter, provide a distinct audio cue indicating that the user should begin. “Your turn. Ready, go.” | Begin reproducing the sequence. |
| User response | Record each detectable keypress, key identity and timestamp.  | Press the letters in the demonstrated order. |
| Correct response | Correct key turns green and system speaks the letter. Advance to the next expected letter. | Continue the sequence. |
| Incorrect response | Incorrect functioning key turns red; speak “Try again.” Expected position in the sequence remains active. | Correct the response. |
| Sequence completion | Speak the completed sequence/word and provide positive feedback. | Prepare for next sequence. |
| Progression | Increase sequence length according to clinician-selected or prescribed progression. | Attempt increasingly longer sequences. |
| Session completion | After configured sequence count, speak completion message and save summary. | Activity ends. |

**Motor Sequence Builder Modes / Variations**

* Increase sequence length: 2 → 3 → 4 → 5\.  
* Practice prescribed high-frequency words.  
* Adjust presentation speed.  
* Future: clinician-selected words and unrestricted letter sequences.

# **6\. Prototype Data Requirements \+ Development Phasing**

**Principle.** Capture raw events whenever possible. Summary metrics can be recalculated later; events that were never logged cannot be recovered.

## **6.1.a Required Raw Event Log — Letter Target and Letter Find**

| Field | Definition |
| :---- | :---- |
| **Session ID** | Unique identifier for each activity run. |
| **User ID / demo participant** | Optional for prototype; required if multiple users' histories are retained. |
| **Activity type** | Letter Target or Letter Find. |
| **Session settings** | Audio mode, tempo, content mode, items requested, word-length category. |
| **Item index** | Position within session. |
| **Item type** | Letter or word. |
| **Requested content** | Expected letter or prescribed word. |
| **Trial index** | Letter position within the item. |
| **Expected target** | Correct key for the trial. |
| **Prompt start timestamp** | When spoken instruction begins. |
| **Go timestamp** | When the Go marker finishes; official latency start. |
| **Target display timestamp** | Letter Target only: when expected key turns green. |
| **Keypress timestamp** | Every detectable functioning-key press. |
| **Pressed key** | Identity of functioning key pressed. |
| **Correct / incorrect** | Whether press matched expected target. |
| **First-response latency** | Go to first detectable keypress. |
| **Correct-response latency** | Go to correct keypress. |
| **Incorrect attempts** | Count and ordered list before correct response. |
| **Item completion timestamp** | Final correct letter in item. |
| **Session end reason** | Completed, clinician stopped, system error. |

## **6.1.b Required Raw Event Log — Inhibition Challenge**

| Field | Definition |
| :---- | :---- |
| **Session ID** | Unique identifier for each activity run. |
| **Trial index** | Position of the trial within the session. |
| **Cue type** | Go, No-Go, or Wait condition presented for the trial |
| **Target Key** | Functioning key associated with the current cue. |
| **Cue timestamp** | Time the visual cue is presented; official start point for response timing. |
| **Keypress timestamp** | Time of every detectable functioning-key press during the trial. |
| **Pressed key** | Identity of the functioning key pressed. |
| **Correct / incorrect response** | Whether the user's response matched the rule for the presented cue. |
| **Successful inhibition** | No detectable keypress occurs during a No-Go trial within the configured response window. |
| **Missed Go response** | No correct response occurs during a Go trial within the configured response window. |
| **Response latency** | Elapsed time from cue presentation to detectable keypress on a Go trial. |
| **Session settings** | Cue speed, response window, trial count, cue distribution/rules, audio mode and tempo, as applicable. |

## **6.1.c Required Raw Event Log — Motor Sequence Builder**

| Field | Definition |
| :---- | :---- |
| **Session ID** | Unique identifier for each activity run. |
| **Item / sequence index** | Position of the sequence within the session. |
| **Prescribed sequence** | Ordered set of letters the user is asked to reproduce. |
| **Sequence length** | Number of letters in the prescribed sequence. |
| **Target presentation timestamps** | Time each letter in the demonstrated sequence is illuminated. |
| **Reproduction-start timestamp** | Time the cue to begin reproducing the sequence is given; official start point for response timing. |
| **Expected key by position** | Correct key for each position in the prescribed sequence. |
| **Keypress timestamp** | Time of every detectable functioning-key press during reproduction. |
| **Pressed key** | Identity of the functioning key pressed. |
| **Correct / incorrect response** | Whether each keypress matches the expected key for that position in the sequence. |
| **Incorrect attempts** | Count and ordered list of incorrect functioning-key presses before the correct response. |
| **Inter-key intervals** | Elapsed time between consecutive correct keypresses within the sequence. |
| **Sequence completion time** | Elapsed time from the reproduction-start cue to the final correct keypress in the sequence. |
| **Session settings** | Sequence length, presentation speed, content type, audio mode, tempo and other configured activity settings |

## 

## **6.2 Recommended Calculated Metrics** 

The current prototype does not need to calculate or display every recommended metric in the app. Where possible, it should capture the underlying raw event data needed to calculate those metrics later.

Current prototype \= Black; High-fidelity prototype \= **Blue**

Letter Target (LT), Letter Find (LF), Eye Pong (EP), Inhibition Challenge (IC), Motor Sequence Builder (MSB)

| Metric | Calculation / Use | Activity |
| :---- | :---- | :---- |
| **Item completion rate** | Items completed ÷ items started. | LT, LF |
| **First-attempt accuracy** | Trials correct on first detectable press ÷ total completed trials. | LT, LF |
| **Eventual accuracy** | Trials eventually completed correctly ÷ total trials. Expected to be high when retry-until-correct is used. | LT, LF |
| **Mean first-response latency** | Average Go-to-first-press time. | LT, LF |
| **Mean correct-response latency** | Average Go-to-correct-press time. | LT, LF |
| **Median correct-response latency** | More robust than mean when a few trials are very slow. | LT, LF |
| **Latency variability** | Standard deviation or interquartile range of correct-response latency. | LT, LF |
| **Mean incorrect attempts per trial** | Total incorrect functioning-key presses ÷ completed trials. | LT, LF |
| **Word completion time** | Go-to-final-correct-letter duration, by word and word length. | LT, LF |
| **Inter-key interval** | Time between consecutive correct letters within a word. | LT, LF |
| **Performance by key** | Accuracy and latency for each functioning target. | LT, LF |
| **Performance by cue mode** | Compare music, metronome, and silent conditions. | LT, LF |
| **Performance by tempo** | Compare accuracy and latency at different speeds. | LT, LF |
| **Trend over time** | Compare matched activity/settings across sessions; label as performance trend, not clinical outcome. | All |
| **Go-trial accuracy** | Percentage of Go trials with a correct response within the configured response window. | IC |
| **No-Go inhibition accuracy** | Percentage of No-Go trials with no detectable keypress during the response window. | IC |
| **False-response rate** | Percentage of No-Go trials in which the user presses a key. | IC |
| **Missed-Go rate** | Percentage of Go trials with no correct response within the response window | IC |
| **Mean Go response latency** | Average time from presentation of a Go cue to the correct keypress. | IC |
| **Performance by cue type** | Accuracy and response patterns compared across Go, No-Go and Wait cues. | IC |
| **Performance by cue speed** | Accuracy and response latency compared across different cue speeds. | IC |
| **Sequence completion rate** | Percentage of presented sequences completed correctly. | MSB |
| **First-attempt sequence accuracy** | Percentage of sequence responses completed correctly without an incorrect keypress. | MSB |
| **Accuracy by sequence position** | Accuracy at each position within a sequence. | MSB |
| **Sequence completion time** | Time from the reproduction-start cue to the final correct keypress. | MSB |
| **Inter-key interval** | Average time between consecutive correct keypresses within a sequence. | MSB |
| **Performance by sequence length** | Accuracy and completion time compared across different sequence lengths. | MSB |
| **Longest successfully completed sequence** | Greatest sequence length completed correctly according to the defined success criteria. | MSB |

## **6.3 Data Interpretation Guardrails**

* Do not label performance changes as “improved motor control,” “improved communication,” or a therapeutic outcome without a defined validated measure.  
* Prototype reporting should use objective terms such as faster correct-response latency, higher first-attempt accuracy, fewer detectable errors, or more stable performance.  
* Because nonfunctioning keys are invisible to the system, reported accuracy is accuracy among detectable functioning-key presses, not total physical attempts.  
* Eye Pong must not report saccadic accuracy or gaze improvement until eye-tracking or a validated clinician scoring method is added.

# **7\. Acceptance Criteria**

* Clinician can select any activity implemented in the current build and configure its supported session settings.  
* Each activity plays a clear audio instruction ending with a Go marker.  
* Letter Target visibly cues the expected key; Letter Find does not reveal the expected key before response.  
* Timing starts at the Go marker and stops separately for first detectable press and correct press.  
* All detectable functioning-key presses are timestamped and identified.  
* Incorrect functioning-key presses are recorded and do not advance the target.  
* Correct presses advance the activity according to the selected content.  
* Word activities speak each correct letter and speak the completed word at the end.  
* Session automatically ends after the configured item or target count.  
* Partial data is preserved if the clinician stops a session early.  
* Eye Pong supports fixed alternation and a randomized mode using only functioning keys.  
* Eye Pong reporting does not imply that eye movement was objectively measured.  
* Inhibition Challenge distinguishes Go, No-Go and Wait trials and records both movement and successful inhibition according to the configured response window.  
* Motor Sequence Builder presents a defined sequence before response, records reproduction in order, and supports increasing sequence length.

# **8\. Open Decisions / Engineer Confirmation**

* Confirm whether the software receives distinct key IDs from each functioning key in the current build.  
* Confirm whether red/green feedback can be triggered directly by app logic or requires manual coordination in the demo.  
* Confirm whether a response timeout is feasible in this iteration.  
* Confirm supported tempo range and unit (BPM).  
* Confirm whether music and metronome can be independently selected and whether spoken prompts automatically duck background audio.  
* Confirm whether all raw event timestamps can be stored locally and exported, and in what format (CSV/JSON preferred).

• Confirm whether random Eye Pong should avoid immediate repeats; recommendation: yes for the first implementation.

# **9\. Deferred Requirements**

* Full QWERTY input and unrestricted word libraries.  
* Clinician-created word lists and question/answer content.  
* Per-key tones, vibration, and more complex animated visual cues.  
* Objective eye tracking and gaze-based metrics.  
* Adaptive difficulty based on performance.  
* Validated clinical outcome language and normative comparisons.  
* Cross-session dashboards and longitudinal reporting beyond basic trends.