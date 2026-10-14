import type {
  DeviceConfig,
  DeviceEventHandlers,
  DeviceEventRecord,
  DeviceSessionPayload,
  DeviceSessionSummary,
  DeviceState,
} from "@/lib/device/device-types"

function apiUrl(baseUrl: string, path: string) {
  return `${baseUrl}/api${path}`
}

async function responseMessage(response: Response) {
  const body = (await response.json().catch(() => undefined)) as
    { message?: string } | undefined
  return body?.message || `Device request failed (${response.status}).`
}

export class DeviceClient {
  private readonly baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  private async request<T>(path: string, init?: RequestInit) {
    const response = await fetch(apiUrl(this.baseUrl, path), {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    })

    if (!response.ok) {
      throw new Error(await responseMessage(response))
    }

    return (await response.json()) as T
  }

  getState() {
    return this.request<DeviceState>("/state")
  }

  configure(config: DeviceConfig) {
    return this.request<{ config: DeviceConfig }>("/config", {
      body: JSON.stringify(config),
      method: "POST",
    })
  }

  start() {
    return this.request<{ session_id: string }>("/start", {
      body: "{}",
      method: "POST",
    })
  }

  stop() {
    return this.request<{ end_reason: string }>("/stop", {
      body: "{}",
      method: "POST",
    })
  }

  async getSessionPayload(): Promise<DeviceSessionPayload> {
    const [summary, exportResponse] = await Promise.all([
      this.request<DeviceSessionSummary>("/results"),
      fetch(apiUrl(this.baseUrl, "/export.jsonl")),
    ])

    if (!exportResponse.ok) {
      throw new Error(await responseMessage(exportResponse))
    }

    const events = (await exportResponse.text())
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as DeviceEventRecord)

    return { events, summary }
  }

  subscribe(handlers: DeviceEventHandlers) {
    const source = new EventSource(apiUrl(this.baseUrl, "/events"))
    const listeners: Array<[string, EventListener]> = []

    const listen = <T>(
      eventName: string,
      handler: ((event: T) => void) | undefined
    ) => {
      if (!handler) {
        return
      }
      const listener: EventListener = (event) => {
        handler(JSON.parse((event as MessageEvent<string>).data) as T)
      }
      source.addEventListener(eventName, listener)
      listeners.push([eventName, listener])
    }

    listen("board", handlers.board)
    listen("status", handlers.status)
    listen("audio", handlers.audio)
    listen("results_ready", handlers.resultsReady)

    source.onopen = () => handlers.connection?.(true)
    source.onerror = () => handlers.connection?.(false)

    return () => {
      for (const [eventName, listener] of listeners) {
        source.removeEventListener(eventName, listener)
      }
      source.close()
    }
  }
}
