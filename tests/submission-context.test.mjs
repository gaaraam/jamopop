import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import ts from 'typescript';
const mod = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
test('indexed normal submission context keeps account precedence, linked-cookie isolation, roles and legacy fallback', async (t) => {
  const db = new DatabaseSync(':memory:');
  t.after(() => {
    db.close();
    delete globalThis.__normalSubmissionDb;
  });
  for (const f of readdirSync('drizzle')
    .filter((f) => f.endsWith('.sql'))
    .sort())
    db.exec(readFileSync('drizzle/' + f, 'utf8'));
  globalThis.__normalSubmissionDb = db;
  const deps = {
    '@/lib/account': mod('export const findMember=()=>null,isSiteAdmin=()=>false;'),
    '@/lib/cosmetics': mod('export const AVATARS=[];'),
    '@/lib/game-api/http': mod(
      'export function check(ok,message,status=400){if(!ok){const e=Error(message);e.status=status;throw e;}}',
    ),
    '@/lib/store': mod(
      'export const one=async(sql,...v)=>globalThis.__normalSubmissionDb.prepare(sql).get(...v)||null;export const all=()=>[],database=()=>null,run=()=>null;',
    ),
    '@/lib/words': mod("export const randomWord=()=> '사과';"),
  };
  let code = ts.transpileModule(readFileSync('lib/game-api/runtime.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const [key, value] of Object.entries(deps))
    code = code.replaceAll("'" + key + "'", JSON.stringify(value));
  const { hash, normalSubmissionContext } = await import(mod(code));
  const room = 'a'.repeat(24),
    token = 'b'.repeat(64),
    linkedToken = 'c'.repeat(64);
  db.prepare(
    'INSERT INTO rooms(id,name,host_id,created_at,current_round_id) VALUES(?,?,?,?,?)',
  ).run(room, '가상 방', 'guest', 1, 'round');
  db.prepare(
    "INSERT INTO rounds(id,room_id,mode,answer,starts_at,width,phase,variant) VALUES('round',?,'daily','사과',1,5,'running','normal')",
  ).run(room);
  const insert = db.prepare(
    'INSERT INTO members(id,room_id,token_hash,name,avatar,last_seen,account_id) VALUES(?,?,?,?,?,?,?)',
  );
  insert.run('guest', room, await hash(token), '게스트', '🐱', 1, null);
  insert.run('linked', room, await hash(linkedToken), '회원', '🐱', 1, 'owner');
  const req = (account, cookieToken) =>
    new Request('https://example.test/api/game', {
      headers: {
        ...(account ? { 'oai-authenticated-user-id': account } : {}),
        ...(cookieToken ? { cookie: 'bw_session=' + cookieToken } : {}),
      },
    });
  const body = { room, mode: 'daily' };
  assert.equal((await normalSubmissionContext(req(null, token), body)).member.id, 'guest');
  assert.equal((await normalSubmissionContext(req('owner', token), body)).member.id, 'linked');
  assert.equal((await normalSubmissionContext(req('different', token), body)).member.id, 'guest');
  assert.equal(await normalSubmissionContext(req(null, linkedToken), body), null);
  const context = await normalSubmissionContext(req('owner'), body);
  assert.equal(context.round.answer, '사과');
  assert.equal(context.play, null);
  db.exec("UPDATE members SET blocked=1 WHERE id='linked'");
  await assert.rejects(normalSubmissionContext(req('owner'), body), (e) => e.status === 403);
  db.exec(
    "UPDATE members SET blocked=0 WHERE id='linked';INSERT INTO spectators VALUES('round','linked')",
  );
  await assert.rejects(normalSubmissionContext(req('owner'), body), (e) => e.status === 403);
  db.exec("DELETE FROM spectators;UPDATE rounds SET variant='items'");
  assert.equal(await normalSubmissionContext(req('owner'), body), null);
  db.exec('UPDATE rooms SET current_round_id=NULL');
  assert.equal(await normalSubmissionContext(req('owner'), body), null);
  assert.equal(
    db.prepare('SELECT COUNT(*) n FROM plays').get().n,
    0,
    'context reads never create or replace a play',
  );
});
