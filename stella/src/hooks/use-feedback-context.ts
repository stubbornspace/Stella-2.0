import { matchPath, useLocation } from "react-router-dom"

export function useFeedbackContext() {
  const location = useLocation()
  const searchParams = new URLSearchParams(location.search)
  const exerciseMatch = matchPath(
    "/patients/:patientId/exercises/:exerciseType",
    location.pathname
  )
  const patientMatch = matchPath("/patients/:patientId", location.pathname)

  if (exerciseMatch?.params.patientId && exerciseMatch.params.exerciseType) {
    return {
      pageKey: "exercise-details",
      pageLabel: "Exercise details",
      routePath: "/patients/:patientId/exercises/:exerciseType",
    }
  }

  if (patientMatch?.params.patientId) {
    const tab =
      searchParams.get("tab") === "exercise-control"
        ? "exercise-control"
        : "dashboard"

    if (tab === "exercise-control") {
      return {
        pageKey: "exercise-control",
        pageLabel: "Exercise control",
        routePath: "/patients/:patientId?tab=exercise-control",
        tab,
      }
    }

    return {
      pageKey: "patient-summary",
      pageLabel: "Patient summary",
      routePath: "/patients/:patientId",
      tab,
    }
  }

  return {
    pageKey: "patient-list",
    pageLabel: "Patient list",
    routePath: "/",
  }
}
