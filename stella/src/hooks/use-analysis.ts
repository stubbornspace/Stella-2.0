import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  generatePatientAnalysis,
  getPatientAnalysis,
} from "@/api/analysis"

export function usePatientAnalysis(patientId: string | undefined) {
  return useQuery({
    queryKey: ["patientAnalysis", patientId],
    queryFn: () => getPatientAnalysis(patientId ?? ""),
    enabled: Boolean(patientId),
  })
}

export function useGeneratePatientAnalysis() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (patientId: string) => generatePatientAnalysis(patientId),
    onSuccess: (analysis) => {
      void queryClient.setQueryData(
        ["patientAnalysis", analysis.patientId],
        analysis
      )
    },
  })
}
