import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { format, parseISO } from "date-fns"
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Plus,
  Search,
  UserRound,
} from "lucide-react"
import { useMemo, useState } from "react"
import {
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { z } from "zod"

import {
  buildExerciseSummaries,
  formatMetricValue,
  getExerciseAggregateValue,
  getSessionDisplayValue,
} from "@/api/stella"
import { Button } from "@/components/ui/button"
import { exerciseDefinitions, exerciseTypes } from "@/config/exercises"
import {
  useCreatePatient,
  useDashboardStats,
  useExerciseSessions,
  usePatient,
  usePatientSessions,
  usePatients,
} from "@/hooks/use-stella"
import { cn } from "@/lib/utils"
import type {
  ExerciseSession,
  ExerciseSummary,
  ExerciseType,
  MetricDefinition,
  PatientWithStats,
} from "@/types"

const patientSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  patientCode: z.string().trim().min(1, "Patient ID is required"),
  notes: z.string().optional(),
})

function formatDate(date: string | undefined, pattern = "MMM d, yyyy") {
  if (!date) {
    return "N/A"
  }

  return format(parseISO(date), pattern)
}

function displayText(value: unknown) {
  if (typeof value !== "string") {
    return String(value ?? "N/A")
  }

  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function StatusBadge({
  status,
}: {
  status: "Active" | "Inactive" | "Completed" | "Ended Early"
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-md border px-2 text-xs font-medium",
        status === "Active" || status === "Completed"
          ? "border-primary/20 bg-primary/10 text-primary"
          : "border-border bg-muted text-muted-foreground"
      )}
    >
      {status}
    </span>
  )
}

function MetricCard({
  label,
  value,
  helper,
}: {
  label: string
  value: string | number
  helper?: string
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-3 text-3xl font-semibold tabular-nums">{value}</div>
      {helper ? <div className="mt-1 text-sm text-muted-foreground">{helper}</div> : null}
    </div>
  )
}

function PageHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-3xl font-semibold tracking-normal">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  )
}

function DataTable<TData>({
  table,
  emptyMessage,
  onRowClick,
}: {
  table: ReturnType<typeof useReactTable<TData>>
  emptyMessage: string
  onRowClick?: (row: TData) => void
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[840px] border-collapse text-sm">
          <thead className="bg-muted/60">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="h-11 px-4 text-left align-middle text-xs font-medium tracking-wide text-muted-foreground uppercase"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    "border-t transition-colors hover:bg-muted/50",
                    onRowClick ? "cursor-pointer" : ""
                  )}
                  onClick={() => onRowClick?.(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="h-[52px] px-4 align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  className="h-24 px-4 text-center text-sm text-muted-foreground"
                  colSpan={table.getAllColumns().length}
                >
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SortHeader({
  label,
  column,
}: {
  label: string
  column: {
    toggleSorting: (desc?: boolean) => void
    getIsSorted: () => false | "asc" | "desc"
  }
}) {
  return (
    <button
      className="inline-flex items-center gap-1 text-xs font-medium tracking-wide uppercase"
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      type="button"
    >
      {label}
      <ChevronsUpDown data-icon="inline-end" />
    </button>
  )
}

function TablePagination<TData>({
  table,
}: {
  table: ReturnType<typeof useReactTable<TData>>
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-4">
      <div className="text-sm text-muted-foreground">
        Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
      </div>
      <div className="flex items-center gap-2">
        <select
          className="h-8 rounded-md border bg-background px-2 text-sm"
          onChange={(event) => table.setPageSize(Number(event.target.value))}
          value={table.getState().pagination.pageSize}
        >
          {[10, 15, 25].map((pageSize) => (
            <option key={pageSize} value={pageSize}>
              {pageSize} rows
            </option>
          ))}
        </select>
        <Button
          disabled={!table.getCanPreviousPage()}
          onClick={() => table.previousPage()}
          size="sm"
          type="button"
          variant="outline"
        >
          Previous
        </Button>
        <Button
          disabled={!table.getCanNextPage()}
          onClick={() => table.nextPage()}
          size="sm"
          type="button"
          variant="outline"
        >
          Next
        </Button>
      </div>
    </div>
  )
}

function AddPatientDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (message: string) => void
}) {
  const createPatient = useCreatePatient()
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    patientCode: "",
    notes: "",
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  if (!open) {
    return null
  }

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: "" }))
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = patientSchema.safeParse(form)

    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])
        )
      )
      return
    }

    const patient = await createPatient.mutateAsync(parsed.data)
    setForm({ firstName: "", lastName: "", patientCode: "", notes: "" })
    setErrors({})
    onCreated(`${patient.firstName} ${patient.lastName} was added.`)
    onOpenChange(false)
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background/80 p-6 backdrop-blur-sm">
      <form
        className="w-full max-w-lg rounded-lg border bg-card p-6 shadow-sm"
        onSubmit={submit}
      >
        <div>
          <h2 className="text-xl font-semibold">Add Patient</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a local POC patient record.
          </p>
        </div>
        <div className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">
            First Name
            <input
              aria-invalid={Boolean(errors.firstName)}
              className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              onChange={(event) => updateField("firstName", event.target.value)}
              value={form.firstName}
            />
            {errors.firstName ? (
              <span className="text-xs text-destructive">{errors.firstName}</span>
            ) : null}
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Last Name
            <input
              aria-invalid={Boolean(errors.lastName)}
              className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              onChange={(event) => updateField("lastName", event.target.value)}
              value={form.lastName}
            />
            {errors.lastName ? (
              <span className="text-xs text-destructive">{errors.lastName}</span>
            ) : null}
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Patient ID
            <input
              aria-invalid={Boolean(errors.patientCode)}
              className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              onChange={(event) => updateField("patientCode", event.target.value)}
              value={form.patientCode}
            />
            {errors.patientCode ? (
              <span className="text-xs text-destructive">{errors.patientCode}</span>
            ) : null}
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Notes
            <textarea
              className="min-h-24 rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              onChange={(event) => updateField("notes", event.target.value)}
              value={form.notes}
            />
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
            Cancel
          </Button>
          <Button disabled={createPatient.isPending} type="submit">
            {createPatient.isPending ? "Adding..." : "Add Patient"}
          </Button>
        </div>
      </form>
    </div>
  )
}

function PatientListPage({ onToast }: { onToast: (message: string) => void }) {
  const navigate = useNavigate()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [globalFilter, setGlobalFilter] = useState("")
  const [sorting, setSorting] = useState<SortingState>([])
  const patientsQuery = usePatients()
  const statsQuery = useDashboardStats()

  const columns = useMemo<ColumnDef<PatientWithStats>[]>(
    () => [
      {
        accessorKey: "fullName",
        header: ({ column }) => <SortHeader column={column} label="Patient" />,
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.fullName}</div>
            {row.original.notes ? (
              <div className="text-xs text-muted-foreground">{row.original.notes}</div>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "patientCode",
        header: ({ column }) => <SortHeader column={column} label="Patient ID" />,
      },
      {
        accessorKey: "totalSessions",
        header: ({ column }) => <SortHeader column={column} label="Sessions" />,
        cell: ({ getValue }) => (
          <span className="tabular-nums">{getValue<number>()}</span>
        ),
      },
      {
        accessorKey: "exerciseCount",
        header: ({ column }) => <SortHeader column={column} label="Exercises" />,
        cell: ({ getValue }) => (
          <span className="tabular-nums">{getValue<number>()}</span>
        ),
      },
      {
        accessorKey: "lastSessionDate",
        header: ({ column }) => <SortHeader column={column} label="Last Session" />,
        cell: ({ getValue }) => formatDate(getValue<string | undefined>()),
      },
      {
        accessorKey: "isActive",
        header: "Status",
        cell: ({ getValue }) => (
          <StatusBadge status={getValue<boolean>() ? "Active" : "Inactive"} />
        ),
      },
      {
        id: "navigate",
        header: "",
        cell: () => <ChevronRight className="text-muted-foreground" />,
      },
    ],
    []
  )

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: patientsQuery.data ?? [],
    columns,
    state: { globalFilter, sorting },
    initialState: { pagination: { pageSize: 10 } },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <main className="mx-auto flex w-full max-w-[1440px] flex-col gap-8 px-8 py-8">
      <PageHeader
        action={
          <Button onClick={() => setDialogOpen(true)} type="button">
            <Plus data-icon="inline-start" />
            Add Patient
          </Button>
        }
        description="Review Stella patient activity and exercise performance."
        title="Patients"
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total Patients" value={statsQuery.data?.totalPatients ?? "—"} />
        <MetricCard label="Total Sessions" value={statsQuery.data?.totalSessions ?? "—"} />
        <MetricCard label="This Month" value={statsQuery.data?.sessionsThisMonth ?? "—"} />
        <MetricCard label="Active Patients" value={statsQuery.data?.activePatients ?? "—"} />
      </div>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Patients</h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
              <input
                className="h-9 w-72 rounded-md border bg-background pr-3 pl-9 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                onChange={(event) => setGlobalFilter(event.target.value)}
                placeholder="Search patients..."
                value={globalFilter}
              />
            </div>
            <Button onClick={() => setDialogOpen(true)} type="button" variant="outline">
              <Plus data-icon="inline-start" />
              Add Patient
            </Button>
          </div>
        </div>
        <DataTable
          emptyMessage={patientsQuery.isLoading ? "Loading patients..." : "No patients found."}
          onRowClick={(patient) => navigate(`/patients/${patient.id}`)}
          table={table}
        />
        <TablePagination table={table} />
      </section>

      <AddPatientDialog
        onCreated={onToast}
        onOpenChange={setDialogOpen}
        open={dialogOpen}
      />
    </main>
  )
}

function PatientSummaryPage() {
  const navigate = useNavigate()
  const { patientId } = useParams()
  const patientQuery = usePatient(patientId)
  const sessionsQuery = usePatientSessions(patientId)
  const [sorting, setSorting] = useState<SortingState>([])
  const sessions = useMemo(() => sessionsQuery.data ?? [], [sessionsQuery.data])
  const summaries = useMemo(() => buildExerciseSummaries(sessions), [sessions])
  const firstSession = sessions.toSorted(
    (a, b) => new Date(a.sessionDate).getTime() - new Date(b.sessionDate).getTime()
  )[0]
  const lastSession = sessions[0]

  const columns = useMemo<ColumnDef<ExerciseSummary>[]>(
    () => [
      {
        accessorKey: "activity",
        header: ({ column }) => <SortHeader column={column} label="Exercise" />,
        cell: ({ getValue }) => {
          const definition = exerciseDefinitions[getValue<ExerciseType>()]
          return (
            <div>
              <div className="font-medium">{definition.label}</div>
              <div className="text-xs text-muted-foreground">{definition.description}</div>
            </div>
          )
        },
      },
      {
        accessorKey: "sessions",
        header: ({ column }) => <SortHeader column={column} label="Sessions" />,
        cell: ({ getValue }) => (
          <span className="tabular-nums">{getValue<number>()}</span>
        ),
      },
      {
        accessorKey: "lastSessionDate",
        header: ({ column }) => <SortHeader column={column} label="Last Session" />,
        cell: ({ getValue }) => formatDate(getValue<string>(), "MMM d"),
      },
      {
        accessorKey: "primaryMetric",
        header: "Performance",
        cell: ({ row, getValue }) => {
          const definition = exerciseDefinitions[row.original.activity]
          return (
            <div>
              <div className="font-medium">{getValue<string>()}</div>
              <div className="text-xs text-muted-foreground">
                {definition.patientSummary[0].label}
              </div>
            </div>
          )
        },
      },
      {
        accessorKey: "secondaryMetric",
        header: "Response / Secondary",
        cell: ({ row, getValue }) => {
          const definition = exerciseDefinitions[row.original.activity]
          return (
            <div>
              <div className="font-medium">{getValue<string>()}</div>
              <div className="text-xs text-muted-foreground">
                {definition.patientSummary[1].label}
              </div>
            </div>
          )
        },
      },
      {
        id: "navigate",
        header: "",
        cell: () => <ChevronRight className="text-muted-foreground" />,
      },
    ],
    []
  )

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: summaries,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  if (!patientQuery.isLoading && !patientQuery.data) {
    return <Navigate replace to="/" />
  }

  const patient = patientQuery.data
  const patientName = patient ? `${patient.firstName} ${patient.lastName}` : "Patient"

  return (
    <main className="mx-auto flex w-full max-w-[1440px] flex-col gap-8 px-8 py-8">
      <div className="flex flex-col gap-4">
        <nav className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link className="hover:text-foreground" to="/">
            Patients
          </Link>
          <span>/</span>
          <span className="text-foreground">{patientName}</span>
        </nav>
        <PageHeader
          description={
            patient
              ? `${sessions.length} sessions • Last session ${formatDate(lastSession?.sessionDate)}`
              : "Loading patient activity."
          }
          title={patientName}
        />
        {patient ? (
          <div className="text-sm text-muted-foreground">Patient ID {patient.patientCode}</div>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total Sessions" value={sessions.length} />
        <MetricCard label="Exercises" value={summaries.length} />
        <MetricCard label="First Session" value={formatDate(firstSession?.sessionDate)} />
        <MetricCard label="Last Session" value={formatDate(lastSession?.sessionDate)} />
      </div>

      {patient && sessions.length > 0 ? (
        <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          {patient.firstName} has completed {sessions.length} Stella sessions across{" "}
          {summaries.length} exercise types since {formatDate(firstSession?.sessionDate)}. The
          most recent session was {exerciseDefinitions[lastSession.activity].label} on{" "}
          {formatDate(lastSession.sessionDate)}.
        </div>
      ) : null}

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Exercises</h2>
        <DataTable
          emptyMessage={sessionsQuery.isLoading ? "Loading exercises..." : "No exercises found."}
          onRowClick={(summary) =>
            navigate(`/patients/${patientId}/exercises/${summary.activity}`)
          }
          table={table}
        />
      </section>
    </main>
  )
}

type ChartDatum = {
  date: string
  displayDate: string
} & Record<string, string | number>

function buildChartData(sessions: ExerciseSession[], metrics: MetricDefinition[]) {
  return sessions.map((session) => {
    const datum: ChartDatum = {
      date: session.sessionDate,
      displayDate: formatDate(session.sessionDate, "MMM d"),
    }

    for (const metric of metrics) {
      const value = getSessionDisplayValue(session, metric.key)
      if (typeof value === "number") {
        datum[metric.key] = value
      }
    }

    return datum
  })
}

function ChartPanel({ metric, data }: { metric: MetricDefinition; data: ChartDatum[] }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div>
        <h3 className="font-medium">{metric.label}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Session-level measured performance over time.
        </p>
      </div>
      <div className="mt-4 h-72">
        <ResponsiveContainer height="100%" width="100%">
          <LineChart data={data} margin={{ left: 0, right: 18, top: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="displayDate" tickLine={false} />
            <YAxis tickLine={false} width={42} />
            <Tooltip
              formatter={(value) => [formatMetricValue(value, metric.format), metric.label]}
              labelFormatter={(_, payload) =>
                payload[0]?.payload?.date
                  ? formatDate(payload[0].payload.date, "MMM d, yyyy")
                  : ""
              }
            />
            <Line
              activeDot={{ r: 5 }}
              dataKey={metric.key}
              dot={{ r: 3 }}
              stroke="var(--primary)"
              strokeWidth={2}
              type="monotone"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function SessionDetails({ session }: { session: ExerciseSession }) {
  const configRows: Array<[string, unknown]> = []
  const resultRows: Array<[string, unknown, string?]> = []

  if ("contentMode" in session) {
    configRows.push(["Content", displayText(session.contentMode)])
  }
  if ("wordLength" in session && session.wordLength) {
    configRows.push(["Word Length", session.wordLength])
  }
  if ("audioMode" in session) {
    configRows.push(["Audio", displayText(session.audioMode)])
  }
  if ("tempoBpm" in session && session.tempoBpm) {
    configRows.push(["Tempo", `${session.tempoBpm} BPM`])
  }
  if ("pattern" in session) {
    configRows.push(["Pattern", displayText(session.pattern)])
  }
  if ("rulePreset" in session) {
    configRows.push(["Rule Preset", displayText(session.rulePreset)])
    configRows.push(["Response Window", `${session.responseWindowMs} ms`])
  }
  if ("contentType" in session) {
    configRows.push(["Content Type", displayText(session.contentType)])
    configRows.push(["Sequence Length", session.sequenceLength])
  }

  if ("totalAttempts" in session) {
    resultRows.push(["Total Attempts", session.totalAttempts])
    resultRows.push(["Correct Hits", session.correctHits])
  }
  if ("onBeatAccuracyPercent" in session && session.onBeatAccuracyPercent) {
    resultRows.push(["On-Beat Accuracy", session.onBeatAccuracyPercent, "percent"])
  }
  if ("timingVariabilityStdDev" in session && session.timingVariabilityStdDev) {
    resultRows.push(["Timing Variability", session.timingVariabilityStdDev, "milliseconds"])
  }
  if ("directionalConsistencyPercent" in session && session.directionalConsistencyPercent) {
    resultRows.push([
      "Directional Consistency",
      session.directionalConsistencyPercent,
      "percent",
    ])
  }
  resultRows.push(["Engagement Time", session.activeEngagementTimeMinutes, "duration"])
  resultRows.push(["Session Duration", session.totalSessionDurationMinutes, "duration"])

  return (
    <div className="grid gap-6 rounded-lg border bg-muted/30 p-4 md:grid-cols-2">
      <div>
        <div className="text-sm font-medium">Configuration</div>
        <div className="mt-3 flex flex-col gap-2">
          {configRows.map(([label, value]) => (
            <div className="flex justify-between gap-4 text-sm" key={label}>
              <span className="text-muted-foreground">{label}</span>
              <span className="font-medium">{String(value)}</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="text-sm font-medium">Additional Results</div>
        <div className="mt-3 flex flex-col gap-2">
          {resultRows.map(([label, value, valueFormat]) => (
            <div className="flex justify-between gap-4 text-sm" key={label}>
              <span className="text-muted-foreground">{label}</span>
              <span className="font-medium">{formatMetricValue(value, valueFormat)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ExerciseDetailsPage() {
  const { patientId, exerciseType } = useParams()
  const navigate = useNavigate()
  const typedExercise = exerciseTypes.includes(exerciseType as ExerciseType)
    ? (exerciseType as ExerciseType)
    : undefined
  const patientQuery = usePatient(patientId)
  const sessionsQuery = useExerciseSessions(patientId, typedExercise)
  const [expandedSession, setExpandedSession] = useState<string | null>(null)
  const sessions = sessionsQuery.data ?? []

  if (!typedExercise || (!patientQuery.isLoading && !patientQuery.data)) {
    return <Navigate replace to="/" />
  }

  const patient = patientQuery.data
  const definition = exerciseDefinitions[typedExercise]
  const patientName = patient ? `${patient.firstName} ${patient.lastName}` : "Patient"
  const chartData = buildChartData(sessions, definition.charts)
  const firstSession = sessions[0]
  const lastSession = sessions[sessions.length - 1]

  return (
    <main className="mx-auto flex w-full max-w-[1440px] flex-col gap-8 px-8 py-8">
      <div className="flex flex-col gap-4">
        <nav className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Link className="hover:text-foreground" to="/">
            Patients
          </Link>
          <span>/</span>
          <Link className="hover:text-foreground" to={`/patients/${patientId}`}>
            {patientName}
          </Link>
          <span>/</span>
          <span className="text-foreground">{definition.label}</span>
        </nav>
        <div>
          <Button
            onClick={() => navigate(`/patients/${patientId}`)}
            type="button"
            variant="ghost"
          >
            <ArrowLeft data-icon="inline-start" />
            Back to patient
          </Button>
        </div>
        <PageHeader
          description={`${patientName} • ${sessions.length} sessions • ${formatDate(firstSession?.sessionDate, "MMM d")} – ${formatDate(lastSession?.sessionDate, "MMM d, yyyy")}`}
          title={definition.label}
        />
        <p className="max-w-2xl text-sm text-muted-foreground">{definition.description}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {definition.summaryCards.map((metric) => (
          <MetricCard
            key={metric.key}
            label={metric.label}
            value={formatMetricValue(
              getExerciseAggregateValue(sessions, metric.key),
              metric.format
            )}
          />
        ))}
      </div>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-xl font-semibold">Performance Over Time</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Session-level measured performance over time.
          </p>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {definition.charts.slice(0, 2).map((metric) => (
            <ChartPanel data={chartData} key={metric.key} metric={metric} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Sessions</h2>
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] border-collapse text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <th className="h-11 px-4 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Date
                  </th>
                  {definition.tableColumns.map((column) => (
                    <th
                      className="h-11 px-4 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase"
                      key={column.key}
                    >
                      {column.label}
                    </th>
                  ))}
                  <th className="h-11 px-4 text-left" />
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => {
                  const isExpanded = expandedSession === session.sessionId

                  return (
                    <tr className="border-t" key={session.sessionId}>
                      <td className="h-[52px] px-4 align-middle font-medium">
                        {formatDate(session.sessionDate, "MMM d")}
                      </td>
                      {definition.tableColumns.map((column) => {
                        const value = getSessionDisplayValue(session, column.key)
                        const statusValue =
                          column.key === "status"
                            ? displayText(value) === "Completed"
                              ? "Completed"
                              : "Ended Early"
                            : null

                        return (
                          <td className="h-[52px] px-4 align-middle" key={column.key}>
                            {statusValue ? (
                              <StatusBadge status={statusValue} />
                            ) : (
                              <span className="tabular-nums">
                                {formatMetricValue(
                                  column.format === "text" ? displayText(value) : value,
                                  column.format
                                )}
                              </span>
                            )}
                          </td>
                        )
                      })}
                      <td className="h-[52px] px-4 align-middle">
                        <Button
                          aria-expanded={isExpanded}
                          onClick={() =>
                            setExpandedSession(isExpanded ? null : session.sessionId)
                          }
                          size="icon-sm"
                          type="button"
                          variant="ghost"
                        >
                          {isExpanded ? <ChevronDown /> : <ChevronRight />}
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {expandedSession ? (
            <div className="border-t p-4">
              <SessionDetails
                session={
                  sessions.find((session) => session.sessionId === expandedSession) ??
                  sessions[0]
                }
              />
            </div>
          ) : null}
        </div>
      </section>
    </main>
  )
}

function AppShell({ children, toast }: { children: React.ReactNode; toast: string }) {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center justify-between gap-4 px-8">
          <Link className="flex min-w-0 flex-col" to="/">
            <span className="text-base font-semibold">Stella</span>
            <span className="text-xs text-muted-foreground">Patient Reporting</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <div className="hidden text-right sm:block">
              <div className="font-medium">Clinician User</div>
              <div className="text-xs text-muted-foreground">Reporting POC</div>
            </div>
            <div className="flex size-9 items-center justify-center rounded-full border bg-muted">
              <UserRound />
            </div>
          </div>
        </div>
      </header>
      {children}
      {toast ? (
        <div className="fixed right-6 bottom-6 rounded-lg border bg-card px-4 py-3 text-sm shadow-sm">
          {toast}
        </div>
      ) : null}
    </div>
  )
}

export function App() {
  const [toast, setToast] = useState("")

  function showToast(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(""), 3000)
  }

  return (
    <AppShell toast={toast}>
      <Routes>
        <Route element={<PatientListPage onToast={showToast} />} path="/" />
        <Route element={<PatientSummaryPage />} path="/patients/:patientId" />
        <Route
          element={<ExerciseDetailsPage />}
          path="/patients/:patientId/exercises/:exerciseType"
        />
        <Route element={<Navigate replace to="/" />} path="*" />
      </Routes>
    </AppShell>
  )
}

export default App
