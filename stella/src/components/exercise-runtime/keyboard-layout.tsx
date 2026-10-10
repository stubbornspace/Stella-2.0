import { useEffect } from "react"

import { KeyboardKey } from "@/components/exercise-runtime/keyboard-key"
import { type KeyState } from "@/lib/audio/constants"
import {
  getKeyboardRows,
  getLetterToKeyMap,
  keyIsOnSide,
} from "@/lib/exercise-runtime/keyboard-map"
import type {
  KeyboardLayoutMode,
  KeyboardSide,
  KeyLabelMode,
} from "@/types/exercise-control"

export function KeyboardLayout({
  keyStates = {},
  onKeyClick,
  disabled = false,
  beatFlashIntervalMs,
  keyboardLayout = "qwerty",
  keyboardSide = "full",
  keyLabels = "letters",
}: {
  keyStates?: Record<number, KeyState>
  onKeyClick?: (id: number, inputTimeMs?: number) => void
  disabled?: boolean
  beatFlashIntervalMs?: number
  keyboardLayout?: KeyboardLayoutMode
  keyboardSide?: KeyboardSide
  keyLabels?: KeyLabelMode
}) {
  const getKeyState = (id: number) => keyStates[id] ?? "idle"
  const keyboard = getKeyboardRows(keyboardLayout, keyboardSide)

  useEffect(() => {
    if (disabled || !onKeyClick) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) {
        return
      }

      const keyId = getLetterToKeyMap(keyboardLayout)[event.key.toUpperCase()]
      if (keyId == null || !keyIsOnSide(keyId, keyboardSide)) {
        return
      }

      event.preventDefault()
      onKeyClick(keyId, event.timeStamp)
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [disabled, keyboardLayout, keyboardSide, onKeyClick])

  return (
    <div className="flex h-full w-full items-center justify-center overflow-hidden bg-white p-2 sm:p-4">
      <div className="flex h-full w-full items-center justify-center">
        <div className="w-full max-w-[1200px] rounded-[clamp(20px,2.8vmin,32px)] border-[clamp(6px,0.8vmin,10px)] border-[#6b7280] bg-[#374151] p-[clamp(12px,2vmin,28px)] shadow-2xl">
          <div className="space-y-[clamp(8px,1.4vmin,18px)]">
            {keyboard.map((row, rowIndex) => (
              <div
                className="grid grid-cols-10 gap-[clamp(8px,1.4vmin,18px)]"
                key={rowIndex}
              >
                {row.map((key) => (
                  <KeyboardKey
                    className="max-w-[110px] justify-self-center"
                    id={key.id}
                    key={key.id}
                    letter={key.letter}
                    onClick={onKeyClick}
                    beatFlashIntervalMs={beatFlashIntervalMs}
                    state={getKeyState(key.id)}
                    disabled={disabled}
                    showLabel={keyLabels === "letters"}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
