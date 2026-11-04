/**
 * Host-side file service for the embedded VS Code user data.
 *
 * The workbench stores its settings, keybindings, extensions and global state
 * under the `vscode-userdata` scheme. The `dsh-workspace` builtin extension
 * (see `apps/web/vscode-extension/`) replaces the default IndexedDB-backed
 * provider for that scheme with one backed by this route, so every byte lands
 * under `$DSH_HOME/codemode/` instead of browser storage.
 *
 * Route: prefix `/vscode-userdata` (authenticated like the index). Methods:
 *   GET/HEAD  read a file (or list a directory as JSON)
 *   PUT       write a file (creates parent directories)
 *   DELETE    remove a file or directory
 */

import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import * as fsp from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import type { IncomingMessage, ServerResponse } from 'node:http'

/** Plugin name published on the Host Cordis context. */
export const name = 'vscode-codemode'

/** Required Host services: the web server and the connection (for index auth). */
export const inject = ['webServer', 'connection']

/** Plugin configuration; no tunables today. */
export interface Config {}

/** MIME types for the few kinds of payload the user-data tree carries. */
const MIME: Record<string, string> = {
  '.json': 'application/json; charset=utf-8',
  '.jsonc': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.log': 'text/plain; charset=utf-8',
  '.vsix': 'application/zip',
}

function codemodeRoot(): string {
  return join(resolveDshHome(), 'codemode')
}

function mimeFor(path: string): string {
  const dot = path.lastIndexOf('.')
  if (dot < 0) return 'application/octet-stream'
  return MIME[path.slice(dot).toLowerCase()] ?? 'application/octet-stream'
}

function send(res: ServerResponse, status: number, body?: string | Buffer): void {
  res.statusCode = status
  if (body !== undefined) {
    res.setHeader('content-type', 'text/plain; charset=utf-8')
    res.end(body)
  } else {
    res.end()
  }
}

function isInside(root: string, target: string): boolean {
  const r = resolve(root)
  const t = resolve(target)
  return t === r || t.startsWith(r + sep)
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer))
  return Buffer.concat(chunks)
}

/** Serve (or mutate) one path under the codemode root. */
export async function handleCodemode(req: IncomingMessage, res: ServerResponse, root: string): Promise<void> {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'PUT' && req.method !== 'DELETE') {
      res.setHeader('allow', 'GET, HEAD, PUT, DELETE')
      send(res, 405)
      return
    }
    const raw = (req.url ?? '/').split('?')[0] as string
    const relative = decodeURIComponent(raw.replace(/^\/vscode-userdata\/?/, ''))
    const target = join(root, relative || '.')
    if (!isInside(root, target)) {
      send(res, 403, 'forbidden')
      return
    }
    if (req.method === 'PUT') {
      const body = await readBody(req)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, body)
      send(res, 204)
      return
    }
    if (req.method === 'DELETE') {
      await rm(target, { recursive: true, force: true })
      send(res, 204)
      return
    }
    let info: Awaited<ReturnType<typeof fsp.stat>>
    try {
      info = await fsp.stat(target)
    } catch {
      send(res, 404, 'not found')
      return
    }
    if (info.isDirectory()) {
      const entries = await readdir(target, { withFileTypes: true })
      const listing = entries.map(entry => ({ name: entry.name, kind: entry.isDirectory() ? 'directory' : 'file' }))
      const payload = JSON.stringify(listing)
      res.statusCode = 200
      res.setHeader('content-type', 'application/json; charset=utf-8')
      if (req.method === 'HEAD') res.end()
      else res.end(payload)
      return
    }
    res.statusCode = 200
    res.setHeader('content-type', mimeFor(target))
    res.setHeader('content-length', String(info.size))
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    const data = await readFile(target)
    res.end(data)
  } catch (error) {
    send(res, 500, String(error))
  }
}

/** Plugin body: register the `/vscode-userdata` prefix route. */
export function apply(ctx: Context, _config: Config = {}): void {
  const root = codemodeRoot()
  void mkdir(root, { recursive: true })
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/vscode-userdata',
    handler: (req, res) => {
      if (!ctx.connection.authorizeIndex(req, res)) return
      void handleCodemode(req, res, root)
    },
  }), 'vscode-codemode: prefix route')
}
