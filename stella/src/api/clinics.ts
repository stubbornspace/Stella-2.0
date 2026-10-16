import { getValidIdToken } from "@/lib/auth"
import { getRuntimeConfig } from "@/lib/runtime-config"
import type {
  Clinic,
  ClinicMembership,
  ClinicMembershipStatus,
  StellaIdentity,
} from "@/types/clinic"

const localClinicsStorageKey = "stella-poc-clinics"
const localMembershipsStorageKey = "stella-poc-clinic-memberships"
const localDemoClinic: Clinic = {
  clinicId: "clinic-stella-demo",
  name: "Stella Demo Clinic",
  status: "active",
  createdAt: "2026-09-15T12:00:00.000Z",
  createdBy: "local-poc-user",
}

function remoteEnabled() {
  const config = getRuntimeConfig()
  return Boolean(config.auth.enabled && config.api.baseUrl)
}

async function remoteRequest<T>(path: string, init?: RequestInit) {
  const config = getRuntimeConfig()
  const idToken = await getValidIdToken()

  if (!config.api.baseUrl || !idToken) {
    throw new Error("Stella clinic API is not configured for this session.")
  }

  const response = await fetch(`${config.api.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as
      { message?: string } | undefined
    throw new Error(body?.message || "Clinic request failed.")
  }

  return (await response.json()) as T
}

function readLocalClinics() {
  const raw = window.localStorage.getItem(localClinicsStorageKey)
  if (!raw) return [localDemoClinic]

  try {
    const clinics = JSON.parse(raw) as Clinic[]
    return clinics.some(
      (clinic) => clinic.clinicId === localDemoClinic.clinicId
    )
      ? clinics
      : [localDemoClinic, ...clinics]
  } catch {
    return [localDemoClinic]
  }
}

function readLocalMemberships() {
  const raw = window.localStorage.getItem(localMembershipsStorageKey)
  if (!raw) return [] as ClinicMembership[]

  try {
    return JSON.parse(raw) as ClinicMembership[]
  } catch {
    return []
  }
}

export async function getStellaIdentity(): Promise<StellaIdentity> {
  if (remoteEnabled()) return remoteRequest<StellaIdentity>("/me")

  return {
    memberships: [
      {
        clinicId: localDemoClinic.clinicId,
        clinicName: localDemoClinic.name,
        clinicStatus: "active",
        userSub: "local-poc-user",
        role: "clinic-admin",
        status: "active",
        createdAt: localDemoClinic.createdAt,
        createdBy: "local-poc-user",
      },
    ],
    platformAdmin: true,
    user: { displayName: "Local POC User", sub: "local-poc-user" },
  }
}

export async function listClinics(): Promise<Clinic[]> {
  return remoteEnabled()
    ? remoteRequest<Clinic[]>("/admin/clinics")
    : readLocalClinics()
}

export async function createClinic(name: string): Promise<Clinic> {
  if (remoteEnabled()) {
    return remoteRequest<Clinic>("/admin/clinics", {
      method: "POST",
      body: JSON.stringify({ name }),
    })
  }

  const clinic: Clinic = {
    clinicId: `clinic-${window.crypto.randomUUID()}`,
    name: name.trim(),
    status: "active",
    createdAt: new Date().toISOString(),
    createdBy: "local-poc-user",
  }
  window.localStorage.setItem(
    localClinicsStorageKey,
    JSON.stringify([...readLocalClinics(), clinic])
  )
  return clinic
}

export async function listClinicMembers(clinicId: string) {
  return remoteEnabled()
    ? remoteRequest<ClinicMembership[]>(`/admin/clinics/${clinicId}/members`)
    : readLocalMemberships().filter(
        (membership) => membership.clinicId === clinicId
      )
}

export async function addClinicMember(input: {
  clinicId: string
  email: string
}) {
  if (remoteEnabled()) {
    return remoteRequest<ClinicMembership>(
      `/admin/clinics/${input.clinicId}/members`,
      {
        method: "POST",
        body: JSON.stringify({ email: input.email }),
      }
    )
  }

  const clinic = readLocalClinics().find(
    (item) => item.clinicId === input.clinicId
  )
  const membership: ClinicMembership = {
    clinicId: input.clinicId,
    clinicName: clinic?.name ?? "Unknown clinic",
    clinicStatus: clinic?.status ?? "active",
    userSub: `local-${input.email.toLowerCase()}`,
    email: input.email.trim().toLowerCase(),
    role: "clinician",
    status: "active",
    createdAt: new Date().toISOString(),
    createdBy: "local-poc-user",
  }
  const memberships = [
    membership,
    ...readLocalMemberships().filter(
      (item) =>
        item.clinicId !== membership.clinicId ||
        item.userSub !== membership.userSub
    ),
  ]
  window.localStorage.setItem(
    localMembershipsStorageKey,
    JSON.stringify(memberships)
  )
  return membership
}

export async function updateClinicMember(input: {
  clinicId: string
  status: ClinicMembershipStatus
  userSub: string
}) {
  if (remoteEnabled()) {
    return remoteRequest<ClinicMembership>(
      `/admin/clinics/${input.clinicId}/members/${encodeURIComponent(input.userSub)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ status: input.status }),
      }
    )
  }

  const memberships = readLocalMemberships()
  const membershipIndex = memberships.findIndex(
    (membership) =>
      membership.clinicId === input.clinicId &&
      membership.userSub === input.userSub
  )

  if (membershipIndex < 0) {
    throw new Error("Clinic member not found.")
  }

  const membership: ClinicMembership = {
    ...memberships[membershipIndex],
    role: "clinician",
    status: input.status,
    updatedAt: new Date().toISOString(),
    updatedBy: "local-poc-user",
  }
  memberships[membershipIndex] = membership
  window.localStorage.setItem(
    localMembershipsStorageKey,
    JSON.stringify(memberships)
  )
  return membership
}
