/** The /vscode prefix route: asset serving, authentication, and disposal. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createReadStream } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable, Writable } from 'node:stream'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { apply, serveVscodeAsset, VSCODE_PATH } from '../src/vscode-static.ts'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, createReadStream: vi.fn(actual.createReadStream) }
})

/** Recording ServerResponse stand-in with the members the route touches. */
class FakeResponse extends Writable {
  statusCode = 0
  headers: Record<string, string> = {}
  readonly chunks: Buffer[] = []
  ended = false
  override destroyed = false
  /** Test hook: end() throws to model a broken client connection. */
  failOnEnd = false
  writeHead(status: number, headers?: Record<string, string | number>): this {
    this.statusCode = status
    for (const [key, value] of Object.entries(headers ?? {})) this.headers[key.toLowerCase()] = String(value)
    return this
  }
  override end(): this {
    if (this.failOnEnd) throw new Error('client aborted')
    this.ended = true
    return this
  }
  override destroy(): this {
    this.destroyed = true
    return this
  }
  get headersSent(): boolean { return this.statusCode !== 0 }
  override _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.chunks.push(Buffer.from(chunk))
    callback()
  }
}

let outer: string
let root: string

beforeEach(() => {
  outer = mkdtempSync(join(tmpdir(), 'dsh-vscode-static-'))
  root = join(outer, 'dist', 'vscode')
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, 'index.html'), '<html>code</html>')
  writeFileSync(join(root, 'data.wasm'), Buffer.from([0x00, 0x61, 0x73, 0x6d]))
  writeFileSync(join(root, 'tool.bin'), Buffer.from([0x01]))
  mkdirSync(join(root, 'vs'))
  writeFileSync(join(outer, 'secret.txt'), 'outside the served root')
})

afterEach(() => {
  rmSync(outer, { recursive: true, force: true })
})

const fakeRequest = (method: string, url?: string): IncomingMessage => ({ method, url } as never)

async function serve(method: string, url?: string): Promise<FakeResponse> {
  const res = new FakeResponse()
  await serveVscodeAsset(fakeRequest(method, url), res as never, root)
  await vi.waitFor(() => { expect(res.ended || res.destroyed).toBe(true) })
  return res
}

describe('serveVscodeAsset', () => {
  it('rejects methods outside GET and HEAD', async () => {
    const res = await serve('POST', `${VSCODE_PATH}/index.html`)
    expect(res.statusCode).toBe(405)
    expect(res.headers['allow']).toBe('GET, HEAD')
  })

  it.each([VSCODE_PATH, `${VSCODE_PATH}/`])('redirects %s to the bootstrap page', async (path) => {
    const res = await serve('GET', `${path}?session=s-1`)
    expect(res.statusCode).toBe(302)
    expect(res.headers['location']).toBe(`${VSCODE_PATH}/index.html?session=s-1`)
  })

  it('serves a file with its workbench MIME type and body', async () => {
    const res = await serve('GET', `${VSCODE_PATH}/index.html`)
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(Number(res.headers['content-length'])).toBe(Buffer.byteLength('<html>code</html>'))
    expect(Buffer.concat(res.chunks).toString('utf8')).toBe('<html>code</html>')
  })

  it('types wasm for streaming instantiation and falls back for unknown extensions', async () => {
    expect((await serve('GET', `${VSCODE_PATH}/data.wasm`)).headers['content-type']).toBe('application/wasm')
    expect((await serve('GET', `${VSCODE_PATH}/tool.bin`)).headers['content-type']).toBe('application/octet-stream')
  })

  it('answers HEAD without a body', async () => {
    const res = await serve('HEAD', `${VSCODE_PATH}/index.html`)
    expect(res.statusCode).toBe(200)
    expect(res.chunks).toHaveLength(0)
  })

  it('answers 404 for absent files, directories, and bare requests', async () => {
    expect((await serve('GET', `${VSCODE_PATH}/missing.js`)).statusCode).toBe(404)
    expect((await serve('GET', `${VSCODE_PATH}/vs`)).statusCode).toBe(404)
    expect((await serve('GET')).statusCode).toBe(404)
    expect((await serve('GET', `${VSCODE_PATH}/vs/nope.js`)).statusCode).toBe(404)
  })

  it('refuses paths that escape the served root', async () => {
    // Encoded slashes survive URL dot-segment normalization and decode after
    // the prefix slice, which is the only way traversal can reach the resolver.
    const res = await serve('GET', `${VSCODE_PATH}/..%2f..%2fsecret.txt`)
    expect(res.statusCode).toBe(403)
  })

  it('rejects malformed percent encoding', async () => {
    const res = await serve('GET', `${VSCODE_PATH}/%E0%A4%A`)
    expect(res.statusCode).toBe(400)
  })

  it('surfaces stat failures that are not a miss', async () => {
    await expect(serveVscodeAsset(fakeRequest('GET', `${VSCODE_PATH}/%00`), new FakeResponse() as never, root))
      .rejects.toThrow()
  })

  it('destroys the response when the file stream fails mid-read', async () => {
    const failing = new Readable({ read(): void { this.destroy(new Error('disk gone')) } })
    vi.mocked(createReadStream).mockReturnValueOnce(failing as never)
    const res = new FakeResponse()
    await serveVscodeAsset(fakeRequest('GET', `${VSCODE_PATH}/index.html`), res as never, root)
    await vi.waitFor(() => { expect(res.destroyed).toBe(true) })
  })
})

interface Route { kind: string; path: string; handler: (req: IncomingMessage, res: ServerResponse) => void }

/** Mount the plugin over fake webServer and connection services. */
function mount(options: { authorized?: boolean } = {}): { ctx: Context; routes: Route[] } {
  const ctx = new Context()
  const routes: Route[] = []
  ctx.provide('webServer', {
    register: (route: Route) => {
      routes.push(route)
      return () => { routes.splice(routes.indexOf(route), 1) }
    },
  } as never)
  ctx.provide('connection', { authorizeIndex: () => options.authorized ?? true } as never)
  apply(ctx, { distRoot: join(outer, 'dist') })
  return { ctx, routes }
}

describe('vscode-static apply', () => {
  it('registers the /vscode prefix route and releases it on disposal', async () => {
    const { ctx, routes } = mount()
    expect(routes).toHaveLength(1)
    expect(routes[0]!.kind).toBe('prefix')
    expect(routes[0]!.path).toBe(VSCODE_PATH)
    await ctx.fiber.dispose()
    expect(routes).toHaveLength(0)
  })

  it('short-circuits an unauthenticated request before touching assets', async () => {
    const { routes } = mount({ authorized: false })
    const res = new FakeResponse()
    routes[0]!.handler(fakeRequest('GET', `${VSCODE_PATH}/index.html`), res as never)
    expect(res.statusCode).toBe(0)
    expect(res.ended).toBe(false)
  })

  it('serves an authenticated asset through the route', async () => {
    const { routes } = mount()
    const res = new FakeResponse()
    routes[0]!.handler(fakeRequest('GET', `${VSCODE_PATH}/index.html`), res as never)
    await vi.waitFor(() => { expect(res.ended).toBe(true) })
    expect(res.statusCode).toBe(200)
    expect(Buffer.concat(res.chunks).toString('utf8')).toBe('<html>code</html>')
  })

  it('answers 500 when serving fails before any header', async () => {
    const { routes } = mount()
    const res = new FakeResponse()
    routes[0]!.handler(fakeRequest('GET', `${VSCODE_PATH}/%00`), res as never)
    await vi.waitFor(() => { expect(res.statusCode).toBe(500) })
  })

  it('destroys the response when serving fails after headers', async () => {
    const { routes } = mount()
    const res = new FakeResponse()
    res.failOnEnd = true
    routes[0]!.handler(fakeRequest('HEAD', `${VSCODE_PATH}/index.html`), res as never)
    await vi.waitFor(() => { expect(res.destroyed).toBe(true) })
    expect(res.statusCode).toBe(200)
  })
})
