import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
import { pathToFileURL } from 'node:url';
test('announcements: admin authorization, public visibility, revisions and withdrawal', async () => {
  const db = new DatabaseSync(':memory:'),
    dir = mkdtempSync(join(tmpdir(), 'bw-lobby-'));
  try {
    for (const f of readdirSync('drizzle')
      .filter((x) => x.endsWith('.sql'))
      .sort())
      db.exec(readFileSync('drizzle/' + f, 'utf8'));
    globalThis.__lobbyDB = db;
    writeFileSync(
      join(dir, 'store.mjs'),
      `export const one=async(s,...v)=>globalThis.__lobbyDB.prepare(s).get(...v);export const all=async(s,...v)=>globalThis.__lobbyDB.prepare(s).all(...v);export const run=async(s,...v)=>({meta:globalThis.__lobbyDB.prepare(s).run(...v)});`,
    );
    writeFileSync(
      join(dir, 'account.mjs'),
      `export const accountId=r=>r.headers.get('test-user');export const isSiteAdmin=r=>accountId(r)==='admin';export const guestToken=r=>r.headers.get('test-guest')||'';export const tokenHash=async v=>v;`,
    );
    for (const [file, name] of [['app/api/announcements/route.ts', 'route']]) {
      const src = ts
        .transpileModule(readFileSync(file, 'utf8'), {
          compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        })
        .outputText.replaceAll('@/lib/account', './account.mjs')
        .replaceAll('@/lib/store', './store.mjs')
        .replaceAll('@/lib/inquiries', './inquiries.mjs');
      writeFileSync(join(dir, name + '.mjs'), src);
    }
    const { GET, POST } = await import(pathToFileURL(join(dir, 'route.mjs')));
    const req = (user, body, admin = false) =>
      new Request('https://test/api/announcements' + (admin ? '?admin=1' : ''), {
        method: body ? 'POST' : 'GET',
        headers: user ? { 'test-user': user } : {},
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    const b = { body: '점검 공지 테스트', active: true, revision: 0 };
    assert.equal((await POST(req('one', b))).status, 403);
    assert.equal((await GET(req('one', null, true))).status, 403);
    assert.equal((await (await GET(req(null))).json()).announcement, null);
    assert.equal((await POST(req('admin', b))).status, 200);
    let d = await (await GET(req(null))).json();
    assert.equal(d.announcement.body, b.body);
    assert.equal(d.announcement.revision, 1);
    assert.equal((await POST(req('admin', b))).status, 409);
    assert.equal((await POST(req('admin', { ...b, revision: 1, body: '' }))).status, 400);
    assert.equal(
      (await POST(req('admin', { ...b, revision: 1, body: 'a'.repeat(301) }))).status,
      400,
    );
    assert.equal((await POST(req('admin', { ...b, revision: 1, active: false }))).status, 200);
    assert.equal((await (await GET(req(null))).json()).announcement, null);
    const hidden = await (await GET(req('admin', null, true))).json();
    assert.equal(hidden.body, b.body);
    assert.equal(hidden.revision, 2);
    assert.equal((await POST(req('admin', { ...b, revision: 2, body: '새 공지' }))).status, 200);
    assert.equal((await (await GET(req(null))).json()).announcement.revision, 3);
    const cross = new Request('https://test/api/announcements', {
      method: 'POST',
      headers: { origin: 'https://other.test', 'test-user': 'admin' },
      body: JSON.stringify({ ...b, revision: 3 }),
    });
    assert.equal((await POST(cross)).status, 403);
  } finally {
    db.close();
    delete globalThis.__lobbyDB;
    rmSync(dir, { recursive: true, force: true });
  }
});
