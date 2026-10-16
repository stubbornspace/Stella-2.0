export type ClinicStatus = "active" | "inactive"
export type ClinicRole = "clinic-admin" | "clinician" | "viewer"
export type ClinicMembershipStatus = "active" | "inactive"

export interface Clinic {
  clinicId: string
  name: string
  status: ClinicStatus
  createdAt: string
  createdBy: string
}

export interface ClinicMembership {
  clinicId: string
  clinicName: string
  clinicStatus: ClinicStatus
  userSub: string
  email?: string
  role: ClinicRole
  status: ClinicMembershipStatus
  createdAt: string
  createdBy: string
  updatedAt?: string
  updatedBy?: string
}

export interface StellaIdentity {
  memberships: ClinicMembership[]
  platformAdmin: boolean
  user: {
    displayName: string
    email?: string
    sub: string
  }
}
