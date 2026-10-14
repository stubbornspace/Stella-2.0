import { ArrowLeft, ExternalLink, Play, Square } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Navigate, useNavigate, useParams } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { FinishedRuntimeSession } from "@/components/exercise-runtime/keyboard-runtime-page"
import { supportsKeyboardRuntime } from "@/config/exercise-control"
import { exerciseDefinitions } from "@/config/exercises"
import { usePatient, useSaveExerciseRun } from "@/hooks/use-stella"
import { DeviceClient } from "@/lib/device/device-client"
import { toDeviceConfig } from "@/lib/device/device-config"
import {
  devicePayloadToRunResult,
  getDeviceCompletedUnits,
  getDeviceRunStatus,
} from "@/lib/device/device-results"
import type { DeviceStatusEvent } from "@/lib/device/device-types"
import {
  clearPendingExerciseRun,
  loadPendingExerciseRun,
} from "@/lib/exercise-runtime/session-storage"
import { getRuntimeConfig } from "@/lib/runtime-config"
import type {
  ExerciseRunResult,
  KeyboardRuntimeExerciseType,
} from "@/types/exercise-control"

type PageStatus =
  | "connecting"
  | "ready"
  | "starting"
  | "running"
  | "stopping"
  | "saving"
  | "finished"
  | "error"

function formatElapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`
}

export function DeviceRuntimePage({
  onToast,
}: {
  onToast: (message: string) => void
}) {
  const navigate = useNavigate()
  const { exerciseType, patientId } = useParams()
  const patientQuery = usePatient(patientId)
  const { mutateAsync: saveExerciseRun } = useSaveExerciseRun()
  const runtimeConfig = getRuntimeConfig().exerciseRuntime
  const deviceBaseUrl = runtimeConfig.deviceBaseUrl ?? ""
  const client = useMemo(() => new DeviceClient(deviceBaseUrl), [deviceBaseUrl])
  const [pageStatus, setPageStatus] = useState<PageStatus>("connecting")
  const [connected, setConnected] = useState(false)
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatusEvent | null>(
    null
  )
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [errorMessage, setErrorMessage] = useState("")
  const [finishedRun, setFinishedRun] = useState<{
    completedUnits: number
    result: ExerciseRunResult
    runStatus: "completed" | "ended-early"
  } | null>(null)
  const activeStartedAtRef = useRef<number | null>(null)
  const activeSessionRef = useRef<string | null>(null)
  const handledSessionRef = useRef<string | null>(null)

  const activity = exerciseType as KeyboardRuntimeExerciseType | undefined
  const validActivity =
    activity && supportsKeyboardRuntime(activity) ? activity : undefined
  const pendingRun = useMemo(
    () =>
      patientId && validActivity
        ? loadPendingExerciseRun(patientId, validActivity)
        : null,
    [patientId, validActivity]
  )

  const finishFromDevice = useCallback(
    async (sessionId?: string) => {
      if (!patientId || !pendingRun || !validActivity) {
        return
      }
      if (sessionId && handledSessionRef.current === sessionId) {
        return
      }
      if (sessionId) {
        handledSessionRef.current = sessionId
      }

      setPageStatus("saving")

      try {
        const payload = await client.getSessionPayload()
        if (handledSessionRef.current === null) {
          handledSessionRef.current = payload.summary.session_id
        }
        const mappedResult = devicePayloadToRunResult(payload, pendingRun.setup)
        const measuredSeconds = activeStartedAtRef.current
          ? Math.max(
              1,
              Math.round((Date.now() - activeStartedAtRef.current) / 1000)
            )
          : 1
        const finalResult = {
          ...mappedResult,
          elapsedSeconds: Math.max(
            mappedResult.elapsedSeconds,
            measuredSeconds
          ),
        } as ExerciseRunResult
        const completedUnits = getDeviceCompletedUnits(payload)
        const runStatus = getDeviceRunStatus(payload)

        await saveExerciseRun({
          patientId,
          setup: pendingRun.setup,
          status: runStatus,
          completedUnits,
          elapsedSeconds: finalResult.elapsedSeconds,
          runId: `${pendingRun.savedAt}-${payload.summary.session_id}`,
          result: finalResult,
        })

        clearPendingExerciseRun(patientId, validActivity)
        activeSessionRef.current = null
        setFinishedRun({ completedUnits, result: finalResult, runStatus })
        setPageStatus("finished")
        onToast(
          `${exerciseDefinitions[validActivity].label} results received from the device and saved.`
        )
      } catch (error) {
        handledSessionRef.current = null
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to retrieve the device results."
        )
        setPageStatus("error")
      }
    },
    [client, onToast, patientId, pendingRun, saveExerciseRun, validActivity]
  )
  const finishFromDeviceRef = useRef(finishFromDevice)

  useEffect(() => {
    finishFromDeviceRef.current = finishFromDevice
  }, [finishFromDevice])

  useEffect(() => {
    let active = true
    const unsubscribe = client.subscribe({
      connection: (nextConnected) => {
        if (!active) return
        setConnected(nextConnected)
      },
      status: (status) => {
        if (!active) return
        setDeviceStatus(status)
        if (status.state === "idle" && activeSessionRef.current) {
          void finishFromDeviceRef.current(activeSessionRef.current)
        } else if (status.state !== "idle") {
          setPageStatus((current) =>
            current === "saving" || current === "finished" ? current : "running"
          )
        }
      },
      resultsReady: (event) => {
        if (!active) return
        void finishFromDeviceRef.current(event.session_id)
      },
    })

    void client
      .getState()
      .then((state) => {
        if (!active) return
        setConnected(true)
        setPageStatus(state.session ? "running" : "ready")
        if (state.session) {
          activeSessionRef.current = state.session.session_id
          activeStartedAtRef.current = Date.now()
          setDeviceStatus(
            state.presentation?.status ?? {
              state: state.session.phase,
              activity: state.session.activity,
              prompt_text: "Exercise already running on device.",
              item: state.session.item,
              items: state.session.items,
              trial: 1,
              trials: 1,
              beat: state.config.beat,
              tempo_bpm: state.config.tempo_bpm,
              session_id: state.session.session_id,
            }
          )
        }
      })
      .catch((error) => {
        if (!active) return
        setConnected(false)
        setErrorMessage(
          error instanceof Error ? error.message : "Unable to reach the device."
        )
        setPageStatus("error")
      })

    return () => {
      active = false
      unsubscribe()
    }
  }, [client])

  useEffect(() => {
    if (pageStatus !== "running" || !activeStartedAtRef.current) {
      return
    }
    const interval = window.setInterval(() => {
      setElapsedSeconds(
        Math.max(
          1,
          Math.round((Date.now() - activeStartedAtRef.current!) / 1000)
        )
      )
    }, 250)
    return () => window.clearInterval(interval)
  }, [pageStatus])

  const handleStart = useCallback(async () => {
    if (!pendingRun) return
    setErrorMessage("")
    setPageStatus("starting")
    handledSessionRef.current = null

    try {
      const patientCode = patientQuery.data?.patientCode ?? patientId ?? ""
      await client.configure(toDeviceConfig(pendingRun.setup, patientCode))
      const started = await client.start()
      activeSessionRef.current = started.session_id
      activeStartedAtRef.current = Date.now()
      setElapsedSeconds(0)
      setPageStatus("running")
      setDeviceStatus((current) =>
        current ? { ...current, session_id: started.session_id } : current
      )
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to start the device."
      )
      setPageStatus("error")
    }
  }, [client, patientId, patientQuery.data, pendingRun])

  const handleStop = async () => {
    setPageStatus("stopping")
    try {
      await client.stop()
      await finishFromDevice(deviceStatus?.session_id ?? undefined)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to stop the device."
      )
      setPageStatus("error")
    }
  }

  if (!validActivity || !patientId) {
    return <Navigate replace to="/" />
  }

  if (!pendingRun) {
    return (
      <Navigate replace to={`/patients/${patientId}?tab=exercise-control`} />
    )
  }

  const patientName = patientQuery.data
    ? `${patientQuery.data.firstName} ${patientQuery.data.lastName}`
    : "Patient"
  const totalUnits =
    pendingRun.setup.activity === "letter-target" ||
    pendingRun.setup.activity === "letter-find"
      ? pendingRun.setup.contentMode === "letters"
        ? pendingRun.setup.numberOfLetters
        : pendingRun.setup.numberOfWords
      : pendingRun.setup.activity === "eye-pong"
        ? pendingRun.setup.targetCount
        : pendingRun.setup.activity === "inhibition-challenge"
          ? pendingRun.setup.trialCount
          : pendingRun.setup.sequenceCount

  if (pageStatus === "finished" && finishedRun) {
    return (
      <FinishedRuntimeSession
        completedUnits={finishedRun.completedUnits}
        patientId={patientId}
        patientName={patientName}
        result={finishedRun.result}
        runStatus={finishedRun.runStatus}
        setup={pendingRun.setup}
        totalUnits={totalUnits}
      />
    )
  }

  const progress = deviceStatus
    ? `${Math.min(deviceStatus.item, totalUnits)} of ${totalUnits}`
    : `0 of ${totalUnits}`
  const canStart =
    connected && (pageStatus === "ready" || pageStatus === "error")
  const canStop = pageStatus === "running"

  return (
    <main className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-[1440px] flex-col gap-6 px-8 py-8">
      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-4">
        <div>
          <Button
            onClick={() =>
              navigate(`/patients/${patientId}?tab=exercise-control`)
            }
            type="button"
            variant="ghost"
          >
            <ArrowLeft data-icon="inline-start" />
            Back to setup
          </Button>
          <h1 className="mt-3 text-3xl font-semibold tracking-normal">
            {patientName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {exerciseDefinitions[validActivity].label} will run on the connected
            keyboard.
          </p>
        </div>

        {canStop ? (
          <Button
            className="col-start-3 justify-self-end"
            onClick={() => void handleStop()}
            type="button"
            variant="destructive"
          >
            <Square data-icon="inline-start" />
            Stop Early
          </Button>
        ) : (
          <Button
            className="self-center justify-self-center"
            disabled={!canStart}
            onClick={() => void handleStart()}
            type="button"
          >
            <Play data-icon="inline-start" />
            Start on Keyboard
          </Button>
        )}
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground uppercase">
            Device connection
          </div>
          <div className="mt-2 font-semibold">
            {connected ? "Connected" : "Disconnected"}
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground uppercase">Status</div>
          <div className="mt-2 font-semibold capitalize">
            {pageStatus === "starting"
              ? "Sending configuration"
              : pageStatus.replace("-", " ")}
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground uppercase">
            Progress
          </div>
          <div className="mt-2 font-semibold tabular-nums">{progress}</div>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Keyboard activity
            </div>
            <h2 className="mt-2 text-2xl font-semibold">
              {deviceStatus?.prompt_text ||
                (connected
                  ? "Ready to send this exercise to the keyboard."
                  : "Waiting for the keyboard simulator.")}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              The keyboard owns input, prompts, timing, audio, and scoring.
              Stella will save the returned results automatically.
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground uppercase">
              Elapsed
            </div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">
              {formatElapsed(elapsedSeconds)}
            </div>
          </div>
        </div>

        {errorMessage ? (
          <div className="mt-6 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : null}

        {deviceBaseUrl ? (
          <div className="mt-6 flex justify-end">
            <Button
              nativeButton={false}
              render={<a href={deviceBaseUrl} target="_blank" />}
              variant="outline"
            >
              Open simulated keyboard
              <ExternalLink data-icon="inline-end" />
            </Button>
          </div>
        ) : null}
      </section>
    </main>
  )
}
