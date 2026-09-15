/* eslint-disable react-refresh/only-export-components */
import * as React from "react"

import { initialClinic, mockPatientSeeds } from "@/features/stella/mock-data"
import {
  buildMockResult,
  createHistoryEntry,
  createInitialExerciseConfig,
  createInitialExerciseStates,
  createLatestResultEntry,
  createStaticHistoryEntry,
} from "@/features/stella/session"
import type {
  ActivityType,
  Clinic,
  ExerciseConfig,
  ExerciseResult,
  ExerciseViewState,
  PatientRecord,
} from "@/features/stella/types"

type StellaContextValue = {
  clinic: Clinic
  patients: PatientRecord[]
  updateClinic: (clinic: Clinic) => void
  addPatient: (name: string) => void
  updatePatientExerciseState: (
    patientId: string,
    activity: ActivityType,
    updater: (state: ExerciseViewState) => ExerciseViewState
  ) => void
  setPatientSelectedActivity: (
    patientId: string,
    activity: ActivityType
  ) => void
  recordPatientSessionResult: (
    patientId: string,
    result: ExerciseResult,
    config: ExerciseConfig
  ) => void
}

const StellaContext = React.createContext<StellaContextValue | undefined>(
  undefined
)

export function StellaProvider({ children }: { children: React.ReactNode }) {
  const [clinic, setClinic] = React.useState(initialClinic)
  const [patients, setPatients] = React.useState(createInitialPatients)

  const updateClinic = React.useCallback((nextClinic: Clinic) => {
    setClinic(nextClinic)
  }, [])

  const addPatient = React.useCallback((name: string) => {
    setPatients((currentPatients) => [
      ...currentPatients,
      {
        id: createPatientId(name, currentPatients),
        name,
        totalSessions: 0,
        lastSession: "New patient",
        exerciseTotals: {
          "Letter Target": 0,
          "Letter Find": 0,
          "Eye Pong": 0,
          "Inhibition Challenge": 0,
          "Motor Sequence Builder": 0,
        },
        selectedActivity: "Letter Target",
        exerciseStates: createInitialExerciseStates(),
        latestResult: null,
        history: [],
      },
    ])
  }, [])

  const updatePatient = React.useCallback(
    (patientId: string, updater: (patient: PatientRecord) => PatientRecord) => {
      setPatients((currentPatients) =>
        currentPatients.map((patient) =>
          patient.id === patientId ? updater(patient) : patient
        )
      )
    },
    []
  )

  const updatePatientExerciseState = React.useCallback<
    StellaContextValue["updatePatientExerciseState"]
  >(
    (patientId, activity, updater) => {
      updatePatient(patientId, (patient) => ({
        ...patient,
        exerciseStates: {
          ...patient.exerciseStates,
          [activity]: updater(patient.exerciseStates[activity]),
        },
      }))
    },
    [updatePatient]
  )

  const setPatientSelectedActivity = React.useCallback<
    StellaContextValue["setPatientSelectedActivity"]
  >(
    (patientId, activity) => {
      updatePatient(patientId, (patient) => ({
        ...patient,
        selectedActivity: activity,
      }))
    },
    [updatePatient]
  )

  const recordPatientSessionResult = React.useCallback<
    StellaContextValue["recordPatientSessionResult"]
  >(
    (patientId, result, config) => {
      updatePatient(patientId, (patient) => {
        const entry = createHistoryEntry(result)

        return {
          ...patient,
          totalSessions: patient.totalSessions + 1,
          lastSession: entry.completedAt,
          exerciseTotals: {
            ...patient.exerciseTotals,
            [result.activity]: patient.exerciseTotals[result.activity] + 1,
          },
          latestResult: createLatestResultEntry(
            result,
            config,
            entry.completedAt
          ),
          history: [entry, ...patient.history].slice(0, 8),
        }
      })
    },
    [updatePatient]
  )

  const value = React.useMemo(
    () => ({
      clinic,
      patients,
      updateClinic,
      addPatient,
      updatePatientExerciseState,
      setPatientSelectedActivity,
      recordPatientSessionResult,
    }),
    [
      clinic,
      patients,
      updateClinic,
      addPatient,
      updatePatientExerciseState,
      setPatientSelectedActivity,
      recordPatientSessionResult,
    ]
  )

  return (
    <StellaContext.Provider value={value}>{children}</StellaContext.Provider>
  )
}

export function useStella() {
  const context = React.useContext(StellaContext)

  if (!context) {
    throw new Error("useStella must be used within a StellaProvider")
  }

  return context
}

function createInitialPatients(): PatientRecord[] {
  return mockPatientSeeds.map((seed) => {
    const history = seed.initialHistory.map((entry) =>
      createStaticHistoryEntry(
        seed.patient,
        entry.activity,
        entry.completedAt,
        entry.summary
      )
    )

    const latestResult =
      seed.latestResultActivity && seed.latestResultCompletedAt
        ? createLatestResultEntry(
            buildMockResult(
              seed.patient,
              createInitialExerciseConfig(seed.latestResultActivity),
              false
            ),
            createInitialExerciseConfig(seed.latestResultActivity),
            seed.latestResultCompletedAt
          )
        : null

    return {
      ...seed.patient,
      selectedActivity: "Letter Target",
      exerciseStates: createInitialExerciseStates(),
      latestResult,
      history,
    }
  })
}

function createPatientId(name: string, patients: PatientRecord[]): string {
  const baseId =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "new-patient"

  if (!patients.some((patient) => patient.id === baseId)) {
    return baseId
  }

  let suffix = 2

  while (patients.some((patient) => patient.id === `${baseId}-${suffix}`)) {
    suffix += 1
  }

  return `${baseId}-${suffix}`
}
