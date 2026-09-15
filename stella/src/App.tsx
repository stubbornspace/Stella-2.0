import { useEffect, useState } from "react"
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom"
import {
  ArrowLeft,
  Clock3,
  Edit3,
  Info,
  Moon,
  Settings,
  Sun,
} from "lucide-react"

import { DialogShell } from "@/components/dialog-shell"
import { useTheme } from "@/components/theme-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import {
  activityOrder,
  allExercisesReportSlug,
  exerciseDefinitions,
} from "@/features/stella/mock-data"
import {
  buildMockResult,
  getActivityFromSlug,
  getActivityReportMetrics,
  getActivityTrendCharts,
  getAggregateReportMetrics,
  getAggregateTrendCharts,
  getConfigDetails,
  getLetterExerciseSummaryMetrics,
  getReportPath,
  getResultMetrics,
  getRunningDetailSections,
  getRunningSnapshot,
  getSessionPath,
  getStartingProgress,
} from "@/features/stella/session"
import { StellaProvider, useStella } from "@/features/stella/state"
import type {
  ActivityType,
  ChoiceOption,
  Clinic,
  ExerciseConfig,
  ExerciseDefinition,
  ExerciseResult,
  IconLabelValueProps,
  LatestResultEntry,
  PatientRecord,
  ResultMetric,
  SessionHistoryEntry,
  TrendChartDefinition,
} from "@/features/stella/types"

function App() {
  return (
    <StellaProvider>
      <div className="min-h-svh bg-[linear-gradient(180deg,hsl(from_var(--background)_h_s_l),hsl(from_var(--muted)_h_s_l_/_0.28))] px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto flex min-h-[calc(100svh-2.5rem)] max-w-6xl flex-col gap-5">
          <AppHeader />
          <Routes>
            <Route path="/" element={<ClinicLandingPage />} />
            <Route path="/setup" element={<ClinicSetupPage />} />
            <Route path="/patients/:patientId" element={<PatientPage />} />
            <Route
              path="/patients/:patientId/exercises"
              element={<PatientPage />}
            />
            <Route
              path="/patients/:patientId/reports/:reportSlug"
              element={<PatientReportPage />}
            />
            <Route
              path="/patients/:patientId/exercises/session/:activitySlug"
              element={<PatientSessionPage />}
            />
            <Route path="*" element={<Navigate replace to="/" />} />
          </Routes>
        </div>
      </div>
    </StellaProvider>
  )
}

function ClinicLandingPage() {
  const { patients } = useStella()

  return (
    <>
      <ClinicOverview patients={patients} />
      <PatientsList patients={patients} />
    </>
  )
}

function AppHeader() {
  const location = useLocation()
  const navigate = useNavigate()
  const [isInfoOpen, setIsInfoOpen] = useState(false)
  const { theme, setTheme } = useTheme()
  const isPatientPage = location.pathname.startsWith("/patients/")
  const isSetupPage = location.pathname === "/setup"
  const currentTheme = theme === "dark" ? "dark" : "light"

  return (
    <>
      <Card className="rounded-none border-0 border-b border-border/60 bg-transparent shadow-none">
        <CardContent className="flex items-center justify-between p-0 pb-4">
          <div className="flex items-center gap-2">
            <div className="text-2xl font-semibold tracking-tight text-[#c6a637] sm:text-3xl">
              Welcome to Stella
            </div>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Open app information"
              onClick={() => setIsInfoOpen(true)}
              className="text-muted-foreground hover:bg-transparent hover:text-foreground"
            >
              <Info className="size-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {isPatientPage ? (
              <Button variant="outline" size="sm" onClick={() => navigate("/")}>
                <ArrowLeft className="mr-2 size-4" />
                Patients
              </Button>
            ) : isSetupPage ? (
              <Button variant="outline" size="sm" onClick={() => navigate("/")}>
                <ArrowLeft className="mr-2 size-4" />
                Clinic
              </Button>
            ) : null}
            <button
              type="button"
              aria-label={
                currentTheme === "light"
                  ? "Switch to dark theme"
                  : "Switch to light theme"
              }
              onClick={() =>
                setTheme(currentTheme === "light" ? "dark" : "light")
              }
              className="flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {currentTheme === "light" ? (
                <Moon className="size-5" />
              ) : (
                <Sun className="size-5" />
              )}
            </button>
            <button
              type="button"
              aria-label="Settings"
              onClick={() => navigate("/setup")}
              className="flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Settings className="size-5" />
            </button>
          </div>
        </CardContent>
      </Card>
      <AppInfoDialog open={isInfoOpen} onOpenChange={setIsInfoOpen} />
    </>
  )
}

function AppInfoDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title="Stella overview"
      description="Summary of the prototype app and the workflow in this build."
      titleId="app-info-title"
      maxWidthClassName="max-w-2xl"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <InfoSection
          title="App summary"
          body="This prototype focuses on a single clinic workflow with patient selection, per-patient dashboards, exercise setup, in-session views, and session result review."
        />
        <InfoSection
          title="Clinic workflow"
          body="Clinicians land on the clinic page, review patients, open a patient record, inspect progress, and configure or launch exercise sessions from the Exercises tab."
        />
        <InfoSection
          title="Exercise model"
          body="The build distinguishes Letter Target, Letter Find, Eye Pong, Inhibition Challenge, and Motor Sequence Builder to preserve the prototype requirements and reporting differences."
        />
        <InfoSection
          title="Session review"
          body="Completing or stopping a session returns the user to the patient dashboard, where the latest result is highlighted and recent exercise history is grouped by summary and exercise tabs."
        />
      </div>
    </DialogShell>
  )
}

function InfoSection({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-2 text-sm leading-6 text-muted-foreground">{body}</div>
    </div>
  )
}

function ClinicSetupPage() {
  const navigate = useNavigate()
  const { patients } = useStella()
  const [readiness, setReadiness] = useState({
    keyboardReady: true,
    networkReady: true,
    workflowReviewed: false,
  })
  const clinicMetrics = getClinicMetrics(patients)

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader>
          <CardTitle>Clinic operations</CardTitle>
          <CardDescription>
            Lightweight clinic metrics and readiness checks for the prototype.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
          <div className="grid gap-4">
            <Card className="border-border/60 bg-background/70 shadow-none">
              <CardHeader>
                <CardTitle className="text-lg">Clinic metrics</CardTitle>
                <CardDescription>
                  Patient count and total sessions across each exercise.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <InfoTile
                  label="Patients"
                  value={`${clinicMetrics.patientCount}`}
                />
                {clinicMetrics.activityMetrics.map((metric) => (
                  <InfoTile
                    key={metric.activity}
                    label={metric.activity}
                    value={`${metric.sessions} sessions`}
                  />
                ))}
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-background/70 shadow-none">
              <CardHeader>
                <CardTitle className="text-lg">Launch readiness</CardTitle>
                <CardDescription>
                  Checklist for the first clinic activation.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <SetupToggleRow
                  label="Keyboard and Raspberry Pi are ready"
                  description="Confirm the prototype device is connected and available."
                  active={readiness.keyboardReady}
                  onToggle={() =>
                    setReadiness((current) => ({
                      ...current,
                      keyboardReady: !current.keyboardReady,
                    }))
                  }
                />
                <SetupToggleRow
                  label="Web access and network are ready"
                  description="Confirm the clinic can access the web app and backend."
                  active={readiness.networkReady}
                  onToggle={() =>
                    setReadiness((current) => ({
                      ...current,
                      networkReady: !current.networkReady,
                    }))
                  }
                />
                <SetupToggleRow
                  label="Staff workflow reviewed"
                  description="Confirm the team understands patient selection and session review."
                  active={readiness.workflowReviewed}
                  onToggle={() =>
                    setReadiness((current) => ({
                      ...current,
                      workflowReviewed: !current.workflowReviewed,
                    }))
                  }
                />
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/60 bg-background/70 shadow-none">
            <CardHeader>
              <CardTitle className="text-lg">Summary</CardTitle>
              <CardDescription>
                Current clinic volume and what the team can do next.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
                <div className="text-xs tracking-[0.14em] text-primary/80 uppercase">
                  Activity volume
                </div>
                <div className="mt-2 font-medium">
                  {clinicMetrics.patientCount} patients
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {clinicMetrics.totalSessions} total recorded sessions
                </div>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
                <div className="text-xs tracking-[0.14em] text-primary/80 uppercase">
                  What happens next
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  Once setup is saved, the clinic landing page becomes the home
                  view for managing patients, reviewing session outcomes, and
                  launching exercise flows.
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant={readiness.keyboardReady ? "success" : "outline"}
                >
                  Device {readiness.keyboardReady ? "ready" : "pending"}
                </Badge>
                <Badge variant={readiness.networkReady ? "success" : "outline"}>
                  Network {readiness.networkReady ? "ready" : "pending"}
                </Badge>
                <Badge
                  variant={readiness.workflowReviewed ? "success" : "warning"}
                >
                  Workflow{" "}
                  {readiness.workflowReviewed ? "reviewed" : "to review"}
                </Badge>
              </div>
              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <Button
                  onClick={() => navigate("/")}
                  className="bg-foreground text-background hover:bg-foreground/90"
                >
                  Back to clinic
                </Button>
              </div>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  )
}

function SetupToggleRow({
  label,
  description,
  active,
  onToggle,
}: {
  label: string
  description: string
  active: boolean
  onToggle: () => void
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-background/80 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div className="font-medium">{label}</div>
        <div className="mt-1 text-sm text-muted-foreground">{description}</div>
      </div>
      <Button
        type="button"
        variant={active ? "default" : "outline"}
        size="sm"
        onClick={onToggle}
        className={
          active
            ? "bg-foreground text-background hover:bg-foreground/90"
            : "border-foreground/20 text-foreground hover:border-foreground/30"
        }
      >
        {active ? "Ready" : "Mark ready"}
      </Button>
    </div>
  )
}

function ClinicOverview({
  patients,
}: {
  patients: PatientRecord[]
}) {
  const clinicMetrics = getClinicMetrics(patients)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Clinic metrics</CardTitle>
        <CardDescription>
          Simple operational totals across the current patient list.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <InfoTile label="Patients" value={`${clinicMetrics.patientCount}`} />
        {clinicMetrics.activityMetrics.map((metric) => (
          <InfoTile
            key={metric.activity}
            label={metric.activity}
            value={`${metric.sessions} sessions`}
          />
        ))}
      </CardContent>
    </Card>
  )
}

function PatientsList({ patients }: { patients: PatientRecord[] }) {
  const navigate = useNavigate()
  const [isAddOpen, setIsAddOpen] = useState(false)

  return (
    <>
      <Card className="flex-1">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Patients</CardTitle>
            <CardDescription>
              Names with a few high-level metrics for quick review.
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsAddOpen(true)}
          >
            Add patient
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {patients.map((patient) => (
            <div
              key={patient.id}
              className="rounded-2xl border border-border/60 bg-background/80 p-4"
            >
              <button
                type="button"
                onClick={() => navigate(`/patients/${patient.id}`)}
                className="w-full text-left transition-colors hover:text-foreground"
              >
                <div className="flex w-full flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-[180px]">
                    <div className="text-lg font-medium">{patient.name}</div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <PatientMetric
                      label="Sessions"
                      value={`${patient.totalSessions}`}
                    />
                    <PatientMetric
                      label="Last session"
                      value={patient.lastSession}
                      icon={<Clock3 className="size-4 text-muted-foreground" />}
                    />
                  </div>
                </div>
              </button>
            </div>
          ))}
        </CardContent>
      </Card>
      <AddPatientDialog open={isAddOpen} onOpenChange={setIsAddOpen} />
    </>
  )
}

function AddPatientDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (!open) {
    return null
  }

  return <AddPatientDialogContent open={open} onOpenChange={onOpenChange} />
}

function AddPatientDialogContent({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { addPatient } = useStella()
  const [name, setName] = useState("")
  const trimmedName = name.trim()

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title="Add patient"
      description="Create a new patient record for this clinic mockup."
      titleId="patient-add-title"
    >
      <LabeledInput label="Patient name" value={name} onChange={setName} />
      <div className="flex flex-wrap justify-end gap-2 pt-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            if (!trimmedName) {
              return
            }

            addPatient(trimmedName)
            onOpenChange(false)
          }}
          disabled={!trimmedName}
          className="bg-foreground text-background hover:bg-foreground/90"
        >
          Save patient
        </Button>
      </div>
    </DialogShell>
  )
}

function PatientPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { patientId } = useParams()
  const { patients } = useStella()
  const patient = patients.find((item) => item.id === patientId)
  const isExerciseTab = location.pathname.endsWith("/exercises")

  if (!patient) {
    return (
      <NotFoundCard
        title="Patient not found"
        description="Return to the clinic landing page and choose a valid patient."
        actionLabel="Back to patients"
        onAction={() => navigate("/")}
      />
    )
  }

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle>{patient.name}</CardTitle>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Edit patient"
                  className="text-muted-foreground hover:bg-transparent hover:text-foreground"
                >
                  <Edit3 className="size-4" />
                </Button>
              </div>
              <CardDescription>
                Patient detail and exercise history summary.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={!isExerciseTab ? "default" : "outline"}
                size="sm"
                onClick={() => navigate(`/patients/${patient.id}`)}
                className={
                  !isExerciseTab
                    ? "bg-foreground text-background hover:bg-foreground/90"
                    : "border-foreground/20 text-foreground hover:border-foreground/30"
                }
              >
                Dashboard
              </Button>
              <Button
                variant={isExerciseTab ? "default" : "outline"}
                size="sm"
                onClick={() => navigate(`/patients/${patient.id}/exercises`)}
                className={
                  isExerciseTab
                    ? "bg-foreground text-background hover:bg-foreground/90"
                    : "border-foreground/20 text-foreground hover:border-foreground/30"
                }
              >
                Exercises
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isExerciseTab ? (
            <ExercisesWorkspace patient={patient} />
          ) : (
            <div className="grid gap-4">
              {patient.latestResult ? (
                <LatestResultCard latestResult={patient.latestResult} />
              ) : null}
              <DashboardInsightsCard
                patient={patient}
                history={patient.history}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function PatientSessionPage() {
  const navigate = useNavigate()
  const { patientId, activitySlug } = useParams()
  const {
    patients,
    recordPatientSessionResult,
    setPatientSelectedActivity,
    updatePatientExerciseState,
  } = useStella()
  const patient = patients.find((item) => item.id === patientId)
  const activity = activitySlug ? getActivityFromSlug(activitySlug) : null

  useEffect(() => {
    if (patient && activity) {
      setPatientSelectedActivity(patient.id, activity)
    }
  }, [activity, patient, setPatientSelectedActivity])

  if (!patient || !activity) {
    return (
      <NotFoundCard
        title="Session not found"
        description="Return to the patient view and start a valid session."
        actionLabel="Back to patients"
        onAction={() => navigate("/")}
      />
    )
  }

  const currentPatient = patient
  const currentActivity = activity ?? "Letter Target"
  const definition = exerciseDefinitions[currentActivity]
  const exercisesPath = `/patients/${currentPatient.id}/exercises`
  const dashboardPath = `/patients/${currentPatient.id}`
  const sessionState = currentPatient.exerciseStates[currentActivity]

  function handleComplete(endedEarly: boolean) {
    const nextResult = buildMockResult(
      currentPatient,
      sessionState.config,
      endedEarly
    )

    updatePatientExerciseState(currentPatient.id, currentActivity, (state) => ({
      ...state,
      status: "results",
      progress: 100,
      result: nextResult,
    }))

    recordPatientSessionResult(
      currentPatient.id,
      nextResult,
      sessionState.config
    )
  }

  function handleRestart() {
    updatePatientExerciseState(currentPatient.id, currentActivity, (state) => ({
      ...state,
      status: "running",
      progress: getStartingProgress(currentActivity),
      result: null,
    }))
  }

  if (sessionState.status === "results" && sessionState.result) {
    return (
      <div className="grid gap-4">
        <SessionHeaderCard
          patientName={currentPatient.name}
          title={`${definition.id} session results.`}
          definition={definition}
          actionLabel="Dashboard"
          onAction={() => navigate(dashboardPath)}
        />
        <ExerciseResultsCard
          result={sessionState.result}
          config={sessionState.config}
          onRestart={handleRestart}
          onBackToDashboard={() => navigate(dashboardPath)}
        />
      </div>
    )
  }

  if (sessionState.status !== "running") {
    return (
      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>No session in progress</CardTitle>
            <CardDescription>
              Start or resume an activity session from the Exercises tab.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => navigate(exercisesPath)}>
              Back to exercises
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      <SessionHeaderCard
        patientName={currentPatient.name}
        title={`${definition.id} session in progress.`}
        definition={definition}
        actionLabel="Exercises"
        onAction={() => navigate(exercisesPath)}
      />
      <ExerciseRunningCard
        config={sessionState.config}
        progress={sessionState.progress}
        onStopEarly={() => handleComplete(true)}
        onComplete={() => handleComplete(false)}
      />
    </div>
  )
}

function PatientReportPage() {
  const navigate = useNavigate()
  const { patientId, reportSlug } = useParams()
  const { patients } = useStella()
  const patient = patients.find((item) => item.id === patientId)
  const activity =
    reportSlug && reportSlug !== allExercisesReportSlug
      ? getActivityFromSlug(reportSlug)
      : null
  const isAggregate = reportSlug === allExercisesReportSlug

  if (!patient || (!isAggregate && !activity)) {
    return (
      <NotFoundCard
        title="Report not found"
        description="Return to the patient dashboard and choose a valid report."
        actionLabel="Back to patients"
        onAction={() => navigate("/")}
      />
    )
  }

  const currentPatient = patient
  const currentActivity = activity ?? "Letter Target"
  const definition = isAggregate ? null : exerciseDefinitions[currentActivity]
  const latestActivityEntry = isAggregate
    ? null
    : currentPatient.history.find((entry) => entry.activity === currentActivity) ?? null
  const isLetterExercise =
    !isAggregate &&
    (currentActivity === "Letter Target" || currentActivity === "Letter Find")
  const reportTitle = isAggregate
    ? "All exercises report"
    : `${currentActivity} report`
  const reportMetrics = isAggregate
    ? getAggregateReportMetrics(currentPatient, currentPatient.history)
    : getActivityReportMetrics(currentActivity, currentPatient, currentPatient.history)
  const summaryMetrics =
    isLetterExercise && currentActivity
      ? getLetterExerciseSummaryMetrics(currentActivity, currentPatient, currentPatient.history)
      : []
  const trendCharts = isAggregate
    ? getAggregateTrendCharts(currentPatient, currentPatient.history)
    : getActivityTrendCharts(currentActivity, currentPatient, currentPatient.history)

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle>{reportTitle}</CardTitle>
              {isAggregate ? (
                <CardDescription>
                  Combined results and trends across the five exercise types.
                </CardDescription>
              ) : null}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/patients/${currentPatient.id}`)}
            >
              <ArrowLeft className="mr-2 size-4" />
              Dashboard
            </Button>
          </div>
          {definition ? <DefinitionCard definition={definition} /> : null}
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{isAggregate ? "Current summary" : "Last result"}</CardTitle>
          {!isAggregate && latestActivityEntry ? (
            <CardDescription>
              {latestActivityEntry.completedAt} · {latestActivityEntry.summary}
            </CardDescription>
          ) : null}
        </CardHeader>
        <CardContent>
          <MetricGrid metrics={reportMetrics} columnsClassName="md:grid-cols-2 xl:grid-cols-4" />
        </CardContent>
      </Card>

      {summaryMetrics.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
            <CardDescription>
              Roll-up across the recent sessions represented in this report.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2">
              {summaryMetrics.map((metric) => (
                <div
                  key={metric.label}
                  className="rounded-2xl border border-border/60 bg-background/80 p-4"
                >
                  <div className="text-[11px] uppercase tracking-[0.14em] text-primary/80">
                    {metric.label}
                  </div>
                  {metric.breakdown ? (
                    <div className="mt-4 grid grid-cols-3 gap-3">
                      <SummaryBreakdownItem
                        label="Lowest"
                        value={metric.breakdown.lowest}
                      />
                      <SummaryBreakdownItem
                        label="Highest"
                        value={metric.breakdown.highest}
                      />
                      <SummaryBreakdownItem
                        label="Average"
                        value={metric.breakdown.average}
                      />
                    </div>
                  ) : (
                    <div className="mt-3 text-2xl font-semibold tracking-tight">
                      {metric.value}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Progress over time</CardTitle>
          <CardDescription>
            Visual trend for the most relevant measures in this report.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            {trendCharts.map((chart) => (
              <TrendChartCard key={chart.title} chart={chart} />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>
            A more complete detailed measures view will be defined in a later pass.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-2xl border border-dashed border-border/70 bg-background/70 px-4 py-6 text-sm text-muted-foreground">
            Detailed activity measures placeholder.
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function SummaryBreakdownItem({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-3">
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 whitespace-nowrap font-medium">{value}</div>
    </div>
  )
}

function TrendChartCard({ chart }: { chart: TrendChartDefinition }) {
  const width = Math.max(320, chart.points.length * 48)
  const height = 160
  const insetX = 18
  const insetY = 18
  const plotWidth = width - insetX * 2
  const values = chart.points.map((point) => point.value)
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const range = maxValue - minValue

  const polylinePoints = chart.points
    .map((point, index) => {
      const x =
        insetX +
        (index * (width - insetX * 2)) / Math.max(chart.points.length - 1, 1)
      const normalized =
        range === 0 ? 0.5 : (point.value - minValue) / Math.max(range, 1)
      const y = height - insetY - normalized * (height - insetY * 2)

      return `${x},${y}`
    })
    .join(" ")

  return (
    <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium">{chart.title}</div>
          <div className="mt-1 text-sm text-muted-foreground">
            {chart.description}
          </div>
        </div>
        <Badge variant="outline">{chart.points.at(-1)?.displayValue}</Badge>
      </div>
      <div className="mt-4 overflow-x-auto">
        <div style={{ width }}>
          <div style={{ marginLeft: insetX, width: plotWidth }}>
            <svg
              viewBox={`0 0 ${plotWidth} ${height}`}
              className="block h-40"
              style={{ width: plotWidth }}
              role="img"
              aria-label={chart.title}
            >
              <line
                x1={0}
                y1={height - insetY}
                x2={plotWidth}
                y2={height - insetY}
                stroke="hsl(var(--border))"
                strokeWidth="1"
              />
              <polyline
                fill="none"
                points={polylinePoints}
                stroke={chart.color}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="3"
              />
              {chart.points.map((point, index) => {
                const x =
                  (index * plotWidth) / Math.max(chart.points.length - 1, 1)
                const normalized =
                  range === 0
                    ? 0.5
                    : (point.value - minValue) / Math.max(range, 1)
                const y = height - insetY - normalized * (height - insetY * 2)

                return (
                  <g key={`${chart.title}-${point.label}`}>
                    <circle cx={x} cy={y} r="4" fill={chart.color} />
                    <circle
                      cx={x}
                      cy={y}
                      r="7"
                      fill={chart.color}
                      fillOpacity="0.14"
                    />
                  </g>
                )
              })}
            </svg>
            <div className="mt-3 text-[11px] tracking-[0.14em] text-primary/80 uppercase">
              Sessions
            </div>
            <div
              className="mt-2 grid gap-2 text-xs text-muted-foreground"
              style={{
                gridTemplateColumns: `repeat(${chart.points.length}, minmax(2.25rem, 1fr))`,
                width: plotWidth,
              }}
            >
              {chart.points.map((point) => (
                <div
                  key={`${chart.title}-label-${point.label}`}
                  className="text-center"
                >
                  <div className="font-medium text-foreground">
                    {point.displayValue}
                  </div>
                  <div>{point.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ExercisesWorkspace({ patient }: { patient: PatientRecord }) {
  const navigate = useNavigate()
  const { setPatientSelectedActivity, updatePatientExerciseState } = useStella()
  const selectedActivity = patient.selectedActivity
  const selectedState = patient.exerciseStates[selectedActivity]
  const selectedDefinition = exerciseDefinitions[selectedActivity]
  const controlsDisabled = selectedState.status === "running"
  const sessionPath = getSessionPath(patient.id, selectedActivity)

  function handleConfigChange(nextConfig: ExerciseConfig) {
    updatePatientExerciseState(patient.id, selectedActivity, (state) => ({
      ...state,
      config: nextConfig,
      status: "setup",
      progress: 0,
      result: null,
    }))
  }

  function handleStart() {
    updatePatientExerciseState(patient.id, selectedActivity, (state) => ({
      ...state,
      status: "running",
      progress: getStartingProgress(selectedActivity),
      result: null,
    }))
    navigate(sessionPath)
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Exercises</CardTitle>
          <CardDescription>
            Select an activity, adjust settings, and run a session flow.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {activityOrder.map((activity) => {
            const state = patient.exerciseStates[activity]
            const isSelected = activity === selectedActivity

            return (
              <Button
                key={activity}
                type="button"
                onClick={() => setPatientSelectedActivity(patient.id, activity)}
                variant={isSelected ? "default" : "outline"}
                size="sm"
                className={[
                  "justify-start",
                  isSelected
                    ? "bg-foreground text-background hover:bg-foreground/90"
                    : "border-foreground/20 text-foreground hover:border-foreground/30",
                ].join(" ")}
              >
                {activity}
                {state.status === "running" ? (
                  <span className="ml-2 text-[11px] opacity-80">Live</span>
                ) : null}
              </Button>
            )
          })}
        </CardContent>
      </Card>

      <div className="grid gap-4">
        <Card>
          <CardHeader className="gap-3">
            <CardTitle>{selectedDefinition.id}</CardTitle>
            <DefinitionCard definition={selectedDefinition} />
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Session setup</CardTitle>
            <CardDescription>
              Configuration for the selected exercise.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ExerciseSetupFields
              config={selectedState.config}
              disabled={controlsDisabled}
              onChange={handleConfigChange}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex justify-start pt-6 lg:justify-end">
            <Button
              onClick={
                selectedState.status === "running"
                  ? () => navigate(sessionPath)
                  : handleStart
              }
              className="min-w-40 bg-foreground text-background hover:bg-foreground/90"
            >
              {selectedState.status === "running"
                ? "Open session"
                : "Start session"}
            </Button>
          </CardContent>
        </Card>

        {selectedState.status === "running" ? (
          <Card>
            <CardHeader>
              <CardTitle>Session in progress</CardTitle>
              <CardDescription>
                This exercise is currently running on its own page.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => navigate(sessionPath)}
                className="bg-foreground text-background hover:bg-foreground/90"
              >
                Open session page
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
}

function ExerciseSetupFields({
  config,
  disabled,
  onChange,
}: {
  config: ExerciseConfig
  disabled: boolean
  onChange: (nextConfig: ExerciseConfig) => void
}) {
  switch (config.activity) {
    case "Letter Target":
    case "Letter Find":
      return (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-4 md:col-span-2 md:grid-cols-2">
            <ChoiceButtons
              label="Content mode"
              value={config.contentMode}
              disabled={disabled}
              options={[
                { value: "letters", label: "Letters" },
                { value: "words", label: "Words" },
              ]}
              onChange={(contentMode) => onChange({ ...config, contentMode })}
            />
            {config.contentMode === "words" ? (
              <ChoiceButtons
                label="Word length"
                value={config.wordLength}
                disabled={disabled}
                options={[
                  { value: "0-5", label: "0-5" },
                  { value: "5-10", label: "5-10" },
                  { value: "10+", label: "10+" },
                ]}
                onChange={(wordLength) => onChange({ ...config, wordLength })}
              />
            ) : null}
          </div>
          <NumberField
            label="Items per session"
            value={config.itemsPerSession}
            min={1}
            max={12}
            disabled={disabled}
            onChange={(itemsPerSession) =>
              onChange({ ...config, itemsPerSession })
            }
          />
          <div className="grid gap-4 rounded-2xl border border-border/60 bg-background/70 p-4 md:col-span-2 md:grid-cols-2">
            <ChoiceButtons
              label="Audio mode"
              value={config.audioMode}
              disabled={disabled}
              options={[
                { value: "silent", label: "Silent" },
                { value: "metronome", label: "Metronome" },
                { value: "music", label: "Music" },
              ]}
              onChange={(audioMode) => onChange({ ...config, audioMode })}
            />
            <div className={config.audioMode === "silent" ? "opacity-50" : ""}>
              <NumberField
                label="Tempo"
                value={config.tempo}
                min={30}
                max={120}
                suffix="BPM"
                disabled={disabled || config.audioMode === "silent"}
                onChange={(tempo) => onChange({ ...config, tempo })}
              />
            </div>
          </div>
        </div>
      )
    case "Eye Pong":
      return (
        <div className="grid gap-4 md:grid-cols-2">
          <ChoiceButtons
            label="Pattern"
            value={config.pattern}
            disabled={disabled}
            options={[
              { value: "left-right", label: "Left / Right" },
              { value: "random", label: "Random" },
            ]}
            onChange={(pattern) => onChange({ ...config, pattern })}
          />
          <NumberField
            label="Target changes"
            value={config.targetChanges}
            min={4}
            max={24}
            disabled={disabled}
            onChange={(targetChanges) => onChange({ ...config, targetChanges })}
          />
          <div className="grid gap-4 rounded-2xl border border-border/60 bg-background/70 p-4 md:col-span-2 md:grid-cols-2">
            <ChoiceButtons
              label="Audio mode"
              value={config.audioMode}
              disabled={disabled}
              options={[
                { value: "silent", label: "Silent" },
                { value: "metronome", label: "Metronome" },
                { value: "music", label: "Music" },
              ]}
              onChange={(audioMode) => onChange({ ...config, audioMode })}
            />
            <div className={config.audioMode === "silent" ? "opacity-50" : ""}>
              <NumberField
                label="Tempo"
                value={config.tempo}
                min={30}
                max={120}
                suffix="BPM"
                disabled={disabled || config.audioMode === "silent"}
                onChange={(tempo) => onChange({ ...config, tempo })}
              />
            </div>
          </div>
          <FieldNote
            label="Constraint"
            value="Clinician-observed only; no objective eye-tracking score."
          />
        </div>
      )
    case "Inhibition Challenge":
      return (
        <div className="grid gap-4 md:grid-cols-2">
          <NumberField
            label="Trial count"
            value={config.trialCount}
            min={6}
            max={24}
            disabled={disabled}
            onChange={(trialCount) => onChange({ ...config, trialCount })}
          />
          <ChoiceButtons
            label="Rule preset"
            value={config.rulePreset}
            disabled={disabled}
            options={[
              { value: "balanced", label: "Balanced" },
              { value: "go-heavy", label: "Go-heavy" },
              { value: "stop-heavy", label: "Stop-heavy" },
            ]}
            onChange={(rulePreset) => onChange({ ...config, rulePreset })}
          />
          <NumberField
            label="Response window"
            value={config.responseWindow}
            min={600}
            max={2000}
            step={100}
            suffix="ms"
            disabled={disabled}
            onChange={(responseWindow) =>
              onChange({ ...config, responseWindow })
            }
          />
          <NumberField
            label="Cue speed"
            value={config.cueSpeed}
            min={30}
            max={100}
            suffix="BPM"
            disabled={disabled}
            onChange={(cueSpeed) => onChange({ ...config, cueSpeed })}
          />
        </div>
      )
    case "Motor Sequence Builder":
      return (
        <div className="grid gap-4 md:grid-cols-2">
          <ChoiceButtons
            label="Content type"
            value={config.contentType}
            disabled={disabled}
            options={[
              { value: "letter-sequence", label: "Letter sequence" },
              { value: "word-sequence", label: "Word sequence" },
            ]}
            onChange={(contentType) => onChange({ ...config, contentType })}
          />
          <NumberField
            label="Sequence length"
            value={config.sequenceLength}
            min={2}
            max={6}
            disabled={disabled}
            onChange={(sequenceLength) =>
              onChange({ ...config, sequenceLength })
            }
          />
          <NumberField
            label="Number of sequences"
            value={config.sequenceCount}
            min={2}
            max={10}
            disabled={disabled}
            onChange={(sequenceCount) => onChange({ ...config, sequenceCount })}
          />
          <NumberField
            label="Presentation speed"
            value={config.presentationSpeed}
            min={30}
            max={120}
            suffix="BPM"
            disabled={disabled}
            onChange={(presentationSpeed) =>
              onChange({ ...config, presentationSpeed })
            }
          />
          <ChoiceButtons
            label="Audio mode"
            value={config.audioMode}
            disabled={disabled}
            options={[
              { value: "silent", label: "Silent" },
              { value: "metronome", label: "Metronome" },
              { value: "music", label: "Music" },
            ]}
            onChange={(audioMode) => onChange({ ...config, audioMode })}
          />
        </div>
      )
  }
}

function ExerciseRunningCard({
  config,
  progress,
  onStopEarly,
  onComplete,
}: {
  config: ExerciseConfig
  progress: number
  onStopEarly: () => void
  onComplete: () => void
}) {
  const snapshot = getRunningSnapshot(config, progress)
  const detailSections = getRunningDetailSections(config, progress)

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Session in progress</CardTitle>
            <CardDescription>{snapshot.instruction}</CardDescription>
          </div>
          <Badge variant="default">Live</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {snapshot.progressLabel}
            </span>
            <span className="font-medium">{progress}%</span>
          </div>
          <Progress value={progress} />
        </div>
        <MetricGrid
          metrics={snapshot.metrics}
          columnsClassName="md:grid-cols-3"
        />
        <div className="grid gap-4 lg:grid-cols-2">
          {detailSections.map((section) => (
            <div
              key={section.title}
              className="rounded-2xl border border-border/60 bg-background/80 p-4"
            >
              <div className="font-medium">{section.title}</div>
              {section.description ? (
                <div className="mt-1 text-sm text-muted-foreground">
                  {section.description}
                </div>
              ) : null}
              <div className="mt-4 grid gap-3">
                {section.items.map((item) => (
                  <div
                    key={`${section.title}-${item.label}`}
                    className={[
                      "rounded-xl border px-3 py-3",
                      item.tone === "success"
                        ? "border-emerald-300/70 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100"
                        : item.tone === "warning"
                          ? "border-amber-300/70 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"
                          : "border-border/60 bg-muted/30",
                    ].join(" ")}
                  >
                    <div className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                      {item.label}
                    </div>
                    <div className="mt-1 font-medium">{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onStopEarly}>
            Stop early
          </Button>
          <Button
            onClick={onComplete}
            className="bg-foreground text-background hover:bg-foreground/90"
          >
            Complete demo
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function ExerciseResultsCard({
  result,
  config,
  onRestart,
  onBackToDashboard,
}: {
  result: ExerciseResult
  config?: ExerciseConfig
  onRestart: () => void
  onBackToDashboard?: () => void
}) {
  const metrics = getResultMetrics(result)
  const configDetails = config ? getConfigDetails(config) : []

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Session results</CardTitle>
            <CardDescription>
              Session summary for {result.activity}.
            </CardDescription>
          </div>
          <Badge
            variant={result.status === "completed" ? "success" : "warning"}
          >
            {result.status === "completed" ? "Completed" : "Ended early"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="grid gap-4">
            <MetricPanel
              title="Activity"
              metrics={[{ label: "Activity", value: result.activity }]}
            />
            {configDetails.length > 0 ? (
              <MetricPanel
                title="Session setup"
                metrics={configDetails}
                columnsClassName="sm:grid-cols-2"
              />
            ) : null}
          </div>
          <MetricPanel
            title="Result metrics"
            metrics={metrics}
            columnsClassName="md:grid-cols-2"
          />
        </div>
        {result.activity === "Eye Pong" ? (
          <div className="rounded-2xl border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            Eye Pong results intentionally stop at programmed sequence and
            completion status. This does not imply objective eye-tracking.
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {onBackToDashboard ? (
            <Button variant="outline" onClick={onBackToDashboard}>
              Back to dashboard
            </Button>
          ) : null}
          <Button
            onClick={onRestart}
            className="bg-foreground text-background hover:bg-foreground/90"
          >
            Start another session
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function LatestResultCard({
  latestResult,
}: {
  latestResult: LatestResultEntry
}) {
  const { result, config, completedAt, summary } = latestResult
  const metrics = getResultMetrics(result)
  const configDetails = getConfigDetails(config)

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Latest result</CardTitle>
            <CardDescription>
              {completedAt} · {summary}
            </CardDescription>
          </div>
          <Badge
            variant={result.status === "completed" ? "success" : "warning"}
          >
            {result.status === "completed" ? "Completed" : "Ended early"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <MetricPanel
          title="Session setup"
          metrics={configDetails}
          columnsClassName="sm:grid-cols-2"
        />
        <MetricPanel
          title="Result metrics"
          metrics={metrics}
          columnsClassName="md:grid-cols-2"
        />
      </CardContent>
    </Card>
  )
}

function DashboardInsightsCard({
  patient,
  history,
}: {
  patient: PatientRecord
  history: SessionHistoryEntry[]
}) {
  const navigate = useNavigate()
  const activeExerciseCount = Object.values(patient.exerciseTotals).filter(
    (count) => count > 0
  ).length
  const topActivity = activityOrder.reduce((best, activity) =>
    patient.exerciseTotals[activity] > patient.exerciseTotals[best]
      ? activity
      : best
  )
  const latestEntry = history[0] ?? null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Patient progress</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <AggregateExerciseSummaryCard
            totalRecordedSessions={patient.totalSessions}
            activeExerciseCount={activeExerciseCount}
            topActivity={topActivity}
            latestEntry={latestEntry}
            onOpenReport={() => navigate(getReportPath(patient.id))}
          />
          {activityOrder.map((activity) => {
            const latestActivityEntry =
              history.find((entry) => entry.activity === activity) ?? null

            return (
              <ExerciseResultSummaryCard
                key={activity}
                activity={activity}
                latestEntry={latestActivityEntry}
                sessionCount={patient.exerciseTotals[activity]}
                onOpenReport={() =>
                  navigate(getReportPath(patient.id, activity))
                }
              />
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

function AggregateExerciseSummaryCard({
  totalRecordedSessions,
  activeExerciseCount,
  topActivity,
  latestEntry,
  onOpenReport,
}: {
  totalRecordedSessions: number
  activeExerciseCount: number
  topActivity: ActivityType
  latestEntry: SessionHistoryEntry | null
  onOpenReport: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpenReport}
      className="rounded-2xl border border-[color:var(--chart-2)]/40 bg-[color:var(--chart-2)]/10 p-4 text-left transition-colors hover:bg-[color:var(--chart-2)]/15"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="font-medium">All exercises</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Combined summary across the five exercise types.
          </div>
        </div>
        <Badge className="border-transparent bg-foreground text-background">
          Aggregate
        </Badge>
      </div>
      <MetricGrid
        metrics={[
          { label: "Total completed", value: `${totalRecordedSessions}` },
          { label: "Exercise coverage", value: `${activeExerciseCount} / 5` },
          { label: "Most active", value: topActivity },
          {
            label: "Latest session",
            value: latestEntry
              ? `${latestEntry.activity} · ${latestEntry.completedAt}`
              : "No sessions",
          },
        ]}
        columnsClassName="sm:grid-cols-2"
        itemClassName="border-[color:var(--chart-2)]/30 bg-background/70"
        className="mt-4"
      />
    </button>
  )
}

function ExerciseResultSummaryCard({
  activity,
  latestEntry,
  sessionCount,
  onOpenReport,
}: {
  activity: ActivityType
  latestEntry: SessionHistoryEntry | null
  sessionCount: number
  onOpenReport: () => void
}) {
  const metrics = latestEntry
    ? getResultMetrics(latestEntry.result).slice(0, 4)
    : []

  return (
    <button
      type="button"
      onClick={onOpenReport}
      className="rounded-2xl border border-border/60 bg-background/80 p-4 text-left transition-colors hover:bg-muted/30"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="font-medium">{activity}</div>
          <div className="mt-1 text-sm text-muted-foreground">
            {latestEntry
              ? `Latest: ${latestEntry.completedAt}`
              : "No session recorded yet"}
          </div>
        </div>
        <Badge variant="outline">{sessionCount} sessions</Badge>
      </div>
      {latestEntry ? (
        <MetricGrid
          metrics={metrics}
          columnsClassName="sm:grid-cols-2"
          className="mt-4"
        />
      ) : (
        <div className="mt-4 rounded-xl border border-border/60 bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
          Start this exercise to populate summary results here.
        </div>
      )}
    </button>
  )
}

function ChoiceButtons<T extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string
  value: T
  options: ChoiceOption<T>[]
  disabled?: boolean
  onChange: (nextValue: T) => void
}) {
  return (
    <div className="space-y-2">
      <div className="text-xs tracking-[0.14em] text-primary/80 uppercase">
        {label}
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isActive = option.value === value

          return (
            <Button
              key={option.value}
              type="button"
              variant={isActive ? "default" : "outline"}
              size="sm"
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={
                isActive
                  ? "bg-foreground text-background hover:bg-foreground/90"
                  : "border-foreground/20 text-foreground hover:border-foreground/30"
              }
            >
              {option.label}
            </Button>
          )
        })}
      </div>
    </div>
  )
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  disabled,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  disabled?: boolean
  onChange: (nextValue: number) => void
}) {
  return (
    <div className="space-y-2">
      <div className="text-xs tracking-[0.14em] text-primary/80 uppercase">
        {label}
      </div>
      <div className="flex items-center gap-3">
        <Input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(event) => {
            const nextValue = Number(event.target.value)

            if (Number.isNaN(nextValue)) {
              return
            }

            onChange(clampNumber(nextValue, min, max))
          }}
          className="max-w-[140px]"
        />
        {suffix ? (
          <span className="text-sm text-muted-foreground">{suffix}</span>
        ) : null}
      </div>
      <div className="text-xs text-muted-foreground">
        Range: {min} to {max}
      </div>
    </div>
  )
}

function FieldNote({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-muted/30 px-4 py-3">
      <div className="text-xs tracking-[0.14em] text-primary/80 uppercase">
        {label}
      </div>
      <div className="mt-1 text-sm text-muted-foreground">{value}</div>
    </div>
  )
}

function InfoTile({ icon, label, value }: IconLabelValueProps) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
      <div className="flex items-center gap-2 text-xs tracking-[0.14em] text-primary/80 uppercase">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-2 font-medium">{value}</div>
    </div>
  )
}

function PatientMetric({ icon, label, value }: IconLabelValueProps) {
  return (
    <div className="min-w-[112px] rounded-xl border border-border/60 bg-background/75 px-3 py-2">
      <div className="flex items-center gap-2 text-[11px] tracking-[0.14em] text-primary/80 uppercase">
        {icon ? <span className="shrink-0">{icon}</span> : null}
        <span>{label}</span>
      </div>
      <div className="mt-1 font-medium">{value}</div>
    </div>
  )
}

function SessionHeaderCard({
  patientName,
  title,
  definition,
  actionLabel,
  onAction,
}: {
  patientName: string
  title: string
  definition: ExerciseDefinition
  actionLabel: string
  onAction: () => void
}) {
  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>{patientName}</CardTitle>
            <CardDescription>{title}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={onAction}>
            <ArrowLeft className="mr-2 size-4" />
            {actionLabel}
          </Button>
        </div>
        <DefinitionCard definition={definition} />
      </CardHeader>
    </Card>
  )
}

function DefinitionCard({ definition }: { definition: ExerciseDefinition }) {
  return (
    <>
      <div className="rounded-2xl border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        {definition.purpose} {definition.description}
      </div>
      {definition.disclaimer ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {definition.disclaimer}
        </div>
      ) : null}
    </>
  )
}

function MetricGrid({
  metrics,
  className,
  columnsClassName = "sm:grid-cols-2",
  itemClassName,
}: {
  metrics: ResultMetric[]
  className?: string
  columnsClassName?: string
  itemClassName?: string
}) {
  return (
    <div
      className={["grid gap-3", columnsClassName, className]
        .filter(Boolean)
        .join(" ")}
    >
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className={[
            "rounded-xl border border-border/60 bg-muted/30 px-4 py-3",
            itemClassName,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <div className="text-[11px] tracking-[0.14em] text-primary/80 uppercase">
            {metric.label}
          </div>
          <div className="mt-1 font-medium">{metric.value}</div>
        </div>
      ))}
    </div>
  )
}

function MetricPanel({
  title,
  metrics,
  columnsClassName = "sm:grid-cols-2",
}: {
  title: string
  metrics: ResultMetric[]
  columnsClassName?: string
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
      <div className="text-[11px] tracking-[0.14em] text-primary/80 uppercase">
        {title}
      </div>
      <MetricGrid
        metrics={metrics}
        columnsClassName={columnsClassName}
        className="mt-3"
      />
    </div>
  )
}

function LabeledInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-2">
      <div className="text-xs tracking-[0.14em] text-primary/80 uppercase">
        {label}
      </div>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  )
}

function NotFoundCard({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string
  description: string
  actionLabel: string
  onAction: () => void
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="space-y-2">
          <div className="text-xl font-semibold tracking-tight">{title}</div>
          <div className="text-sm text-muted-foreground">{description}</div>
          <Button variant="outline" size="sm" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export default App
