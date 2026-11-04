/**
 * Copy the staged `@github1s/vscode-web` distribution into `dist/vscode/`.
 *
 * The workbench payload is ~225 MB and must never enter the Rollup graph: it is
 * served as opaque static files by the Host's `/vscode` named route. The
 * archive is staged by `scripts/fetch-vscode-web.ts` into a gitignored cache;
 * this plugin only copies files, after every other output has been written.
 *
 * `dev:web` runs `vite build --watch`, so `closeBundle` fires on every rebuild.
 * A stamp beside the copied tree makes repeat builds a no-op instead of
 * rewriting 225 MB each time. A missing cache is a warning, not a build
 * failure: the Code panel shows an "assets unavailable" hint in that case.
 */
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import {
  VSCODE_WEB_CACHE, VSCODE_WEB_INTEGRITY, VSCODE_WEB_VERSION, vscodeWebIsReady,
} from '../../scripts/fetch-vscode-web.ts'

const src = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url))

/** Written next to the copied tree; changing any field forces a fresh copy. */
const ASSET_STAMP = '.dsh-vscode-assets.json'

interface AssetStamp {
  readonly version: string
  readonly integrity: string
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

async function readAssetStamp(path: string): Promise<AssetStamp | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'))
    if (parsed === null || typeof parsed !== 'object') return undefined
    const value = parsed as Partial<AssetStamp>
    return typeof value.version === 'string' && typeof value.integrity === 'string'
      ? { version: value.version, integrity: value.integrity }
      : undefined
  } catch {
    return undefined
  }
}

/** Escape JSON for embedding in the `data-settings` HTML attribute. */
function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Build the workbench builtin-extension table from every manifest in the
 * copied tree. VS Code Web reads this through the
 * `#vscode-workbench-builtin-extensions` element; without it no language
 * support loads. The DSH `dsh-workspace` provider extension is copied into the
 * same directory by this plugin, so it is picked up by the same scan.
 */
async function builtinExtensions(target: string): Promise<string> {
  const directory = join(target, 'extensions')
  let names: string[]
  try {
    names = (await readdir(directory, { withFileTypes: true }))
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort()
  } catch {
    return '[]'
  }
  const entries: unknown[] = []
  for (const name of names) {
    try {
      const manifest: unknown = JSON.parse(await readFile(join(directory, name, 'package.json'), 'utf8'))
      entries.push({ extensionPath: name, packageJSON: manifest })
    } catch {
      // An extension without a readable manifest cannot be registered.
    }
  }
  return JSON.stringify(entries)
}

/** Emit `dist/vscode/` from the verified cache plus our bootstrap page. */
export function vscodeAssets(): Plugin {
  let outputDirectory = ''
  let write = true
  let wroteBundle = false
  return {
    name: 'dsh-vscode-assets',
    configResolved(config) {
      write = config.build.write
      outputDirectory = resolve(config.root, config.build.outDir)
    },
    buildStart() {
      wroteBundle = false
    },
    writeBundle() {
      wroteBundle = true
    },
    async closeBundle() {
      if (!write || !wroteBundle) return
      if (!await vscodeWebIsReady()) {
        this.warn('vscode assets: cache missing; run `pnpm exec tsx scripts/fetch-vscode-web.ts`. The Code panel will report assets as unavailable.')
        return
      }
      const target = join(outputDirectory, 'vscode')
      const stampPath = join(target, ASSET_STAMP)
      const previous = await readAssetStamp(stampPath)
      const copied = previous !== undefined
        && previous.version === VSCODE_WEB_VERSION
        && previous.integrity === VSCODE_WEB_INTEGRITY
        && await isFile(join(target, 'index.html'))
      if (!copied) {
        await rm(target, { recursive: true, force: true })
        await mkdir(target, { recursive: true })
        await cp(VSCODE_WEB_CACHE, target, { recursive: true })
        const stamp: AssetStamp = { version: VSCODE_WEB_VERSION, integrity: VSCODE_WEB_INTEGRITY }
        await writeFile(stampPath, `${JSON.stringify(stamp)}\n`, 'utf8')
      }
      // The dsh:// provider extension is ours, not part of the npm package.
      const provider = src('./vscode-extension')
      if (await isDirectory(provider)) {
        await cp(provider, join(target, 'extensions', 'dsh-workspace'), { recursive: true, force: true })
      }
      // Rewriting the small bootstrap page on every rebuild keeps the builtin
      // extension table in sync without recopying the 225 MB payload.
      const bootstrap = await readFile(src('./vscode.html'), 'utf8')
      const page = bootstrap.replace('__DSH_BUILTIN_EXTENSIONS__', escapeAttribute(await builtinExtensions(target)))
      await writeFile(join(target, 'index.html'), page, 'utf8')
    },
  }
}
