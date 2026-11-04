'use strict';
// Minimal VS Code Web extension: back the vscode-userdata scheme with the
// DSH host's $DSH_HOME/codemode/ tree via the /vscode-userdata route. This
// redirects all VS Code user data (settings, keybindings, extensions, state)
// off browser storage and into the harness home directory.
const vscode = require('vscode');

function toPath(uri) {
  // vscode-userdata:/a/b -> /a/b
  let p = uri.path || '/';
  if (!p.startsWith('/')) p = '/' + p;
  return p;
}

function base() {
  return (typeof window !== 'undefined' && window.location && window.location.origin) || '';
}

async function request(method, path, body) {
  const res = await fetch(base() + '/vscode-userdata' + path, {
    method,
    headers: body ? { 'content-type': 'application/octet-stream' } : undefined,
    body: body || undefined,
    credentials: 'same-origin',
  });
  if (!res.ok) {
    const err = new Error('vscode-userdata request failed: ' + res.status);
    err.code = res.status === 404 ? vscode.FileSystemError.FileNotFound : vscode.FileSystemError.Unknown;
    throw err;
  }
  if (method === 'GET' || method === 'HEAD') {
    const ct = res.headers.get('content-type') || '';
    if (ct.indexOf('application/json') === 0) return await res.json();
    return new Uint8Array(await res.arrayBuffer());
  }
  return undefined;
}

class Provider {
  constructor() {
    this._emitter = new vscode.EventEmitter();
    this.onDidChangeFile = this._emitter.event;
  }
  watch() { return new vscode.Disposable(() => {}); }
  async stat(uri) {
    try {
      const data = await request('GET', toPath(uri));
      if (Array.isArray(data)) {
        return { type: vscode.FileType.Directory, ctime: 0, mtime: 0, size: 0 };
      }
      const size = (data && (data.byteLength || (data.length))) || 0;
      return { type: vscode.FileType.File, ctime: 0, mtime: 0, size: size };
    } catch (e) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
  }
  async readDirectory(uri) {
    const data = await request('GET', toPath(uri));
    if (!Array.isArray(data)) throw vscode.FileSystemError.FileNotADirectory(uri);
    return data.map(e => [e.name, e.kind === 'directory' ? vscode.FileType.Directory : vscode.FileType.File]);
  }
  async readFile(uri) {
    const data = await request('GET', toPath(uri));
    if (data instanceof Uint8Array) return data;
    if (Array.isArray(data)) throw vscode.FileSystemError.FileIsADirectory(uri);
    return new TextEncoder().encode(JSON.stringify(data));
  }
  async writeFile(uri, content, options) {
    await request('PUT', toPath(uri), content);
  }
  async delete(uri, options) {
    await request('DELETE', toPath(uri));
  }
  async rename(oldUri, newUri, options) {
    const data = await this.readFile(oldUri);
    await this.writeFile(newUri, data, { create: true, overwrite: true });
    await this.delete(oldUri);
  }
  async createDirectory(uri) {
    // Creating a directory is implicit on PUT of a child; ensure by writing a
    // marker-free directory via a trailing slash PUT is not needed here.
    await request('PUT', toPath(uri) + '/.dsh-keep', new Uint8Array(0)).catch(() => {});
  }
  async copy(source, destination, options) {
    const data = await this.readFile(source);
    await this.writeFile(destination, data, { create: true, overwrite: options.overwrite });
  }
}

function activate(context) {
  const provider = new Provider();
  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider('vscode-userdata', provider, { isCaseSensitive: true, isReadonly: false })
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
