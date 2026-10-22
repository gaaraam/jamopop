import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import {
  GOLD_SUMMARY,
  GOLD_DAILY,
  GOLD_SOURCES,
  GOLD_PRODUCTS,
  GOLD_WALLETS,
  GOLD_HISTORY,
} from '../lib/gold-economy.mjs';
test('gold dashboard reconciles wallets, daily bonus, guest linkage and retained sources without mutation', () => {
  const db = new DatabaseSync(':memory:');
  try {
    for (const f of readdirSync('drizzle')
      .filter((f) => f.endsWith('.sql'))
      .sort())
      db.exec(readFileSync('drizzle/' + f, 'utf8'));
    db.exec(`INSERT INTO rooms(id,name,host_id,created_at) VALUES('r','test','a',1),('r2','test','a2',1),('r3','test','g',1);
 INSERT INTO profiles(id,name,avatar,created_at) VALUES('A','같은 이름','🐱',1),('B','같은 이름','🐰',1);
 INSERT INTO members(id,room_id,token_hash,name,avatar,last_seen,account_id) VALUES('a','r','a','A','🐱',1,'A'),('a2','r2','a2','A','🐱',1,'A'),('g','r3','g','guest','🐱',1,NULL);
 INSERT INTO gold_rewards VALUES('p1','a',30,1,'2026-10-21'),('p2','a2',30,1,'2026-10-21'),('p3','a',10,0,'2026-10-22'),('p4','g',30,1,'2026-10-21');
 INSERT INTO service_gold_claims VALUES('s','A','attendance','2026-10-22',50,1792594800000),('s','A','event','event1',500,1792594800000);
 INSERT INTO skin_purchases VALUES('A','old-skin',100,1792594800000);`);
    const summary = () => db.prepare(GOLD_SUMMARY).get();
    assert.equal(summary().issued, 650);
    assert.equal(summary().spent, 100);
    assert.equal(summary().balance, 550);
    assert.equal(summary().guestPending, 60);
    assert.equal(summary().holders, 1);
    const rows = db.prepare(GOLD_WALLETS).all('', '', '', 0);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].balance, 550);
    assert.equal(rows[1].balance, 0);
    assert.equal(db.prepare(GOLD_WALLETS).all('同', '同', '同', 0).length, 0);
    assert.equal(db.prepare(GOLD_WALLETS).all('A', 'A', 'A', 0).length, 1);
    assert.equal(db.prepare(GOLD_HISTORY).all('B').length, 0);
    const sources = db.prepare(GOLD_SOURCES).all('2026-10-01');
    assert.equal(sources.find((s) => s.kind === 'first_win').amount, 30);
    const daily = db.prepare(GOLD_DAILY).all('2026-10-01');
    assert.equal(
      daily.reduce((s, r) => s + r.net, 0),
      550,
    );
    assert.equal(db.prepare(GOLD_PRODUCTS).all('2026-10-01')[0].amount, 100);
    const before = db.prepare('SELECT total_changes() n').get().n;
    summary();
    db.prepare(GOLD_HISTORY).all('A');
    assert.equal(db.prepare('SELECT total_changes() n').get().n, before);
    db.exec("UPDATE members SET account_id='A' WHERE id='g'");
    assert.equal(summary().guestPending, 0);
    assert.equal(summary().balance, 580, 'linked same-day first win does not double');
    const sql = readFileSync('lib/shop.ts', 'utf8').match(
      /export const BALANCE_SQL = `([\s\S]*?)`/,
    )[1];
    for (const w of db.prepare(GOLD_WALLETS).all('', '', '', 0))
      assert.equal(w.balance, db.prepare(sql).get(w.account_id, w.account_id).balance);
    db.exec("INSERT INTO gold_rewards VALUES('orphan','missing',30,1,'2026-10-22')");
    assert.equal(summary().orphanRewards, 1);
    assert.equal(summary().balance, 580);
  } finally {
    db.close();
  }
});

test('gold admin requires administrator before reading data and validates query limits', async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  const ts = (await import('typescript')).default;
  const dir = mkdtempSync(join(tmpdir(), 'gold-admin-test-'));
  try {
    const save = (name, body) => {
      const p = join(dir, name + '.mjs');
      writeFileSync(p, body);
      return pathToFileURL(p).href;
    };
    const maps = {
      '@/lib/account': save(
        'account',
        "export const isSiteAdmin=req=>req.headers.get('test-admin')==='yes';",
      ),
      '@/lib/store': save(
        'store',
        "export const database=()=>{throw Error('unexpected database read')};",
      ),
      '@/lib/skins': save('skins', 'export const ALL_SKINS=[];'),
      '@/lib/character-art': save('art', 'export const CHARACTER_ART={};'),
      '@/lib/card-skins': save('cards', 'export const CARD_SKINS=[];'),
      '@/lib/furniture': save('furniture', 'export const FURNITURE=[];'),
      '@/lib/gold-economy.mjs': pathToFileURL(join(process.cwd(), 'lib/gold-economy.mjs')).href,
    };
    let code = ts.transpileModule(readFileSync('app/api/admin/gold/route.ts', 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    for (const [key, url] of Object.entries(maps))
      code = code.replaceAll("'" + key + "'", JSON.stringify(url));
    const { GET } = await import(save('route', code));
    for (const path of ['', '?account=A']) {
      const r = await GET(new Request('https://test.local/api/admin/gold' + path));
      assert.equal(r.status, 403);
      assert.equal(r.headers.get('cache-control'), 'private, no-store');
    }
    for (const query of ['?days=999', '?offset=-1', '?offset=1.2', '?account=' + 'x'.repeat(201)])
      assert.equal(
        (
          await GET(
            new Request('https://test.local/api/admin/gold' + query, {
              headers: { 'test-admin': 'yes' },
            }),
          )
        ).status,
        400,
      );
    assert.equal(
      (
        await GET(
          new Request('https://test.local/api/admin/gold', { headers: { 'test-admin': 'yes' } }),
        )
      ).status,
      503,
      'database failure is explicit, not a zero balance',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
