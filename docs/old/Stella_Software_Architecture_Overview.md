# Stella — Software Architecture Overview

*Plain-language summary for the product owner. Last updated 2026-09-06.*

---

## The short version

Three pieces of software work together:

1. **The keyboard's built-in app** — runs on the small computer chip (a
   Raspberry Pi Pico W) inside the keyboard. It drives the letter displays,
   listens for button presses, plays the spoken prompts, and measures timing.
2. **The clinician app** — opens in a web browser on an **iPad**. These are the
   screens the clinician uses to choose an exercise, set it up, start and stop
   it, and see results. A collaborator is building this; its look matches the
   demo at `abc.stellaempowers.com`.
3. **A cloud service (optional, later)** — clinician logins, patient history
   over time, and an owner's view across all clinics. Designed on paper, not
   built.

The keyboard and the iPad talk to each other over the clinic's **normal
Wi-Fi**. No internet connection is needed to run an exercise.

---

## How one session works

1. The clinician opens the app on the iPad and picks an exercise:
   **Letter Target**, **Letter Find**, or **Eye Pong**.
2. They set the options — how many letters or words, single letters vs. spelling
   words, background sound (none / metronome / music), and tempo — then press
   **Start**.
3. The keyboard speaks the instruction, ending on the word "Go". For Letter
   Target it also lights the target key green.
4. The child responds. A correct press turns the key green and the keyboard
   speaks the letter; a wrong press turns it red and says "Try again" — the
   target stays until the child gets it right.
5. This repeats for each letter / word. The keyboard speaks completed words and
   gives encouragement.
6. After the set number of items the session ends automatically (the clinician
   can also stop early — nothing already done is lost).
7. The **Results** screen shows the numbers, and the session can be exported as
   a spreadsheet (CSV) or a data file (JSON).

---

## The three exercises

| Exercise | What the child does | What it exercises |
|---|---|---|
| **Letter Target** | The target key lights green — find and press the green key. | Deliberate targeting with a visual cue. |
| **Letter Find** | Only a spoken instruction ("press the letter A"); nothing lights up first. | Turning a heard instruction into a visual search and a press. |
| **Eye Pong** | A light moves from key to key; the child follows it with their eyes. No pressing. | Visual tracking. The clinician observes and notes results. |

---

## What gets measured and saved

The keyboard records the **raw events** of every session — which key was the
target, the exact moment the instruction finished ("Go"), every button press
and its timing, whether each press was right or wrong, and so on.

From those raw events it calculates:

- how many items were completed
- accuracy on the first try, and accuracy overall
- reaction times — average, typical (median), and how consistent they were
- average wrong attempts per letter
- a per-letter breakdown
- for words: time to complete each word and the gap between letters

**Important framing:** these are described as **performance measures** — faster
reaction time, higher accuracy, fewer errors, steadier results — and
**not** as medical or clinical outcomes. Eye Pong specifically does **not**
claim to measure eye movement; it only reports the light pattern that was
shown.

---

## What is built today

| Piece | Status |
|---|---|
| **Simulator** — the full clinician app plus a clickable on-screen keyboard, running on a laptop with no hardware. All three exercises work end to end, with the results screen and exports. | ✅ Working — this is what we use to review the design with you and make changes quickly. |
| **Spoken prompts** — a full set of voice clips. | ✅ Generated (computer voice) — to be replaced with real recordings. |
| **Behaviour specification** — one written definition that both the simulator and the real keyboard follow, so they can't drift apart. | ✅ Written. |
| **Keyboard firmware** — the software that runs on the chip. | 🔨 The wiring plan for all 30 keys is complete; the on-chip software is scaffolded and in progress. |
| **Clinician app on the iPad** | 🔨 Being built by the collaborator against the same spec / demo. |
| **Cloud service** | ⏳ Designed on paper (see below); not built. |

---

## How the pieces connect

```
   ┌─────────────────────┐        clinic Wi-Fi         ┌──────────────────────┐
   │   Stella keyboard    │ ◄──────────────────────────►│  iPad — clinician app │
   │  (Pico W + displays  │   live control + updates    │  (browser)            │
   │   + switches + audio) │                             └──────────┬───────────┘
   └─────────────────────┘                                         │
                                                     after a session, upload
                                                                   │
                                                          ┌────────▼─────────┐
                                                          │  Cloud service   │  (optional)
                                                          │  logins, history │
                                                          └──────────────────┘
```

- The keyboard hosts the clinician app and answers it directly over Wi-Fi, so
  the app works even with no internet.
- The keyboard does all timing **on itself**, in real time, and sends only the
  finished measurements — network delays never affect the numbers.
- If the cloud service is added, the **iPad** uploads each finished session to
  it (an ordinary secure web request), and keeps a local copy to retry if the
  internet is briefly down.

---

## The cloud option

If you want clinician logins, per-patient history and trend charts, and your own
view across every clinic, that is a separate hosted service. In outline:

- Clinicians log in; each sees their own patients. You get an owner view of
  everything.
- After each session the iPad syncs the results up; the service stores them and
  draws history / trend charts from the same numbers the device already
  computes.
- **The biggest decision** is whether it stores information that identifies a
  patient (name, date of birth). If it does, health-privacy rules (HIPAA in the
  US) apply — more cost, legal agreements with each clinic, and a security
  review. If it stores only an **anonymous code** for each patient (the clinic
  keeps the name-to-code list), it can be an ordinary online service.
- Rough running cost: **~$50–150/month** for the simple anonymous version, plus
  development time (a few months). The privacy-compliant version is meaningfully
  more (hundreds/month plus one-time legal and security spend).

Full detail: `docs/cloud-architecture.md`.

---

## Key decisions already made

- Companion device is the **iPad**.
- The keyboard **joins the clinic's existing Wi-Fi** (rather than making its own
  network), so the iPad keeps internet access for syncing.
- The separate USB keyboard-controller board has been **removed** — the exercise
  system covers what it did.
- All timing is measured **on the keyboard**, not over the network.
- The design targets **all 30 key positions working** (26 letters plus 4
  positions wired and reserved for future function keys). A 4-key bench version
  exists today for testing.

---

## Open questions for you

1. **Voice recordings** — who records the real spoken prompts, and any changes
   to the wording? (The current script is in the specification.)
2. **Exercise scope** — do all three exercises need to be in the first hardware
   build, or do we start with Letter Target and add the others later?
3. **Reserved keys** — the 4 non-letter key positions are wired and available.
   Any intended use (space, yes/no, enter, …)?
4. **Cloud service** — is it needed for the pilot, and if so, does it need to
   hold patient-identifying information or can it use anonymous codes?
5. **Metronome vs. music** — the prototype plays one background sound at a time
   (none / metronome / music). Is that enough, or do you need them layered?
