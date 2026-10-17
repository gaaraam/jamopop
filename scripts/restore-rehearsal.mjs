// Synthetic data only. No remote DB/credentials; no production backup required.
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readdirSync, readFileSync, rmSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const dir = mkdtempSync(join(tmpdir(), 'jamopop-restore-'));
let original, restored;
try {
  const primary = join(dir, 'primary.sqlite'),
    backup = join(dir, 'backup.sqlite');
  original = new DatabaseSync(primary);
  original.exec('PRAGMA foreign_keys=ON');
  for (const file of readdirSync('drizzle')
    .filter((x) => x.endsWith('.sql'))
    .sort())
    original.exec(readFileSync('drizzle/' + file, 'utf8'));
  original.exec(
    "INSERT INTO profiles(id,name,avatar,created_at) VALUES('fixture','복구 검증','🐱',1);INSERT INTO rooms(id,name,host_id,created_at) VALUES('fixture-room','가상 방','fixture-member',1);INSERT INTO members(id,room_id,token_hash,name,avatar,last_seen) VALUES('fixture-member','fixture-room','synthetic','가상 참가자','🐱',1);INSERT INTO deleted_identifiers VALUES('account','previously-deleted');INSERT INTO deletion_audit VALUES('test-case','test-admin',1,'{}',1)",
  );
  original.prepare('VACUUM INTO ?').run(backup);
  const tables = original
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map((x) => x.name);
  const snapshot = (db) =>
    Object.fromEntries(
      tables.map((t) => [
        t,
        JSON.stringify(db.prepare('SELECT * FROM "' + t + '" ORDER BY rowid').all()),
      ]),
    );
  const before = snapshot(original);
  original.close();
  original = null;
  rmSync(primary);
  copyFileSync(backup, primary);
  restored = new DatabaseSync(primary);
  const after = snapshot(restored);
  if (JSON.stringify(before) !== JSON.stringify(after)) throw Error('Restored rows differ');
  let blocked = false;
  try {
    restored.exec(
      "INSERT INTO profiles(id,name,avatar,created_at) VALUES('previously-deleted','must fail','🐱',1)",
    );
  } catch (e) {
    blocked = e.message.includes('ACCOUNT_DELETED');
  }
  if (!blocked) throw Error('Deletion tombstone was not restored');
  console.log(
    JSON.stringify({
      environment: 'synthetic-local',
      tables: tables.length,
      rowEquality: true,
      integrity: restored.prepare('PRAGMA integrity_check').get().integrity_check,
      tombstoneGuard: true,
    }),
  );
} finally {
  original?.close();
  restored?.close();
  rmSync(dir, { recursive: true, force: true });
}
