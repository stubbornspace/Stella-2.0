const speechAudioCache = new Map<string, Promise<HTMLAudioElement>>()

let audioContext: AudioContext | null = null
let masterGain: GainNode | null = null
let speechVolume = 0.9

function createAudioContext() {
  const AudioContextConstructor =
    window.AudioContext ??
    ((window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext as typeof AudioContext | undefined)

  if (!AudioContextConstructor) {
    throw new Error("Web Audio is not supported in this browser.")
  }

  const context = new AudioContextConstructor()
  const gain = context.createGain()
  gain.gain.value = 0.9
  gain.connect(context.destination)

  audioContext = context
  masterGain = gain

  return context
}

export function getAudioContext() {
  return audioContext ?? createAudioContext()
}

export async function unlockAudio() {
  const context = getAudioContext()

  if (context.state === "suspended") {
    await context.resume()
  }
}

async function loadSpeechAudio(url: string) {
  return await new Promise<HTMLAudioElement>((resolve, reject) => {
    const audio = new Audio(url)
    audio.preload = "auto"

    const handleReady = () => {
      cleanup()
      resolve(audio)
    }

    const handleError = () => {
      cleanup()
      reject(new Error(`Failed to load audio asset: ${url}`))
    }

    const cleanup = () => {
      audio.removeEventListener("canplaythrough", handleReady)
      audio.removeEventListener("error", handleError)
    }

    audio.addEventListener("canplaythrough", handleReady, { once: true })
    audio.addEventListener("error", handleError, { once: true })
    audio.load()
  })
}

export function preloadAudio(urls: string[]) {
  return Promise.all(
    urls.map((url) => {
      if (!speechAudioCache.has(url)) {
        speechAudioCache.set(url, loadSpeechAudio(url))
      }
      return speechAudioCache.get(url)
    })
  )
}

export async function playAudio(url: string) {
  try {
    const baseAudioPromise = speechAudioCache.get(url) ?? loadSpeechAudio(url)

    if (!speechAudioCache.has(url)) {
      speechAudioCache.set(url, baseAudioPromise)
    }

    const baseAudio = await baseAudioPromise
    const playbackAudio = baseAudio.cloneNode(true) as HTMLAudioElement
    playbackAudio.volume = speechVolume

    await new Promise<void>((resolve) => {
      const cleanup = () => {
        playbackAudio.removeEventListener("ended", handleEnded)
        playbackAudio.removeEventListener("error", handleError)
      }

      const handleEnded = () => {
        cleanup()
        resolve()
      }

      const handleError = () => {
        cleanup()
        resolve()
      }

      playbackAudio.addEventListener("ended", handleEnded, { once: true })
      playbackAudio.addEventListener("error", handleError, { once: true })
      void playbackAudio.play().catch(() => {
        cleanup()
        resolve()
      })
    })
  } catch {
    // Audio failures should not crash gameplay.
  }
}

export function setAudioVolume(value: number) {
  speechVolume = Math.max(0, Math.min(1, value))

  if (!masterGain) {
    createAudioContext()
  }

  masterGain!.gain.value = speechVolume
}
