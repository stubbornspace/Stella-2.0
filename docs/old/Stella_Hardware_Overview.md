# Stella — Hardware Overview

*Plain-language summary for the product owner. Last updated 2026-09-07.
Companion to `Stella_Software_Architecture_Overview.md`.*

---

## The short version

Stella is a large tactile keyboard for non-verbal children: **3 rows of 10
big 3D-printed buttons**, laid out like a QWERTY keyboard but stacked in
straight columns (Q directly above A, and so on). Each button has:

- a **round colour screen** (about the size of a large coin) that shows the
  button's letter — normally on a blue background, turning **green** when it's
  the target and back to blue once pressed correctly;
- a **switch** underneath for a firm, satisfying press.

Inside is one small Wi-Fi computer chip (a **Raspberry Pi Pico W**) that runs
everything — the screens, the button reading, the spoken prompts, and the
timing. It joins the clinic's Wi-Fi so the **iPad** can connect to it.

---

## What's in the box

```
   30 round letter screens  ──┐
   30 button switches        ──┤     one Raspberry Pi        ┌── speaker + amp
   1 memory card (voice clips)├──►   Pico W chip        ◄────┤
   1 speaker + amplifier     ──┤     (joins clinic Wi-Fi)    └── 5V power supply
   power regulators + wiring ──┘
```

| Part | What it does |
|---|---|
| **30 round screens** (1.28", one per button) | Show the letter; change colour on cue. |
| **30 switches** | One under each button; register the press and its exact timing. |
| **Pico W chip** | The brain. Drives the screens, reads the buttons, plays sound, talks to the iPad over Wi-Fi. |
| **Memory card (microSD)** | Holds the pre-recorded spoken prompts and a copy of each session's data. |
| **Speaker + small amplifier** | Plays the spoken instructions and feedback. |
| **Power supply + regulators** | A 5-volt supply (like a tablet charger, 2–3 amps) feeds three small regulators that share the load and the heat. |
| **Wiring harness** | Ribbon cables and connectors that link all 30 buttons back to the chip. |

A 3D-printed housing holds the buttons and board; that's a separate design track.

---

## How 30 screens run from one small chip

The chip doesn't have enough connections to wire 30 screens individually, so
the design uses two tricks:

1. **One shared cable ("bus").** All 30 screens share the same handful of data
   wires. Only the wire that says *"this message is for screen number 14"*
   changes.
2. **Selector chips (already purchased).** Four small "address" chips turn a few
   connections into 30 individual "you're the one being talked to now" lines.
   The chip updates one screen at a time; because only 1–4 buttons ever change
   at once during an exercise, this happens in a fraction of a second.

The buttons work the same way: they're wired as a **grid** that the chip reads
many times per second. The **timing of every press is measured on the chip
itself**, in real time — never over the Wi-Fi — so network hiccups can't affect
the numbers.

Sound is kept simple: the chip plays the recorded voice clips through the small
amplifier and speaker. Quality is **fine for spoken prompts**, not hi-fi music.

---

## Wiring approach

Each row of 10 buttons gets **one ribbon cable** running its length. At each
button, a connector clips onto the ribbon (no soldering at every point) and taps
off just the wires that button needs. The plan is to **build and fully test one
row of 10 before repeating** for the other two rows — so problems are found on
10 buttons, not 30.

---

## What's built today

| Piece | Status |
|---|---|
| **Working prototype** | 🔨 **4 of 30 buttons** are working on a hand-wired test rig. Wiring complexity was the blocker to scaling up. |
| **Full 30-button plan** | ✅ Complete on paper — every wire, chip pin, and power connection is specified (`full_connection_list.md`). The ribbon-cable + selector-chip approach solves the wiring problem. |
| **Parts purchased** | ✅ Selector chips and power regulators. |
| **Parts still to buy** | ⏳ Speaker, amplifier, memory-card holder. |
| **On-chip software** | 🔨 Scaffolded — the exercise logic is done and shared with the simulator; the parts that drive the real screens, sound, buttons and Wi-Fi are in progress. |
| **Physical harness** | ⏳ Not yet built. |
| **Housing / 3D prints** | Separate track, not covered here. |

A detailed parts list is in `bill_of_materials.xlsx`.

---

## Key decisions already made

- **All 30 button positions get a screen and a switch.** 26 are letters; the
  other 4 are wired and **reserved for future function keys** (space, yes/no,
  enter — to be decided).
- The **old separate USB keyboard-controller board is removed.** The exercise
  system replaces what it did; each button now connects only to the Pico.
- **Power comes from a 5-volt supply**, not 12 volts — keeps the regulators cool
  without heatsinks. Three regulators (one per row) spread the heat, and the
  grounding is arranged so the screens don't disturb the signal wiring.
- The chip **joins the clinic's existing Wi-Fi** as a normal device (rather than
  creating its own network), so the iPad keeps internet access at the same time.
- **Timing is measured on the keyboard**, not over the network.

---

## Things to be aware of

- **The chip's connections are fully used.** There's no spare capacity for extra
  hardware without reworking something already assigned. New features that need
  new wiring should be planned deliberately.
- **Spoken-audio quality is "clear speech," not music quality.** If richer audio
  is ever wanted, that's a small added board later.
- **One hardware revision should be expected** — building the first full
  30-button unit will surface things to adjust (screen orientation, exact wire
  routing, power draw at full load).
- **Power and heat need to be checked at full scale.** The 4-button rig doesn't
  stress the supply; the 30-button build will.

---

## Open questions for you

1. **Reserved keys** — any intended use for the 4 non-letter button positions
   (space, yes/no, enter, backspace…)?
2. **Voice recordings** — who records the real spoken prompts, and any wording
   changes? (A placeholder computer voice is in place now.)
3. **How many units** are needed for the pilot, and by when? That drives whether
   the wiring stays hand-assembled or moves to a printed circuit board.
4. **Housing / button feel** — is the current 3D-printed button and switch feel
   approved, or still being iterated?
