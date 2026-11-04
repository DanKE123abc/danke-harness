/**
 * Stage the `@github1s/vscode-web` static distribution for the Code panel.
 *
 * The package unpacks to ~225 MB across 1894 files. It is deliberately NOT a
 * pnpm dependency (installing it would pull the whole payload into the shared
 * node_modules of the worktree junction) and NOT committed. This script keeps
 * a verified copy in the gitignored `apps/web/.cache/` directory; the Vite
 * plugin in `apps/web/vscode-assets.ts` copies it into `dist/vscode/` at build
 * time. Downloading uses the registry tarball directly and verifies the npm
 * `dist.integrity` digest before extraction.
 *
 * Usage: `tsx scripts/fetch-vscode-web.ts [--check] [--force]`
 * `--check` only reports readiness and never touches the network.
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { x as extract } from 'tar'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Pinned distribution. Bump together with the integrity digest below. */
export const VSCODE_WEB_VERSION = '0.30.3' as const

/** `npm view @github1s/vscode-web@0.30.3 dist.integrity` (sha512, base64). */
export const VSCODE_WEB_INTEGRITY = 'sha512-wK6fvcCTSPK8EIQZA+o4IGBQLwudOA/TgG+0C+1sI4TvGG2lu/wCi2RNMIjJZpU4hzcaR0T3RQi7PtnBdiGQmA==' as const

/** npm tarball URL; the default registry mirror is reachable in CI and locally. */
export const VSCODE_WEB_TARBALL = `https://registry.npmmirror.com/@github1s/vscode-web/-/vscode-web-${VSCODE_WEB_VERSION}.tgz` as const

/** Verified, extracted distribution root (gitignored). */
export const VSCODE_WEB_CACHE = join(REPO_ROOT, 'apps', 'web', '.cache', 'vscode-web')

/** Downloaded archive; kept so a re-extract never hits the network again. */
export const VSCODE_WEB_ARCHIVE = join(REPO_ROOT, 'apps', 'web', '.cache', `vscode-web-${VSCODE_WEB_VERSION}.tgz`)

/** Stamp proving the extracted tree matches the pinned distribution. */
export const VSCODE_WEB_STAMP = join(VSCODE_WEB_CACHE, '.dsh-stamp.json')

/** Workbench entry: its presence proves the extraction completed. */
export const VSCODE_WEB_ENTRY = join(VSCODE_WEB_CACHE, 'vscode', 'vs', 'workbench', 'workbench.web.main.internal.js')

interface Stamp {
  readonly version: string
  readonly integrity: string
}

/** Resolve to `undefined` when a path is absent or is not a regular file. */
async function fileExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

/** Read the stamp only when the workbench entry is also present. */
export async function readVscodeWebStamp(): Promise<Stamp | undefined> {
  if (!await fileExists(VSCODE_WEB_ENTRY)) return undefined
  try {
    const parsed: unknown = JSON.parse(await readFile(VSCODE_WEB_STAMP, 'utf8'))
    if (parsed === null || typeof parsed !== 'object') return undefined
    const candidate = parsed as Partial<Stamp>
    return typeof candidate.version === 'string' && typeof candidate.integrity === 'string'
      ? { version: candidate.version, integrity: candidate.integrity }
      : undefined
  } catch {
    return undefined
  }
}

/** Report whether the cached distribution is complete and matches the pin. */
export async function vscodeWebIsReady(): Promise<boolean> {
  const stamp = await readVscodeWebStamp()
  return stamp?.version === VSCODE_WEB_VERSION && stamp.integrity === VSCODE_WEB_INTEGRITY
}

/** Verify a downloaded archive against the npm integrity digest. */
function verifyIntegrity(bytes: Buffer): void {
  const digest = `sha512-${createHash('sha512').update(bytes).digest('base64')}`
  if (digest !== VSCODE_WEB_INTEGRITY) {
    throw new Error(`vscode-web: integrity mismatch (expected ${VSCODE_WEB_INTEGRITY}, got ${digest})`)
  }
}

/** Download the tarball (or reuse a verified local copy). */
async function download(): Promise<Buffer> {
  await mkdir(dirname(VSCODE_WEB_ARCHIVE), { recursive: true })
  if (await fileExists(VSCODE_WEB_ARCHIVE)) {
    const cached = await readFile(VSCODE_WEB_ARCHIVE)
    try {
      verifyIntegrity(cached)
      return cached
    } catch {
      await rm(VSCODE_WEB_ARCHIVE)
    }
  }
  const response = await fetch(VSCODE_WEB_TARBALL)
  if (!response.ok) throw new Error(`vscode-web: registry returned ${String(response.status)} for ${VSCODE_WEB_TARBALL}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  verifyIntegrity(bytes)
  await writeFile(VSCODE_WEB_ARCHIVE, bytes)
  return bytes
}

/** Extract the verified archive into the cache root, replacing any stale tree. */
async function unpack(): Promise<void> {
  await rm(VSCODE_WEB_CACHE, { recursive: true, force: true })
  await mkdir(VSCODE_WEB_CACHE, { recursive: true })
  await extract({ file: VSCODE_WEB_ARCHIVE, cwd: VSCODE_WEB_CACHE, strip: 1 })
  if (!await fileExists(VSCODE_WEB_ENTRY)) {
    throw new Error(`vscode-web: archive unpacked without ${VSCODE_WEB_ENTRY}`)
  }
  const stamp: Stamp = { version: VSCODE_WEB_VERSION, integrity: VSCODE_WEB_INTEGRITY }
  await writeFile(VSCODE_WEB_STAMP, `${JSON.stringify(stamp)}\n`, 'utf8')
}

/**
 * Ensure the cache holds the pinned distribution.
 * @returns `true` when a download/extract happened, `false` when reused.
 */
export async function ensureVscodeWeb(force = false): Promise<boolean> {
  if (!force && await vscodeWebIsReady()) return false
  await download()
  await unpack()
  return true
}

/** CLI entry: only run when executed directly, not when imported by Vite. */
async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.includes('--check')) {
    if (!await vscodeWebIsReady()) {
      console.error(`vscode-web: cache missing; run \`pnpm exec tsx scripts/fetch-vscode-web.ts\` (expects ${VSCODE_WEB_CACHE})`)
      process.exitCode = 1
      return
    }
    console.log(`vscode-web: ${VSCODE_WEB_VERSION} ready at ${VSCODE_WEB_CACHE}`)
    return
  }
  const changed = await ensureVscodeWeb(args.includes('--force'))
  console.log(changed
    ? `vscode-web: staged ${VSCODE_WEB_VERSION} into ${VSCODE_WEB_CACHE}`
    : `vscode-web: ${VSCODE_WEB_VERSION} already cached at ${VSCODE_WEB_CACHE}`)
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? `vscode-web: ${error.message}` : error)
    process.exitCode = 1
  })
}
