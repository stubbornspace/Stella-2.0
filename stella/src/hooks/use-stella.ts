import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  createPatient,
  getDashboardStats,
  getExerciseSessions,
  getPatient,
  getPatientSessions,
  getPatients,
  saveExerciseRun,
  type CreatePatientInput,
} from "@/api/stella"
import type { ExerciseType } from "@/types"
import type { SaveExerciseRunInput } from "@/types/exercise-control"

export function usePatients() {
  return useQuery({
    queryKey: ["patients"],
    queryFn: getPatients,
  })
}

export function usePatient(patientId: string | undefined) {
  return useQuery({
    queryKey: ["patient", patientId],
    queryFn: () => getPatient(patientId ?? ""),
    enabled: Boolean(patientId),
  })
}

export function usePatientSessions(patientId: string | undefined) {
  return useQuery({
    queryKey: ["patientSessions", patientId],
    queryFn: () => getPatientSessions(patientId ?? ""),
    enabled: Boolean(patientId),
  })
}

export function useExerciseSessions(
  patientId: string | undefined,
  exerciseType: ExerciseType | undefined
) {
  return useQuery({
    queryKey: ["exerciseSessions", patientId, exerciseType],
    queryFn: () =>
      getExerciseSessions(patientId ?? "", exerciseType ?? "letter-target"),
    enabled: Boolean(patientId && exerciseType),
  })
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboardStats"],
    queryFn: getDashboardStats,
  })
}

export function useCreatePatient() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreatePatientInput) => createPatient(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["patients"] })
      void queryClient.invalidateQueries({ queryKey: ["dashboardStats"] })
    },
  })
}

export function useSaveExerciseRun() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: SaveExerciseRunInput) => saveExerciseRun(input),
    onSuccess: (session) => {
      void queryClient.invalidateQueries({ queryKey: ["patients"] })
      void queryClient.invalidateQueries({ queryKey: ["dashboardStats"] })
      void queryClient.invalidateQueries({
        queryKey: ["patientSessions", session.patientId],
      })
      void queryClient.invalidateQueries({
        queryKey: ["exerciseSessions", session.patientId, session.activity],
      })
    },
  })
}
