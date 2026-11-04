// @vitest-environment node
/** Host-side codemode file service: traversal, auth, read/write. */
import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply, handleCodemode } from '../src/vscode-codemode.ts'
import { Context } from '@deepseek-ai/cordis'
import { Readable } from 'node:stream'

function fakeReq(method: string, url: string, body?: Buffer): Record<string, unknown> {
  const r = new Readable({ read() { if (body) { this.push(body); this.push(null) } else this.push(null) } })
  r.method = method
  r.url = url
  r.headers = {}
  return r
}

class FakeRes {
  statusCode = 0
  headers: Record<string, string> = {}
  body = ''
  ended = false
  setHeader(k: string, v: string) { this.headers[k] = v }
  end(b?: unknown) { if (b !== undefined) this.body += String(b); this.ended = true }
  writeHead(s: number) { this.statusCode = s; return this }
  destroy() { this.ended = true }
}

describe('handleCodemode', () => {
  it('rejects traversal outside the root', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cm-'))
    try {
      const res = new FakeRes()
      await handleCodemode(fakeReq('GET', '/vscode-userdata/../secret.txt'), res as never, root)
      expect(res.statusCode).toBe(403)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it('writes and reads a file round trip', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cm-'))
    try {
      const payload = Buffer.from('hello codemode', 'utf8')
      const w = new FakeRes()
      await handleCodemode(fakeReq('PUT', '/vscode-userdata/a/b.txt', payload), w as never, root)
      expect(w.statusCode).toBe(204)
      expect(readFileSync(join(root, 'a', 'b.txt'), 'utf8')).toBe('hello codemode')

      const r = new FakeRes()
      await handleCodemode(fakeReq('GET', '/vscode-userdata/a/b.txt'), r as never, root)
      expect(r.statusCode).toBe(200)
      expect(r.body).toBe('hello codemode')
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it('lists a directory as JSON', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cm-'))
    try {
      mkdirSync(join(root, 'sub'))
      writeFileSync(join(root, 'x.json'), '{}')
      const r = new FakeRes()
      await handleCodemode(fakeReq('GET', '/vscode-userdata/'), r as never, root)
      expect(r.statusCode).toBe(200)
      const parsed = JSON.parse(r.body)
      expect(parsed.map((e: { name: string }) => e.name).sort()).toEqual(['sub', 'x.json'])
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it('returns 404 for missing files', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cm-'))
    try {
      const r = new FakeRes()
      await handleCodemode(fakeReq('GET', '/vscode-userdata/nope.txt'), r as never, root)
      expect(r.statusCode).toBe(404)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it('rejects unsupported methods with 405', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cm-'))
    try {
      const res = new FakeRes()
      await handleCodemode(fakeReq('POST', '/vscode-userdata/x.txt'), res as never, root)
      expect(res.statusCode).toBe(405)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it('HEAD returns headers without body', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cm-'))
    try {
      writeFileSync(join(root, 'h.json'), '{}')
      const res = new FakeRes()
      await handleCodemode(fakeReq('HEAD', '/vscode-userdata/h.json'), res as never, root)
      expect(res.statusCode).toBe(200)
      expect(res.headers['content-type']).toContain('application/json')
      expect(res.body).toBe('')
    } finally { rmSync(root, { recursive: true, force: true }) }
  })


  it('reads an extensionless file as octet-stream', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cm-'))
    try {
      writeFileSync(join(root, 'noext'), 'data')
      const res = new FakeRes()
      await handleCodemode(fakeReq('GET', '/vscode-userdata/noext'), res as never, root)
      expect(res.statusCode).toBe(200)
      expect(res.headers['content-type']).toBe('application/octet-stream')
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it('handles string chunks in PUT body', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cm-'))
    try {
      const r = new Readable({ objectMode: true, read() { this.push('hi'); this.push(null) } })
      r.method = 'PUT'
      r.url = '/vscode-userdata/str.txt'
      r.headers = {}
      const res = new FakeRes()
      await handleCodemode(r as never, res as never, root)
      expect(res.statusCode).toBe(204)
      expect(readFileSync(join(root, 'str.txt'), 'utf8')).toBe('hi')
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it('handles a request with no url', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cm-'))
    try {
      const r = fakeReq('GET', '')
      r.url = undefined
      const res = new FakeRes()
      await handleCodemode(r as never, res as never, root)
      // root itself is a directory listing
      expect(res.statusCode).toBe(200)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it('HEAD on a directory returns no body', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cm-'))
    try {
      mkdirSync(join(root, 'sub'))
      const res = new FakeRes()
      await handleCodemode(fakeReq('HEAD', '/vscode-userdata/sub'), res as never, root)
      expect(res.statusCode).toBe(200)
      expect(res.body).toBe('')
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it('reads a .bin file as octet-stream (mime fallback)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cm-'))
    try {
      writeFileSync(join(root, 'data.bin'), 'bytes')
      const res = new FakeRes()
      await handleCodemode(fakeReq('GET', '/vscode-userdata/data.bin'), res as never, root)
      expect(res.statusCode).toBe(200)
      expect(res.headers['content-type']).toBe('application/octet-stream')
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it('returns 500 when the handler throws', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cm-'))
    try {
      // make root a file so mkdir inside it fails on PUT
      rmSync(root, { recursive: true, force: true })
      writeFileSync(root, 'not a dir')
      const res = new FakeRes()
      const buf = Buffer.from('x')
      await handleCodemode(fakeReq('PUT', '/vscode-userdata/sub/x.txt', buf), res as never, root)
      expect(res.statusCode).toBe(500)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it('deletes a file', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cm-'))
    try {
      writeFileSync(join(root, 'del.txt'), 'x')
      const d = new FakeRes()
      await handleCodemode(fakeReq('DELETE', '/vscode-userdata/del.txt'), d as never, root)
      expect(d.statusCode).toBe(204)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
})


interface Route { kind: string; path: string; handler: (req: unknown, res: unknown) => void }

describe('vscode-codemode apply', () => {
  it('registers the /vscode-userdata prefix route and releases it on disposal', async () => {
    const ctx = new Context()
    const routes: Route[] = []
    ctx.provide('webServer', {
      register: (route: Route) => { routes.push(route); return () => { routes.splice(routes.indexOf(route), 1) } },
    } as never)
    ctx.provide('connection', { authorizeIndex: () => true } as never)
    apply(ctx)
    expect(routes).toHaveLength(1)
    expect(routes[0]!.kind).toBe('prefix')
    expect(routes[0]!.path).toBe('/vscode-userdata')
    await ctx.fiber.dispose()
    expect(routes).toHaveLength(0)
  })

  it('short-circuits an unauthenticated request', () => {
    const ctx = new Context()
    const routes: Route[] = []
    ctx.provide('webServer', {
      register: (route: Route) => { routes.push(route); return () => {} },
    } as never)
    ctx.provide('connection', { authorizeIndex: () => false } as never)
    apply(ctx)
    const res = new FakeRes()
    routes[0]!.handler(fakeReq('GET', '/vscode-userdata/x.txt'), res as never)
    expect(res.ended).toBe(false)
    expect(res.statusCode).toBe(0)
  })

  it('serves through the registered route when authorized', async () => {
    const ctx = new Context()
    const routes: Route[] = []
    ctx.provide('webServer', {
      register: (route: Route) => { routes.push(route); return () => {} },
    } as never)
    ctx.provide('connection', { authorizeIndex: () => true } as never)
    apply(ctx)
    // point codemode root at a temp dir by overriding? root is fixed; instead just invoke handler
    const res = new FakeRes()
    routes[0]!.handler(fakeReq('GET', '/vscode-userdata/nope.txt'), res as never)
    // allow async handleCodemode to settle
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(res.statusCode).toBe(404)
  })
})
