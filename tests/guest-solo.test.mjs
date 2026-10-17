import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
test('guest solo transfer preserves run history and rewards; retries and account conflicts never overwrite', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'guest-solo-')),
    db = new DatabaseSync(':memory:');
  try {
    for (const f of readdirSync('drizzle')
      .filter((f) => f.endsWith('.sql'))
      .sort())
      db.exec(readFileSync(join('drizzle', f), 'utf8'));
    let race = null;
    globalThis.__guestSolo = {
      one: async (sql, ...a) => db.prepare(sql).get(...a),
      database: () => ({
        prepare: (sql) => ({ bind: (...a) => ({ sql, a }) }),
        batch: async (qs) => {
          if (race) {
            race();
            race = null;
          }
          db.exec('BEGIN');
          try {
            const result = qs.map((q) => db.prepare(q.sql).run(...q.a));
            db.exec('COMMIT');
            return result;
          } catch (e) {
            db.exec('ROLLBACK');
            throw e;
          }
        },
      }),
    };
    writeFileSync(join(dir, 'store.mjs'), 'export const {one,database}=globalThis.__guestSolo;');
    writeFileSync(
      join(dir, 'link.mjs'),
      ts
        .transpileModule(readFileSync('lib/guest-solo.ts', 'utf8'), {
          compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        })
        .outputText.replaceAll(
          "'./store'",
          JSON.stringify(pathToFileURL(join(dir, 'store.mjs')).href),
        ),
    );
    const api = await import(pathToFileURL(join(dir, 'link.mjs')).href);
    const empty = { best: {}, recent: [], active: null, xp: 0 },
      state = {
        best: { 1: 3 },
        recent: ['수박'],
        xp: 90,
        active: {
          id: 'run1',
          stage: 1,
          answer: '수박',
          startedAt: 1,
          endsAt: null,
          status: 'won',
          guesses: [{ letters: ['ㅅ', 'ㅜ', 'ㅂ', 'ㅏ', 'ㄱ'], colors: Array(5).fill('green') }],
          stars: 3,
        },
      };
    const seed = (owner, value) =>
      db
        .prepare('INSERT INTO solo_progress(owner,state,revision) VALUES(?,?,0)')
        .run(owner, JSON.stringify(value));
    seed('guest:g', state);
    seed('account:a', empty);
    db.prepare("INSERT INTO solo_runs VALUES('run1','guest:g',1,'won',1,3,1,NULL,1)").run();
    assert.deepEqual(await api.guestSoloStatus('g', 'a'), { pending: true, conflict: false });
    await api.linkGuestSolo('g', 'a');
    assert.deepEqual(
      JSON.parse(db.prepare("SELECT state FROM solo_progress WHERE owner='account:a'").get().state),
      state,
    );
    assert.equal(
      db.prepare("SELECT owner FROM solo_runs WHERE id='run1'").get().owner,
      'account:a',
    );
    await api.linkGuestSolo('g', 'a');
    assert.equal(
      JSON.parse(db.prepare("SELECT state FROM solo_progress WHERE owner='account:a'").get().state)
        .xp,
      90,
    );
    assert.equal((await api.guestSoloStatus('g', 'a')).pending, false);
    seed('guest:other', { ...state, active: { ...state.active, id: 'run2' } });
    const before = db
      .prepare("SELECT state FROM solo_progress WHERE owner='account:a'")
      .get().state;
    await api.linkGuestSolo('other', 'a');
    assert.equal(
      db.prepare("SELECT state FROM solo_progress WHERE owner='account:a'").get().state,
      before,
    );
    assert.deepEqual(await api.guestSoloStatus('other', 'a'), { pending: true, conflict: true });
    seed('guest:race', state);
    seed('account:race', empty);
    race = () =>
      db
        .prepare("UPDATE solo_progress SET revision=revision+1,state=? WHERE owner='guest:race'")
        .run(JSON.stringify({ ...state, xp: 110 }));
    await assert.rejects(api.linkGuestSolo('race', 'race'), /다른 창/);
    assert.deepEqual(
      JSON.parse(
        db.prepare("SELECT state FROM solo_progress WHERE owner='account:race'").get().state,
      ),
      empty,
    );
    assert.equal(
      JSON.parse(db.prepare("SELECT state FROM solo_progress WHERE owner='guest:race'").get().state)
        .xp,
      110,
    );
    seed('guest:account-race', state);
    seed('account:account-race', empty);
    race = () =>
      db
        .prepare(
          "UPDATE solo_progress SET revision=revision+1,state=? WHERE owner='account:account-race'",
        )
        .run(JSON.stringify({ ...state, xp: 120 }));
    await assert.rejects(api.linkGuestSolo('account-race', 'account-race'), /다른 창/);
    assert.equal(
      JSON.parse(
        db.prepare("SELECT state FROM solo_progress WHERE owner='account:account-race'").get()
          .state,
      ).xp,
      120,
    );
    assert.equal((await api.guestSoloStatus('account-race', 'account-race')).pending, true);
  } finally {
    db.close();
    delete globalThis.__guestSolo;
    rmSync(dir, { recursive: true, force: true });
  }
});
