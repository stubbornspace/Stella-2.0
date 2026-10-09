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
  foundLetters = [],
}: {
  keyStates?: Record<number, KeyState>
  onKeyClick?: (id: number) => void
  foundLetters?: string[]
}) {
  const getKeyState = (id: number) => keyStates[id] ?? "idle"

  return (
    <div className="@container flex h-full w-full items-center justify-center bg-white p-4">
      <div className="flex h-full w-full items-center justify-center">
        <div className="w-fit rounded-3xl border-[min(8px,1cqw)] border-[#6b7280] bg-[#374151] p-[min(3cqw,3vh)] shadow-2xl">
          <div className="mx-auto mb-[min(2vh,1.5cqw)] flex h-14 items-center justify-center gap-2 rounded-xl bg-[#091a2c] px-4">
            {foundLetters.map((letter, index) => (
              <span className="text-4xl font-bold text-[#c5a538] uppercase" key={`${letter}-${index}`}>
                {letter}
              </span>
            ))}
          </div>
          <div className="space-y-[min(2.5vh,1.5cqw)]">
            {keyboard.map((row, rowIndex) => (
              <div className="flex justify-center gap-[min(1.5cqw,1.5vh)]" key={rowIndex}>
                {row.map((key) => (
                  <KeyboardKey
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
