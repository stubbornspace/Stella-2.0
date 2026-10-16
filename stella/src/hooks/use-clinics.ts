import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  addClinicMember,
  createClinic,
  getStellaIdentity,
  listClinicMembers,
  listClinics,
  updateClinicMember,
} from "@/api/clinics"
import type { ClinicMembershipStatus } from "@/types/clinic"

export function useStellaIdentity(enabled = true) {
  return useQuery({
    queryKey: ["stellaIdentity"],
    queryFn: getStellaIdentity,
    enabled,
  })
}

export function useClinics(enabled = true) {
  return useQuery({
    queryKey: ["clinics"],
    queryFn: listClinics,
    enabled,
  })
}

export function useCreateClinic() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => createClinic(name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["clinics"] })
      void queryClient.invalidateQueries({ queryKey: ["stellaIdentity"] })
    },
  })
}

export function useClinicMembers(clinicId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["clinicMembers", clinicId],
    queryFn: () => listClinicMembers(clinicId ?? ""),
    enabled: Boolean(clinicId) && enabled,
  })
}

export function useAddClinicMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { clinicId: string; email: string }) =>
      addClinicMember(input),
    onSuccess: (membership) => {
      void queryClient.invalidateQueries({
        queryKey: ["clinicMembers", membership.clinicId],
      })
      void queryClient.invalidateQueries({ queryKey: ["stellaIdentity"] })
    },
  })
}

export function useUpdateClinicMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      clinicId: string
      status: ClinicMembershipStatus
      userSub: string
    }) => updateClinicMember(input),
    onSuccess: (membership) => {
      void queryClient.invalidateQueries({
        queryKey: ["clinicMembers", membership.clinicId],
      })
      void queryClient.invalidateQueries({ queryKey: ["stellaIdentity"] })
    },
  })
}
