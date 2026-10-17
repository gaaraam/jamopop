import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
import { pathToFileURL } from 'node:url';
test('private inquiries: ownership, admin replies, duplicate sends, rate limit and chat commands', async () => {
  const db = new DatabaseSync(':memory:'),
    dir = mkdtempSync(join(tmpdir(), 'bw-inquiries-'));
  try {
    for (const f of readdirSync('drizzle')
      .filter((x) => x.endsWith('.sql'))
      .sort())
      db.exec(readFileSync('drizzle/' + f, 'utf8'));
    globalThis.__inqDB = db;
    writeFileSync(
      join(dir, 'store.mjs'),
      `export const one=async(s,...v)=>globalThis.__inqDB.prepare(s).get(...v);export const all=async(s,...v)=>globalThis.__inqDB.prepare(s).all(...v);export const run=async(s,...v)=>({meta:globalThis.__inqDB.prepare(s).run(...v)});`,
    );
    writeFileSync(
      join(dir, 'account.mjs'),
      `export const accountId=r=>r.headers.get('test-user');export const isSiteAdmin=r=>accountId(r)==='admin';export const guestToken=r=>r.headers.get('test-guest')||'';export const tokenHash=async v=>v;`,
    );
    for (const [file, name] of [
      ['lib/inquiries.ts', 'inquiries'],
      ['app/api/inquiries/route.ts', 'route'],
    ]) {
      let src = ts
        .transpileModule(readFileSync(file, 'utf8'), {
          compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        })
        .outputText.replaceAll('@/lib/account', './account.mjs')
        .replaceAll('@/lib/store', './store.mjs')
        .replaceAll('@/lib/inquiries', './inquiries.mjs');
      writeFileSync(join(dir, name + '.mjs'), src);
    }
    const { GET, POST } = await import(pathToFileURL(join(dir, 'route.mjs'))),
      { inquiryCommand } = await import(pathToFileURL(join(dir, 'inquiries.mjs')));
    const req = (user, body) =>
      new Request('https://test/api/inquiries', {
        method: body ? 'POST' : 'GET',
        headers: user ? { 'test-user': user } : {},
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    const post = (user, b) => POST(req(user, b));
    const data = () => ({
      action: 'create',
      name: '테스트',
      category: '오류',
      title: '키보드 문의',
      body: '입력 확인',
      requestId: crypto.randomUUID(),
    });
    let body = data();
    let r = await post('one', body);
    assert.equal(r.status, 200);
    const id = (await r.json()).id;
    assert.equal((await (await post('one', body)).json()).id, id);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM inquiries').get().n, 1);
    assert.equal((await (await GET(req('two'))).json()).rows.length, 0);
    assert.equal(
      (
        await GET(
          new Request('https://test/api/inquiries?admin=1', { headers: { 'test-user': 'two' } }),
        )
      ).status,
      403,
    );
    assert.equal(
      (await post('two', { action: 'respond', id, revision: 0, status: 'answered', answer: 'no' }))
        .status,
      403,
    );
    assert.equal(
      (
        await post('admin', {
          action: 'respond',
          id,
          revision: 0,
          status: 'answered',
          answer: '수정했습니다.',
        })
      ).status,
      200,
    );
    assert.equal(
      (await post('admin', { action: 'respond', id, revision: 0, status: 'closed', answer: '' }))
        .status,
      409,
    );
    const own = await (await GET(req('one'))).json();
    assert.equal(own.rows[0].answer, '수정했습니다.');
    assert.equal(own.rows[0].owner, undefined);
    for (let i = 0; i < 9; i++) assert.equal((await post('one', data())).status, 200);
    assert.equal((await post('one', data())).status, 400);
    assert.equal((await (await post('one', body)).json()).id, id);
    assert.equal((await post(null, data())).status, 401);
    assert((await GET(req(null))).headers.get('set-cookie').includes('HttpOnly'));
    const deletion = {
      action: 'request-deletion',
      confirm: '계정 삭제 요청',
      owner: 'account:victim',
    };
    assert.equal((await post(null, deletion)).status, 401);
    assert.equal((await post('requester', { ...deletion, confirm: '' })).status, 400);
    const attempts = await Promise.all(
      Array.from({ length: 4 }, () => post('requester', deletion)),
    );
    const ids = await Promise.all(
      attempts.map(async (response) => {
        assert.equal(response.status, 200);
        return (await response.json()).id;
      }),
    );
    assert.equal(new Set(ids).size, 1);
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM inquiries WHERE category='계정 삭제'").get().n,
      1,
    );
    assert.equal(
      db.prepare('SELECT owner FROM inquiries WHERE id=?').get(ids[0]).owner,
      'account:requester',
    );
    assert.equal((await (await GET(req('victim'))).json()).rows.length, 0);
    assert.equal((await (await GET(req('requester'))).json()).rows[0].accountReference, undefined);
    const adminRows = await (
      await GET(
        new Request('https://test/api/inquiries?admin=1', { headers: { 'test-user': 'admin' } }),
      )
    ).json();
    assert.equal(
      adminRows.rows.find((row) => row.id === ids[0]).accountReference,
      'account:requester',
    );
    assert.equal(
      (
        await post('admin', {
          action: 'respond',
          id: ids[0],
          revision: 0,
          status: 'closed',
          answer: '삭제 완료',
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await post('admin', {
          action: 'respond',
          id: ids[0],
          revision: 0,
          status: 'reviewing',
          answer: '연결 범위를 확인하고 있습니다.',
        })
      ).status,
      200,
    );
    assert.equal((await (await post('requester', deletion)).json()).id, ids[0]);
    assert.equal((await post('requester', { ...data(), category: '계정 삭제' })).status, 400);
    assert.equal(
      (
        await POST(
          new Request('https://test/api/inquiries', {
            method: 'POST',
            headers: { 'test-user': 'requester', origin: 'https://other.test' },
            body: JSON.stringify(deletion),
          }),
        )
      ).status,
      403,
    );
    assert.equal(inquiryCommand('@문의  키보드가 안돼요'), '키보드가 안돼요');
    assert.equal(inquiryCommand('@문의'), '');
    assert.equal(inquiryCommand('일반 대화'), null);
    assert.equal(inquiryCommand('@문의사항'), null);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM chat_messages').get().n, 0);
  } finally {
    db.close();
    delete globalThis.__inqDB;
    rmSync(dir, { recursive: true, force: true });
  }
});
