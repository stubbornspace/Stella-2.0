import type {
  ActivitySlug,
  ActivityType,
  Clinic,
  ExerciseDefinition,
  MockPatientSeed,
  ReportSlug,
} from "@/features/stella/types"

export const activityOrder: ActivityType[] = [
  "Letter Target",
  "Letter Find",
  "Eye Pong",
  "Inhibition Challenge",
  "Motor Sequence Builder",
]

export const activitySlugs: Record<ActivityType, ActivitySlug> = {
  "Letter Target": "letter-target",
  "Letter Find": "letter-find",
  "Eye Pong": "eye-pong",
  "Inhibition Challenge": "inhibition-challenge",
  "Motor Sequence Builder": "motor-sequence-builder",
}

export const allExercisesReportSlug: ReportSlug = "all-exercises"

export const exerciseDefinitions: Record<ActivityType, ExerciseDefinition> = {
  "Letter Target": {
    id: "Letter Target",
    purpose: "Practice intentional target selection with a visual key cue.",
    description:
      "The user waits for the spoken start cue and then presses the key shown in green. In word mode, each highlighted letter is completed in sequence.",
  },
  "Letter Find": {
    id: "Letter Find",
    purpose: "Practice translating an auditory instruction into key selection.",
    description:
      "The user listens for a spoken letter or word and responds without a visual target cue. The exercise focuses on auditory instruction and key selection.",
  },
  "Eye Pong": {
    id: "Eye Pong",
    purpose: "Support clinician-observed visual tracking across lit targets.",
    description:
      "The user follows illuminated targets with their eyes as they move across the board. Pattern and tempo settings control the pacing of visual tracking.",
    disclaimer:
      "Clinician-observed only. Do not treat this as objective eye-tracking.",
  },
  "Inhibition Challenge": {
    id: "Inhibition Challenge",
    purpose: "Practice intentional initiation and inhibition of movement.",
    description:
      "The user responds only to the correct cue: green means press, red means stop, and yellow means wait. The response window helps distinguish correct inhibition from missed actions.",
  },
  "Motor Sequence Builder": {
    id: "Motor Sequence Builder",
    purpose: "Practice retaining and reproducing multi-step letter sequences.",
    description:
      "The user watches the full sequence first and then repeats it in order. Difficulty increases by extending sequence length and presentation demands.",
  },
}

export const initialClinic: Clinic = {
  name: "North Bay Rehab",
  doctorName: "Dr. Maya Ross",
  address: "410 Harbor Lane, San Rafael, CA",
}

export const mockPatientSeeds: MockPatientSeed[] = [
  {
    patient: {
      id: "lena-ortiz",
      name: "Lena Ortiz",
      totalSessions: 60,
      lastSession: "Today",
      exerciseTotals: {
        "Letter Target": 14,
        "Letter Find": 12,
        "Eye Pong": 10,
        "Inhibition Challenge": 11,
        "Motor Sequence Builder": 13,
      },
    },
    latestResultActivity: "Eye Pong",
    latestResultCompletedAt: "Today",
    initialHistory: [
      {
        activity: "Eye Pong",
        completedAt: "Today",
        summary:
          "Completed a full visual tracking run with alternating targets.",
      },
      {
        activity: "Inhibition Challenge",
        completedAt: "Yesterday",
        summary:
          "Completed a balanced Go / Stop session within the response window.",
      },
      {
        activity: "Letter Find",
        completedAt: "3 days ago",
        summary: "Completed spoken word prompts with steady auditory recall.",
      },
      {
        activity: "Motor Sequence Builder",
        completedAt: "Last week",
        summary:
          "Completed longer observe-then-repeat sequences without stopping early.",
      },
      {
        activity: "Letter Target",
        completedAt: "2 weeks ago",
        summary: "Completed guided target selection with visual cueing.",
      },
    ],
  },
  {
    patient: {
      id: "noah-kim",
      name: "Noah Kim",
      totalSessions: 9,
      lastSession: "2 days ago",
      exerciseTotals: {
        "Letter Target": 3,
        "Letter Find": 4,
        "Eye Pong": 1,
        "Inhibition Challenge": 0,
        "Motor Sequence Builder": 2,
      },
    },
    initialHistory: [
      {
        activity: "Letter Find",
        completedAt: "2 days ago",
        summary: "Completed 4 spoken word prompts with metronome support.",
      },
      {
        activity: "Letter Target",
        completedAt: "Last week",
        summary: "Completed guided letter targets with visible cueing.",
      },
      {
        activity: "Motor Sequence Builder",
        completedAt: "2 weeks ago",
        summary: "Completed short repeat-after-watch sequences.",
      },
    ],
  },
  {
    patient: {
      id: "mia-chen",
      name: "Mia Chen",
      totalSessions: 0,
      lastSession: "New patient",
      exerciseTotals: {
        "Letter Target": 0,
        "Letter Find": 0,
        "Eye Pong": 0,
        "Inhibition Challenge": 0,
        "Motor Sequence Builder": 0,
      },
    },
    initialHistory: [],
  },
  {
    patient: {
      id: "oliver-james",
      name: "Oliver James",
      totalSessions: 6,
      lastSession: "Last week",
      exerciseTotals: {
        "Letter Target": 1,
        "Letter Find": 2,
        "Eye Pong": 1,
        "Inhibition Challenge": 1,
        "Motor Sequence Builder": 3,
      },
    },
    initialHistory: [
      {
        activity: "Letter Find",
        completedAt: "2 days ago",
        summary: "Completed 4 spoken word prompts with metronome support.",
      },
      {
        activity: "Letter Target",
        completedAt: "Last week",
        summary: "Completed guided letter targets with visible cueing.",
      },
      {
        activity: "Motor Sequence Builder",
        completedAt: "2 weeks ago",
        summary: "Completed short repeat-after-watch sequences.",
      },
    ],
  },
]
