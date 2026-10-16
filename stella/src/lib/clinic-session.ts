const selectedClinicStorageKey = "stella-selected-clinic-id"

let selectedClinicId = window.localStorage.getItem(selectedClinicStorageKey) ?? ""
const listeners = new Set<() => void>()

export function getSelectedClinicId() {
  return selectedClinicId
}

export function setSelectedClinicId(clinicId: string) {
  if (clinicId === selectedClinicId) return

  selectedClinicId = clinicId

  if (clinicId) {
    window.localStorage.setItem(selectedClinicStorageKey, clinicId)
  } else {
    window.localStorage.removeItem(selectedClinicStorageKey)
  }

  listeners.forEach((listener) => listener())
}

export function subscribeToSelectedClinic(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
