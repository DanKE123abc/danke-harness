/**
 * Serve the VS Code Web workbench copied into `<dist>/vscode/`.
 *
 * The payload is ~225 MB of opaque static files. It is deliberately kept out
 * of the Vite/Rollup graph and out of the SPA fallback owner: `frontend-static`
 * claims the single fallback seat and only authenticates the two index paths,
 * so a named prefix route is the only place that can both gate the workbench
 * behind the GUI's browser authentication and supply the extra MIME types
 * (`.wasm`, fonts, images) the workbench needs.
 *
 * Mirrors `packages/experimental/inspector/src/host/plugin.ts`: one prefix
 * route, explicit method handling, index authentication, and a root redirect.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-host-webserver'

/** URL prefix owning the workbench and every file beneath it. */
export const VSCODE_PATH = '/vscode'

/** Stable Cordis plugin name. */
export const name = 'vscode-static'

/** Services required before the authenticated route can be claimed. */
export const inject = ['webServer', 'connection']

export interface Config {
  /** Absolute dist root (the directory containing `index.html`). */
  distRoot: string
}

export const Config: z<Config> = z.object({
  distRoot: z.string().required(),
})

/** Everything the frontend-static table carries, plus workbench asset types. */
const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.map': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.gz': 'application/gzip',
  // VS Code Web workers stream Wasm; a wrong MIME breaks instantiateStreaming.
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.xml': 'application/xml',
  '.webm': 'video/webm',
}

const MISS_CODES: ReadonlySet<string | undefined> = new Set(['ENOENT', 'EISDIR', 'ENOTDIR'])

/** Answer one workbench asset request. Exported for focused route tests. */
export async function serveVscodeAsset(
  req: IncomingMessage, res: ServerResponse, root: string,
): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' }).end()
    return
  }
  const url = new URL(req.url ?? '/', 'http://vscode.invalid')
  const pathname = url.pathname
  if (pathname === VSCODE_PATH || pathname === `${VSCODE_PATH}/`) {
    const suffix = url.search
    res.writeHead(302, { location: `${VSCODE_PATH}/index.html${suffix}` }).end()
    return
  }
  // Decode after slicing: the prefix itself never contains an escape.
  let relative: string
  try {
    relative = decodeURIComponent(pathname.slice(VSCODE_PATH.length + 1))
  } catch {
    res.writeHead(400).end()
    return
  }
  const target = resolve(normalize(join(root, relative)))
  if (target !== root && !target.startsWith(root + sep)) {
    res.writeHead(403).end()
    return
  }
  let info
  try {
    info = await stat(target)
  } catch (error) {
    if (!MISS_CODES.has((error as NodeJS.ErrnoException).code)) throw error
    res.writeHead(404).end()
    return
  }
  if (!info.isFile()) {
    res.writeHead(404).end()
    return
  }
  res.writeHead(200, {
    'content-type': MIME[extname(target)] ?? 'application/octet-stream',
    'content-length': String(info.size),
    // The workbench and its workers are same-origin; no CSP header is set by
    // this host, but keep the assets opaque to sniffing and framing surprises.
    'x-content-type-options': 'nosniff',
  })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  const stream = createReadStream(target)
  stream.on('error', () => { res.destroy() })
  stream.pipe(res)
}

/** Register the `/vscode` prefix route over `<distRoot>/vscode/`. */
export function apply(ctx: Context, config: Config): void {
  const root = resolve(join(config.distRoot, 'vscode'))
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: VSCODE_PATH,
    handler: (req, res) => {
      if (!ctx.connection.authorizeIndex(req, res)) return
      void serveVscodeAsset(req, res, root).catch((error: unknown) => {
        ctx.logger.warn('vscode-static: asset request failed', error)
        if (res.headersSent) res.destroy()
        else res.writeHead(500).end()
      })
    },
  }), 'vscode-static: prefix route')
}
