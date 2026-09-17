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
import { Popover } from "@base-ui/react/popover"
import { format, parseISO } from "date-fns"
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  LogOut,
  Plus,
  Search,
  UserRound,
} from "lucide-react"
import { Fragment, useEffect, useMemo, useState } from "react"
import {
  Link,
  matchPath,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
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
import { useAuth } from "@/components/auth/auth-context"
import { LoginPage } from "@/components/auth/login-page"
import { ExerciseControlPanel } from "@/components/exercise-control/exercise-control-panel"
import { FeedbackWidget } from "@/components/feedback/feedback-widget"
import {
  PatientTabs,
  type PatientDetailTab,
} from "@/components/patients/patient-tabs"
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
  SessionFilterDefinition,
} from "@/types"

const patientSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
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

  if (/^\d+(-\d+|\+)$/.test(value)) {
    return value
  }

  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

type SessionFilterOption = {
  value: string
  label: string
}

type SessionFilterGroup = SessionFilterDefinition & {
  options: SessionFilterOption[]
}

type SessionFilterState = Record<string, string[]>
type SessionSortDirection = "asc" | "desc"
type SessionSortState = {
  key: string
  direction: SessionSortDirection
}

const DEFAULT_SESSION_SORT: SessionSortState = {
  key: "sessionDate",
  direction: "desc",
}

function getFilterValue(session: ExerciseSession, key: string) {
  const value = getSessionDisplayValue(session, key)

  if (value === undefined || value === null || value === "") {
    return undefined
  }

  return String(value)
}

function formatFilterOptionLabel(value: string) {
  if (value === "silent") {
    return "None"
  }

  if (value === "left-right") {
    return "Left / Right"
  }

  if (/^\d+(\.\d+)?$/.test(value)) {
    return value
  }

  return displayText(value)
}

function compareFilterValues(left: string, right: string) {
  const leftNumber = Number(left)
  const rightNumber = Number(right)

  if (!Number.isNaN(leftNumber) && !Number.isNaN(rightNumber)) {
    return leftNumber - rightNumber
  }

  const leftRange = /^(\d+)/.exec(left)
  const rightRange = /^(\d+)/.exec(right)

  if (leftRange && rightRange) {
    return Number(leftRange[1]) - Number(rightRange[1])
  }

  return formatFilterOptionLabel(left).localeCompare(
    formatFilterOptionLabel(right)
  )
}

function getComparableSessionValue(session: ExerciseSession, key: string) {
  if (key === "sessionDate") {
    return new Date(session.sessionDate).getTime()
  }

  const value = getSessionDisplayValue(session, key)

  if (typeof value === "number") {
    return value
  }

  if (typeof value !== "string") {
    return String(value ?? "")
  }

  if (/^\d+\/\d+$/.test(value)) {
    const [completed, total] = value.split("/").map(Number)
    return total === 0 ? 0 : completed / total
  }

  if (/^\d+(\.\d+)?$/.test(value)) {
    return Number(value)
  }

  return displayText(value).toLowerCase()
}

function compareSessionValues(
  left: ExerciseSession,
  right: ExerciseSession,
  key: string
) {
  const leftValue = getComparableSessionValue(left, key)
  const rightValue = getComparableSessionValue(right, key)

  if (typeof leftValue === "number" && typeof rightValue === "number") {
    return leftValue - rightValue
  }

  return String(leftValue).localeCompare(String(rightValue))
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
      {helper ? (
        <div className="mt-1 text-sm text-muted-foreground">{helper}</div>
      ) : null}
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
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {description}
          </p>
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
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
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
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
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
        Page {table.getState().pagination.pageIndex + 1} of{" "}
        {table.getPageCount() || 1}
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
          parsed.error.issues.map((issue) => [
            String(issue.path[0]),
            issue.message,
          ])
        )
      )
      return
    }

    const patient = await createPatient.mutateAsync(parsed.data)
    setForm({ firstName: "", lastName: "", notes: "" })
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
            Create a local POC patient record. Patient ID will be assigned
            automatically.
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
              <span className="text-xs text-destructive">
                {errors.firstName}
              </span>
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
              <span className="text-xs text-destructive">
                {errors.lastName}
              </span>
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
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
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
  const [sorting, setSorting] = useState<SortingState>([
    { id: "isActive", desc: true },
    { id: "lastSessionDate", desc: true },
  ])
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
              <div className="text-xs text-muted-foreground">
                {row.original.notes}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "patientCode",
        header: ({ column }) => (
          <SortHeader column={column} label="Patient ID" />
        ),
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
        header: ({ column }) => (
          <SortHeader column={column} label="Exercises" />
        ),
        cell: ({ getValue }) => (
          <span className="tabular-nums">{getValue<number>()}</span>
        ),
      },
      {
        accessorKey: "lastSessionDate",
        header: ({ column }) => (
          <SortHeader column={column} label="Last Session" />
        ),
        cell: ({ getValue }) => formatDate(getValue<string | undefined>()),
      },
      {
        accessorKey: "isActive",
        header: ({ column }) => <SortHeader column={column} label="Status" />,
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
        <MetricCard
          label="Total Patients"
          value={statsQuery.data?.totalPatients ?? "—"}
        />
        <MetricCard
          label="Total Sessions"
          value={statsQuery.data?.totalSessions ?? "—"}
        />
        <MetricCard
          label="This Month"
          value={statsQuery.data?.sessionsThisMonth ?? "—"}
        />
        <MetricCard
          label="Active Patients"
          value={statsQuery.data?.activePatients ?? "—"}
        />
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
          </div>
        </div>
        <DataTable
          emptyMessage={
            patientsQuery.isLoading
              ? "Loading patients..."
              : "No patients found."
          }
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

function PatientSummaryPage({
  onToast,
}: {
  onToast: (message: string) => void
}) {
  const navigate = useNavigate()
  const { patientId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const patientQuery = usePatient(patientId)
  const sessionsQuery = usePatientSessions(patientId)
  const [sorting, setSorting] = useState<SortingState>([])
  const sessions = useMemo(() => sessionsQuery.data ?? [], [sessionsQuery.data])
  const summaries = useMemo(() => buildExerciseSummaries(sessions), [sessions])
  const firstSession = sessions.toSorted(
    (a, b) =>
      new Date(a.sessionDate).getTime() - new Date(b.sessionDate).getTime()
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
              <div className="text-xs text-muted-foreground">
                {definition.description}
              </div>
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
        header: ({ column }) => (
          <SortHeader column={column} label="Last Session" />
        ),
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
  const patientName = patient
    ? `${patient.firstName} ${patient.lastName}`
    : "Patient"
  const activeTab: PatientDetailTab =
    searchParams.get("tab") === "exercise-control"
      ? "exercise-control"
      : "dashboard"

  function changeTab(tab: PatientDetailTab) {
    const nextSearchParams = new URLSearchParams(searchParams)

    if (tab === "dashboard") {
      nextSearchParams.delete("tab")
    } else {
      nextSearchParams.set("tab", tab)
    }

    setSearchParams(nextSearchParams)
  }

  return (
    <main className="mx-auto flex w-full max-w-[1440px] flex-col gap-8 px-8 py-8">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
        <h1 className="text-3xl font-semibold tracking-normal">
          {patientName}
        </h1>
        <div className="text-sm text-muted-foreground">
          {patient
            ? `${sessions.length} sessions • Last session ${formatDate(lastSession?.sessionDate)}`
            : "Loading patient activity."}
        </div>
        {patient ? (
          <div className="text-sm text-muted-foreground">
            Patient ID {patient.patientCode}
          </div>
        ) : null}
      </div>

      <PatientTabs activeTab={activeTab} onTabChange={changeTab} />

      {activeTab === "dashboard" ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Total Sessions" value={sessions.length} />
            <MetricCard label="Exercises" value={summaries.length} />
            <MetricCard
              label="First Session"
              value={formatDate(firstSession?.sessionDate)}
            />
            <MetricCard
              label="Last Session"
              value={formatDate(lastSession?.sessionDate)}
            />
          </div>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-semibold">Exercises</h2>
            <DataTable
              emptyMessage={
                sessionsQuery.isLoading
                  ? "Loading exercises..."
                  : "No exercises found."
              }
              onRowClick={(summary) =>
                navigate(`/patients/${patientId}/exercises/${summary.activity}`)
              }
              table={table}
            />
          </section>
        </>
      ) : patientId ? (
        <ExerciseControlPanel
          onToast={onToast}
          onViewDashboard={() => changeTab("dashboard")}
          patientId={patientId}
          patientName={patientName}
        />
      ) : null}
    </main>
  )
}

type ChartDatum = {
  date: string
  displayDate: string
} & Record<string, string | number>

function buildChartData(
  sessions: ExerciseSession[],
  metrics: MetricDefinition[]
) {
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

function ChartPanel({
  metric,
  data,
}: {
  metric: MetricDefinition
  data: ChartDatum[]
}) {
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
          <LineChart
            data={data}
            margin={{ left: 0, right: 18, top: 8, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="displayDate" tickLine={false} />
            <YAxis tickLine={false} width={42} />
            <Tooltip
              formatter={(value) => [
                formatMetricValue(value, metric.format),
                metric.label,
              ]}
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

function SessionTableSortHeader({
  label,
  sortKey,
  sortState,
  onToggleSort,
}: {
  label: string
  sortKey: string
  sortState: SessionSortState
  onToggleSort: (key: string) => void
}) {
  const isActive = sortState.key === sortKey

  return (
    <button
      className="inline-flex items-center gap-1 text-xs font-medium tracking-wide uppercase"
      onClick={() => onToggleSort(sortKey)}
      type="button"
    >
      {label}
      <span
        className={cn(
          "text-muted-foreground",
          isActive ? "text-foreground" : ""
        )}
      >
        {isActive ? (sortState.direction === "asc" ? "↑" : "↓") : "↕"}
      </span>
    </button>
  )
}

function ConfigurationFilters({
  filters,
  activeFilters,
  filteredCount,
  totalCount,
  onClearFilters,
  onToggleFilter,
}: {
  filters: SessionFilterGroup[]
  activeFilters: SessionFilterState
  filteredCount: number
  totalCount: number
  onClearFilters: () => void
  onToggleFilter: (filterKey: string, value: string) => void
}) {
  if (filters.length === 0) {
    return null
  }

  const hasActiveFilters = filters.some(
    (filter) => (activeFilters[filter.key] ?? []).length > 0
  )

  return (
    <div className="overflow-x-auto rounded-lg border bg-muted/30">
      <div className="flex min-w-max items-end gap-3 p-4">
        <div className="mr-2 min-w-52 self-center">
          <div className="text-sm font-medium">Filters</div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {hasActiveFilters
              ? `Showing ${filteredCount} of ${totalCount} sessions`
              : `Showing all ${totalCount} sessions`}
          </p>
        </div>
        {filters.map((filter) => {
          const selectedValues = activeFilters[filter.key] ?? []
          const selectionLabel =
            selectedValues.length === 0
              ? "All"
              : selectedValues.length === 1
                ? (filter.options.find(
                    (option) => option.value === selectedValues[0]
                  )?.label ?? "1 selected")
                : `${selectedValues.length} selected`

          return (
            <div className="flex min-w-40 flex-col gap-1.5" key={filter.key}>
              <span className="text-xs font-medium text-muted-foreground">
                {filter.label}
              </span>
              <Popover.Root>
                <Popover.Trigger className="flex h-9 min-w-40 items-center justify-between gap-3 rounded-md border bg-background px-3 text-left text-sm outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50">
                  <span className="max-w-36 truncate">{selectionLabel}</span>
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Positioner
                    align="start"
                    className="z-50"
                    sideOffset={6}
                  >
                    <Popover.Popup className="min-w-48 rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-none">
                      <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                        {filter.label}
                      </div>
                      {filter.options.map((option) => {
                        const isSelected = selectedValues.includes(option.value)

                        return (
                          <label
                            className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-sm hover:bg-muted"
                            key={option.value}
                          >
                            <input
                              checked={isSelected}
                              className="size-4 accent-primary"
                              onChange={() =>
                                onToggleFilter(filter.key, option.value)
                              }
                              type="checkbox"
                            />
                            <span>{option.label}</span>
                          </label>
                        )
                      })}
                    </Popover.Popup>
                  </Popover.Positioner>
                </Popover.Portal>
              </Popover.Root>
            </div>
          )
        })}
        <Button
          disabled={!hasActiveFilters}
          onClick={onClearFilters}
          type="button"
          variant="outline"
        >
          Clear
        </Button>
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
  if ("itemsPerSession" in session && session.itemsPerSession) {
    configRows.push(["Items", session.itemsPerSession])
  }
  if ("wordLength" in session && session.wordLength) {
    configRows.push(["Word Length", session.wordLength])
  }
  if ("audioMode" in session) {
    configRows.push([
      "Beat",
      session.audioMode === "silent" ? "None" : displayText(session.audioMode),
    ])
  }
  if ("tempoBpm" in session && session.tempoBpm) {
    configRows.push(["Tempo", `${session.tempoBpm} BPM`])
  }
  if (session.musicPlaybackRate) {
    configRows.push(["Music Speed", `${session.musicPlaybackRate.toFixed(1)}x`])
  }
  if ("timeoutSeconds" in session && session.timeoutSeconds) {
    configRows.push(["Response Timeout", `${session.timeoutSeconds} seconds`])
  }
  if ("mode" in session && session.mode) {
    configRows.push(["Target Order", displayText(session.mode)])
  }
  if ("pattern" in session) {
    configRows.push(["Pattern", displayText(session.pattern)])
  }
  if ("intervalMs" in session && session.intervalMs) {
    configRows.push(["Target Interval", `${session.intervalMs} ms`])
  }
  if ("rulePreset" in session) {
    configRows.push(["Trial Count", session.trialCount])
    configRows.push(["Trial Mix", displayText(session.rulePreset)])
    configRows.push(["Response Window", `${session.responseWindowMs} ms`])
    configRows.push(["Cue Speed", `${session.cueSpeedBpm} BPM`])
  }
  if ("contentType" in session) {
    configRows.push(["Content Type", displayText(session.contentType)])
    configRows.push(["Sequence Length", session.sequenceLength])
    configRows.push(["Sequence Count", session.sequenceCount])
    configRows.push([
      "Presentation Speed",
      `${session.presentationSpeedBpm} BPM`,
    ])
  }

  if ("totalAttempts" in session) {
    resultRows.push(["Total Attempts", session.totalAttempts])
    resultRows.push(["Correct Hits", session.correctHits])
  }
  if ("goAccuracyPercent" in session) {
    resultRows.push(["Go Accuracy", session.goAccuracyPercent, "percent"])
    resultRows.push(["No-Go Accuracy", session.noGoAccuracyPercent, "percent"])
    resultRows.push(["Missed Go Rate", session.missedGoRatePercent, "percent"])
    resultRows.push([
      "Mean Go Latency",
      session.meanGoLatencyMs,
      "milliseconds",
    ])
  }
  if ("sequenceCompletionRatePercent" in session) {
    resultRows.push([
      "Sequence Completion",
      session.sequenceCompletionRatePercent,
      "percent",
    ])
    resultRows.push([
      "First-Attempt Accuracy",
      session.firstAttemptSequenceAccuracyPercent,
      "percent",
    ])
    resultRows.push([
      "Longest Completed Sequence",
      session.longestCompletedSequence,
      "count",
    ])
    resultRows.push([
      "Mean Completion Time",
      session.meanCompletionTimeMs,
      "milliseconds",
    ])
  }
  if ("onBeatAccuracyPercent" in session && session.onBeatAccuracyPercent) {
    resultRows.push([
      "On-Beat Accuracy",
      session.onBeatAccuracyPercent,
      "percent",
    ])
  }
  if ("timingVariabilityStdDev" in session && session.timingVariabilityStdDev) {
    resultRows.push([
      "Timing Variability",
      session.timingVariabilityStdDev,
      "milliseconds",
    ])
  }
  if (
    "directionalConsistencyPercent" in session &&
    session.directionalConsistencyPercent
  ) {
    resultRows.push([
      "Directional Consistency",
      session.directionalConsistencyPercent,
      "percent",
    ])
  }
  resultRows.push([
    "Engagement Time",
    session.activeEngagementTimeMinutes,
    "duration",
  ])
  resultRows.push([
    "Session Duration",
    session.totalSessionDurationMinutes,
    "duration",
  ])

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="overflow-hidden rounded-md border bg-background">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/60">
            <tr>
              <th className="px-3 py-2.5 text-left font-medium" colSpan={2}>
                Configuration
              </th>
            </tr>
          </thead>
          <tbody>
            {configRows.map(([label, value]) => (
              <tr className="border-t" key={label}>
                <th className="w-1/2 border-r px-3 py-2.5 text-left font-normal text-muted-foreground">
                  {label}
                </th>
                <td className="px-3 py-2.5 font-medium">{String(value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="overflow-hidden rounded-md border bg-background">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/60">
            <tr>
              <th className="px-3 py-2.5 text-left font-medium" colSpan={2}>
                Additional Results
              </th>
            </tr>
          </thead>
          <tbody>
            {resultRows.map(([label, value, valueFormat]) => (
              <tr className="border-t" key={label}>
                <th className="w-1/2 border-r px-3 py-2.5 text-left font-normal text-muted-foreground">
                  {label}
                </th>
                <td className="px-3 py-2.5 font-medium">
                  {formatMetricValue(value, valueFormat)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
  const [activeFilters, setActiveFilters] = useState<SessionFilterState>({})
  const [sortState, setSortState] =
    useState<SessionSortState>(DEFAULT_SESSION_SORT)
  const sessions = useMemo(() => sessionsQuery.data ?? [], [sessionsQuery.data])
  const definition = typedExercise ? exerciseDefinitions[typedExercise] : null

  useEffect(() => {
    // Route changes must clear exercise-specific table state before rendering the next activity.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpandedSession(null)
    setActiveFilters({})
    setSortState(DEFAULT_SESSION_SORT)
  }, [typedExercise])

  const filters = useMemo<SessionFilterGroup[]>(() => {
    if (!definition) {
      return []
    }

    return definition.configurationFilters
      .map((filter) => {
        const values = Array.from(
          new Set(
            sessions
              .map((session) => getFilterValue(session, filter.key))
              .filter((value): value is string => Boolean(value))
          )
        ).sort(compareFilterValues)

        return {
          ...filter,
          options: values.map((value) => ({
            value,
            label: formatFilterOptionLabel(value),
          })),
        }
      })
      .filter((filter) => filter.options.length > 1)
  }, [definition, sessions])

  const filteredSessions = useMemo(
    () =>
      sessions.filter((session) =>
        filters.every((filter) => {
          const selectedValues = activeFilters[filter.key] ?? []

          if (selectedValues.length === 0) {
            return true
          }

          const value = getFilterValue(session, filter.key)
          return value ? selectedValues.includes(value) : false
        })
      ),
    [activeFilters, filters, sessions]
  )

  const sortedSessions = useMemo(() => {
    const nextSessions = [...filteredSessions]
    nextSessions.sort((left, right) => {
      const comparison = compareSessionValues(left, right, sortState.key)
      return sortState.direction === "asc" ? comparison : -comparison
    })
    return nextSessions
  }, [filteredSessions, sortState])

  const hasActiveFilters = filters.some(
    (filter) => (activeFilters[filter.key] ?? []).length > 0
  )
  const chartData = buildChartData(filteredSessions, definition?.charts ?? [])

  const emptyFilterMessage = hasActiveFilters
    ? "No sessions match the selected configuration filters."
    : "No sessions recorded for this exercise yet."

  if (
    !typedExercise ||
    !definition ||
    (!patientQuery.isLoading && !patientQuery.data)
  ) {
    return <Navigate replace to="/" />
  }

  function toggleFilter(filterKey: string, value: string) {
    setExpandedSession(null)
    setActiveFilters((current) => {
      const selectedValues = current[filterKey] ?? []
      const nextValues = selectedValues.includes(value)
        ? selectedValues.filter((item) => item !== value)
        : [...selectedValues, value]

      if (nextValues.length === 0) {
        const nextFilters = { ...current }
        delete nextFilters[filterKey]
        return nextFilters
      }

      return {
        ...current,
        [filterKey]: nextValues,
      }
    })
  }

  function clearFilters() {
    setExpandedSession(null)
    setActiveFilters({})
  }

  function toggleSort(key: string) {
    setExpandedSession(null)
    setSortState((current) =>
      current.key === key
        ? {
            key,
            direction: current.direction === "asc" ? "desc" : "asc",
          }
        : {
            key,
            direction: key === "sessionDate" ? "desc" : "asc",
          }
    )
  }

  return (
    <main className="mx-auto flex w-full max-w-[1440px] flex-col gap-8 px-8 py-8">
      <div>
        <PageHeader
          action={
            <Button
              onClick={() => navigate(`/patients/${patientId}`)}
              type="button"
              variant="ghost"
            >
              <ArrowLeft data-icon="inline-start" />
              Back to patient
            </Button>
          }
          title={definition.label}
        />
      </div>

      <ConfigurationFilters
        activeFilters={activeFilters}
        filteredCount={filteredSessions.length}
        filters={filters}
        onClearFilters={clearFilters}
        onToggleFilter={toggleFilter}
        totalCount={sessions.length}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {definition.summaryCards.map((metric) => (
          <MetricCard
            key={metric.key}
            label={metric.label}
            value={formatMetricValue(
              getExerciseAggregateValue(filteredSessions, metric.key),
              metric.format
            )}
          />
        ))}
      </div>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-xl font-semibold">Performance Over Time</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Session-level measured performance for the selected configurations.
          </p>
        </div>
        {filteredSessions.length > 0 ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {definition.charts.slice(0, 2).map((metric) => (
              <ChartPanel data={chartData} key={metric.key} metric={metric} />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed bg-card px-4 py-8 text-sm text-muted-foreground">
            {sessionsQuery.isLoading
              ? "Loading sessions..."
              : emptyFilterMessage}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-xl font-semibold">Sessions</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Review and sort the sessions included in the report.
          </p>
        </div>
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <th className="h-11 px-4 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    <SessionTableSortHeader
                      label="Date"
                      onToggleSort={toggleSort}
                      sortKey="sessionDate"
                      sortState={sortState}
                    />
                  </th>
                  {definition.tableColumns.map((column) => (
                    <th
                      className="h-11 px-4 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase"
                      key={column.key}
                    >
                      <SessionTableSortHeader
                        label={column.label}
                        onToggleSort={toggleSort}
                        sortKey={column.key}
                        sortState={sortState}
                      />
                    </th>
                  ))}
                  <th className="h-11 px-4 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedSessions.length > 0 ? (
                  sortedSessions.map((session) => {
                    const isExpanded = expandedSession === session.sessionId

                    return (
                      <Fragment key={session.sessionId}>
                        <tr className="border-t">
                          <td className="h-[52px] px-4 align-middle font-medium">
                            {formatDate(session.sessionDate, "MMM d")}
                          </td>
                          {definition.tableColumns.map((column) => {
                            const value = getSessionDisplayValue(
                              session,
                              column.key
                            )
                            const statusValue =
                              column.key === "status"
                                ? displayText(value) === "Completed"
                                  ? "Completed"
                                  : "Ended Early"
                                : null

                            return (
                              <td
                                className="h-[52px] px-4 align-middle"
                                key={column.key}
                              >
                                {statusValue ? (
                                  <StatusBadge status={statusValue} />
                                ) : (
                                  <span className="tabular-nums">
                                    {formatMetricValue(
                                      column.format === "text"
                                        ? displayText(value)
                                        : value,
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
                                setExpandedSession(
                                  isExpanded ? null : session.sessionId
                                )
                              }
                              size="sm"
                              type="button"
                              variant="ghost"
                            >
                              {isExpanded ? "Hide" : "View"}
                            </Button>
                          </td>
                        </tr>
                        {isExpanded ? (
                          <tr className="border-t bg-muted/15">
                            <td
                              className="p-4"
                              colSpan={definition.tableColumns.length + 2}
                            >
                              <SessionDetails session={session} />
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    )
                  })
                ) : (
                  <tr className="border-t">
                    <td
                      className="h-24 px-4 text-center text-sm text-muted-foreground"
                      colSpan={definition.tableColumns.length + 2}
                    >
                      {sessionsQuery.isLoading
                        ? "Loading sessions..."
                        : emptyFilterMessage}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  )
}

function HeaderBreadcrumbs() {
  const location = useLocation()
  const exerciseMatch = matchPath(
    "/patients/:patientId/exercises/:exerciseType",
    location.pathname
  )
  const patientMatch = matchPath("/patients/:patientId", location.pathname)
  const patientId =
    exerciseMatch?.params.patientId ?? patientMatch?.params.patientId
  const patientQuery = usePatient(patientId)
  const patient = patientQuery.data
  const patientName = patient
    ? `${patient.firstName} ${patient.lastName}`
    : "Patient"
  const exerciseType = exerciseMatch?.params.exerciseType as
    ExerciseType | undefined
  const exerciseDefinition =
    exerciseType && exerciseTypes.includes(exerciseType)
      ? exerciseDefinitions[exerciseType]
      : undefined

  if (!patientId) {
    return null
  }

  return (
    <nav
      aria-label="Breadcrumb"
      className="min-w-0 flex-1 overflow-x-auto border-l border-[#2a4568] pl-4 text-base whitespace-nowrap text-[#c6a632]"
    >
      <div className="flex items-center gap-2">
        <Link className="hover:text-[#f6f2ea]" to="/">
          Patients
        </Link>
        <span>/</span>
        {exerciseDefinition ? (
          <>
            <Link
              className="hover:text-[#f6f2ea]"
              to={`/patients/${patientId}`}
            >
              {patientName}
            </Link>
            <span>/</span>
            <span>{exerciseDefinition.label}</span>
          </>
        ) : (
          <span>{patientName}</span>
        )}
      </div>
    </nav>
  )
}

function AppShell({
  children,
  onToast,
  toast,
}: {
  children: React.ReactNode
  onToast: (message: string) => void
  toast: string
}) {
  const { isAuthEnabled, mode, signOut, user } = useAuth()

  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="border-b border-[#2a4568] bg-[#0b1b2f] text-[#c6a632]">
        <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center gap-4 px-8">
          <Link className="flex min-w-0" to="/">
            <span className="font-heading text-xl font-bold">Stella</span>
          </Link>
          <HeaderBreadcrumbs />
          <div className="ml-auto flex items-center gap-3 text-base">
            {isAuthEnabled ? (
              <FeedbackWidget
                onToast={onToast}
                triggerClassName="border-[#2a4568] bg-[#14304f] text-[#f6f2ea] hover:bg-[#1a3c61] hover:text-[#f6f2ea]"
              />
            ) : null}
            <Popover.Root>
              <Popover.Trigger className="flex h-10 items-center gap-2 rounded-full border border-[#2a4568] bg-[#14304f] px-3 text-sm text-[#f6f2ea] outline-none hover:bg-[#1a3c61] focus-visible:ring-3 focus-visible:ring-[#c6a632]/40">
                <span className="flex size-7 items-center justify-center rounded-full border border-[#2a4568] bg-[#0b1b2f]">
                  <UserRound className="size-4" />
                </span>
                <ChevronDown className="size-4 text-[#c6a632]" />
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Positioner
                  align="end"
                  className="z-50"
                  sideOffset={10}
                >
                  <Popover.Popup className="w-64 rounded-md border bg-popover p-3 text-popover-foreground shadow-md outline-none">
                    <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Account
                    </div>
                    <div className="mt-2 text-sm font-medium">
                      {mode === "local"
                        ? "Local preview"
                        : user?.email ?? user?.displayName ?? "Signed in"}
                    </div>
                    {isAuthEnabled ? (
                      <Button
                        className="mt-3 w-full justify-start"
                        onClick={signOut}
                        type="button"
                        variant="outline"
                      >
                        <LogOut data-icon="inline-start" />
                        Log out
                      </Button>
                    ) : null}
                  </Popover.Popup>
                </Popover.Positioner>
              </Popover.Portal>
            </Popover.Root>
          </div>
        </div>
      </header>
      {children}
      {toast ? (
        <div className="fixed right-6 bottom-20 z-20 rounded-lg border bg-card px-4 py-3 text-sm shadow-sm">
          {toast}
        </div>
      ) : null}
    </div>
  )
}

export function App() {
  const { isAuthEnabled, signOut, status, user } = useAuth()
  const [toast, setToast] = useState("")

  function showToast(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(""), 3000)
  }

  if (status === "loading") {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background px-6 text-foreground">
        <div className="max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
          <h1 className="text-2xl font-semibold">Connecting to Stella</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Restoring your session and loading the feedback tools.
          </p>
        </div>
      </div>
    )
  }

  if (isAuthEnabled && status === "unauthenticated") {
    return <LoginPage />
  }

  if (status === "forbidden") {
    return (
      <AppShell onToast={showToast} toast={toast}>
        <main className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-[1440px] items-center justify-center px-8 py-12">
          <div className="max-w-xl rounded-xl border bg-card p-8 shadow-sm">
            <h1 className="text-2xl font-semibold">Access not approved</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {user?.displayName ?? "This account"} signed in successfully, but
              it is not in the Cognito group allowed to review the Stella POC.
            </p>
            <div className="mt-6">
              <Button onClick={signOut} type="button" variant="outline">
                Sign out
              </Button>
            </div>
          </div>
        </main>
      </AppShell>
    )
  }

  return (
    <AppShell onToast={showToast} toast={toast}>
      <Routes>
        <Route element={<PatientListPage onToast={showToast} />} path="/" />
        <Route
          element={<PatientSummaryPage onToast={showToast} />}
          path="/patients/:patientId"
        />
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
