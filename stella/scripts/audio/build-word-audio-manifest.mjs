import { promises as fs } from "node:fs"
import path from "node:path"

const rootDir = path.resolve(new URL("../..", import.meta.url).pathname)
const catalogPath = path.join(rootDir, "scripts/audio/word-catalog.json")
const manifestPath = path.join(rootDir, "scripts/audio/polly-words.json")

function wordMatchesBucket(word, bucket) {
  if (bucket === "11+") {
    return word.length > 10
  }

  return word.length === Number(bucket)
}

async function main() {
  const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"))
  const seenWords = new Set()
  const manifest = []

  for (const [bucket, words] of Object.entries(catalog)) {
    if (!Array.isArray(words)) {
      throw new Error(`Word catalog bucket ${bucket} must be an array.`)
    }

    for (const word of words) {
      if (typeof word !== "string" || !/^[a-z]+$/.test(word)) {
        throw new Error(`Invalid word in bucket ${bucket}: ${String(word)}`)
      }
      if (!wordMatchesBucket(word, bucket)) {
        throw new Error(`Word ${word} does not match bucket ${bucket}.`)
      }
      if (seenWords.has(word)) {
        throw new Error(`Duplicate word in catalog: ${word}`)
      }

      seenWords.add(word)
      const label = word.charAt(0).toUpperCase() + word.slice(1)
      manifest.push(
        {
          id: `word-${word}-01`,
          text: label,
          output: `words/${word}.mp3`,
          status: "planned",
        },
        {
          id: `spell-${word}-01`,
          text: `Let's spell the word ${word}.`,
          output: `prompts/spell-word/spell-${word}-01.mp3`,
          status: "planned",
        }
      )
    }
  }

  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(
    `Wrote ${manifest.length} audio entries for ${seenWords.size} words to ${manifestPath}.`
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
