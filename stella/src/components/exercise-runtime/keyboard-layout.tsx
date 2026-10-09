import { KeyboardKey } from "@/components/exercise-runtime/keyboard-key"
import type { KeyState } from "@/lib/audio/constants"

type KeyData = { id: number; letter?: string }

const keyboard: KeyData[][] = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"].map((letter, index) => ({
    id: index + 1,
    letter,
  })),
  ["A", "S", "D", "F", "G", "H", "J", "K", "L", ""].map((letter, index) => ({
    id: index + 11,
    letter,
  })),
  ["", "Z", "X", "C", "V", "B", "N", "M", "", ""].map((letter, index) => ({
    id: index + 21,
    letter,
  })),
]

export function KeyboardLayout({
  keyStates = {},
  onKeyClick,
}: {
  keyStates?: Record<number, KeyState>
  onKeyClick?: (id: number) => void
}) {
  const getKeyState = (id: number) => keyStates[id] ?? "idle"

  return (
    <div className="flex h-full w-full items-center justify-center overflow-hidden bg-white p-2 sm:p-4">
      <div className="flex h-full w-full items-center justify-center">
        <div className="w-full max-w-[1200px] rounded-[clamp(20px,2.8vmin,32px)] border-[clamp(6px,0.8vmin,10px)] border-[#6b7280] bg-[#374151] p-[clamp(12px,2vmin,28px)] shadow-2xl">
          <div className="space-y-[clamp(8px,1.4vmin,18px)]">
            {keyboard.map((row, rowIndex) => (
              <div className="grid grid-cols-10 gap-[clamp(8px,1.4vmin,18px)]" key={rowIndex}>
                {row.map((key) => (
                  <KeyboardKey
                    className="max-w-[110px] justify-self-center"
                    id={key.id}
                    key={key.id}
                    letter={key.letter}
                    onClick={onKeyClick}
                    state={getKeyState(key.id)}
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
