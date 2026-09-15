# **✅ STELLA PROOF OF CONCEPT METRICS**

*(Developer Implementation List)*

Organized by category with plain definitions.

Capture letter-selection events during spelling tasks and calculate accuracy, response timing, rhythm consistency, directional error patterns, sequence performance, and engagement duration at the session level.

---

## **1️⃣ ACCURACY (Targeting During Spelling)**

**Purpose:** Is motor targeting becoming more reliable?

Track per session:

* **Total attempts**  
   Number of letter/button selections attempted.

* **Correct hits**  
   Number of intended targets successfully selected.

* **Accuracy (%)**  
   Correct hits ÷ total attempts.

* **First-attempt success rate (%)**  
   Correct selections made without correction.

* **Miss distance (optional if easy)**  
   Distance from intended target when incorrect.

---

## **2️⃣ RESPONSE TIMING (Intent → Movement)**

**Purpose:** Is initiating movement becoming easier?

Track per attempt:

* **Response latency (ms)**  
   Time from prompt presentation → movement start.

Track per session:

* **Average response latency**

* **Latency variability (std deviation)**

---

## **3️⃣ RHYTHM / TIMING CONSISTENCY**

**Purpose:** Is motor output becoming regulated?

(Only when beat/metronome/music active.)

Track per attempt:

* **Timing offset from beat (ms)**  
   Early or late relative to beat.

Track per session:

* **On-beat accuracy (%)**

* **Timing variability (std deviation)**

---

## **4️⃣ DIRECTIONAL CONSISTENCY (Motor Planning Stability)**

**Purpose:** Are errors becoming predictable instead of random?

Track per session:

* **Error direction classification**

  * left

  * right

  * above

  * below

  * random

* **Directional consistency (%)**  
   Percentage of errors occurring in same direction pattern.

(Simple rule: repeated bias \= consistent.)

---

## **5️⃣ SEQUENCE PERFORMANCE (Spelling-Specific — IMPORTANT)**

**Purpose:** Measure motor control within spelling sequences.

Track:

* **Letters completed per sequence**

* **Sequence completion rate (%)**

* **Breakdown point**  
   (Which letter errors typically begin.)

---

## **6️⃣ SESSION ENGAGEMENT**

**Purpose:** Regulation \+ endurance indicators.

Track:

* **Active engagement time (minutes)**

* **Total session duration**

* **Attempts per minute**

* **Pause/break count (optional)**

---

## **7️⃣ SESSION SUMMARY METRICS (AUTO-CALCULATED)**

Developer computes automatically:

* Accuracy %

* Avg response latency

* Timing consistency score

* Directional consistency score

* Engagement duration

(No interpretation logic yet.)

## **8️⃣ RHYTHM ALIGNMENT (ONLY WHEN BEAT ACTIVE)**

### **Capture per attempt:**

* **Beat timestamp**  
   (When the beat occurs)

* **Selection timestamp**  
   (Already captured)

# **MINIMUM DATA REQUIRED PER ATTEMPT**

Your developer only needs to capture this event structure:

`timestamp`  
`target_letter`  
`selected_location`  
`correct_or_incorrect`  
`movement_start_time`  
`selection_time`  
`beat_timestamp (if active)`  
`sequence_id`

### THIS WAS ADDED AFTER THAT LIST TO INCLUDE THE MUSIC

### **Auto-calculated metrics:**

#### **Beat Offset (ms)**

`selection_time − nearest_beat_time`

Negative \= early  
Positive \= late

---

#### **On-Beat Window (%)**

Percentage of selections occurring within ±X ms of beat  
 (start with ±150 ms)

---

#### **Timing Variability**

Standard deviation of beat offsets.

---

# **Developer Implementation (Simple)**

Add two fields:

`beat_active (true/false)`  
`beat_timestamp`

No audio processing required.

