import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const rootDir = path.resolve(new URL('../..', import.meta.url).pathname)
const defaultManifestPaths = [
  path.join(rootDir, 'scripts/audio/polly-prompts.json'),
  path.join(rootDir, 'scripts/audio/polly-letters.json'),
  path.join(rootDir, 'scripts/audio/polly-words.json'),
]

function parseArgs(argv) {
  const args = {
    dryRun: false,
    engine: process.env.POLLY_ENGINE ?? 'generative',
    manifestPaths: [],
    onlyIds: new Set(),
    outDir: path.join(rootDir, 'public/audio'),
    overwrite: false,
    region: process.env.POLLY_REGION ?? 'us-east-1',
    voice: process.env.POLLY_VOICE ?? 'Joanna',
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--dry-run') {
      args.dryRun = true
      continue
    }

    if (arg === '--overwrite') {
      args.overwrite = true
      continue
    }

    if (arg === '--voice') {
      args.voice = argv[index + 1] ?? args.voice
      index += 1
      continue
    }

    if (arg === '--engine') {
      args.engine = argv[index + 1] ?? args.engine
      index += 1
      continue
    }

    if (arg === '--manifest') {
      const manifestPath = argv[index + 1]
      if (manifestPath) {
        args.manifestPaths.push(path.resolve(rootDir, manifestPath))
      }
      index += 1
      continue
    }

    if (arg === '--region') {
      args.region = argv[index + 1] ?? args.region
      index += 1
      continue
    }

    if (arg === '--only') {
      const ids = (argv[index + 1] ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
      ids.forEach((id) => args.onlyIds.add(id))
      index += 1
      continue
    }

    if (arg === '--out-dir') {
      args.outDir = path.resolve(rootDir, argv[index + 1] ?? args.outDir)
      index += 1
      continue
    }
  }

  if (args.manifestPaths.length === 0) {
    args.manifestPaths = defaultManifestPaths
  }

  return args
}

async function loadManifest(manifestPath) {
  const content = await fs.readFile(manifestPath, 'utf8')
  const entries = JSON.parse(content)

  if (!Array.isArray(entries)) {
    throw new Error(`Manifest must be an array: ${manifestPath}`)
  }

  return entries.map((entry) => ({
    ...entry,
    _manifestPath: manifestPath,
  }))
}

async function ensureDirectory(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
}

async function normalizeMp3(outputPath) {
  const normalizedPath = `${outputPath}.normalized.mp3`

  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      '-loglevel',
      'error',
      '-i',
      outputPath,
      '-codec:a',
      'libmp3lame',
      '-ar',
      '44100',
      '-ac',
      '1',
      '-b:a',
      '128k',
      normalizedPath,
    ],
    {
      cwd: rootDir,
      maxBuffer: 1024 * 1024 * 10,
    }
  )

  await fs.rename(normalizedPath, outputPath)
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function synthesizeEntry(entry, options) {
  const outputPath = path.resolve(options.outDir, entry.output)
  const buildCommandArgs = (engine) => [
    'polly',
    'synthesize-speech',
    '--region',
    options.region,
    '--voice-id',
    options.voice,
    '--engine',
    engine,
    '--output-format',
    'mp3',
    '--text-type',
    'text',
    '--text',
    entry.text,
    outputPath,
  ]

  const commandArgs = buildCommandArgs(options.engine)

  if (options.dryRun) {
    return {
      command: ['aws', ...commandArgs].join(' '),
      id: entry.id,
      outputPath,
      skipped: false,
    }
  }

  if (!options.overwrite && (await fileExists(outputPath))) {
    return { id: entry.id, outputPath, skipped: true }
  }

  await ensureDirectory(outputPath)

  try {
    await execFileAsync('aws', commandArgs, {
      cwd: rootDir,
      maxBuffer: 1024 * 1024 * 10,
    })
    await normalizeMp3(outputPath)
  } catch (error) {
    const stderr = error?.stderr ?? ''
    const canFallback =
      ['generative', 'neural'].includes(options.engine) &&
      typeof stderr === 'string' &&
      stderr.includes('selected engine is not supported in this region')

    if (!canFallback) {
      throw error
    }

    const fallbackCommandArgs = buildCommandArgs('standard')
    await execFileAsync('aws', fallbackCommandArgs, {
      cwd: rootDir,
      maxBuffer: 1024 * 1024 * 10,
    })
    await normalizeMp3(outputPath)

    return {
      engine: 'standard',
      fallback: true,
      id: entry.id,
      outputPath,
      skipped: false,
    }
  }

  return { engine: options.engine, id: entry.id, outputPath, skipped: false }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const manifests = await Promise.all(options.manifestPaths.map(loadManifest))
  const entries = manifests
    .flat()
    .filter((entry) => !entry.status || entry.status === 'planned')
    .filter((entry) =>
      options.onlyIds.size === 0 ? true : options.onlyIds.has(entry.id)
    )

  if (entries.length === 0) {
    console.log('No matching Polly entries found.')
    return
  }

  const seenIds = new Set()
  for (const entry of entries) {
    if (!entry.id || !entry.text || !entry.output) {
      throw new Error(
        `Each manifest entry requires id, text, and output (${entry._manifestPath})`
      )
    }
    if (seenIds.has(entry.id)) {
      throw new Error(`Duplicate manifest id: ${entry.id}`)
    }
    seenIds.add(entry.id)
  }

  console.log(
    `Generating ${entries.length} audio file(s) with Polly voice ${options.voice} (${options.engine}) in ${options.region}.`
  )

  for (const entry of entries) {
    const result = await synthesizeEntry(entry, options)
    if (options.dryRun) {
      console.log(`[dry-run] ${result.id} -> ${result.outputPath}`)
      console.log(`          ${result.command}`)
    } else if (result.skipped) {
      console.log(`[skip] ${result.id} -> ${result.outputPath}`)
    } else if (result.fallback) {
      console.log(`[done] ${result.id} -> ${result.outputPath} (fallback ${result.engine})`)
    } else {
      console.log(`[done] ${result.id} -> ${result.outputPath}`)
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
