import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import * as schema from '../db/schema.ts';

test('Drizzle models match every migrated application table and column', (t) => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  for (const file of readdirSync('drizzle')
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    db.exec(readFileSync('drizzle/' + file, 'utf8'));
  }

  const tables = db
    .prepare(
      `SELECT name FROM sqlite_schema WHERE type='table'
    AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' AND name <> 'd1_migrations'`,
    )
    .all();
  const models = Object.values(schema).map(getTableConfig);
  assert.deepEqual(models.map((m) => m.name).sort(), tables.map((t) => t.name).sort());
  const columns = db.prepare('SELECT name FROM pragma_table_info(?)');
  for (const model of models) {
    assert.deepEqual(
      model.columns.map((c) => c.name).sort(),
      columns
        .all(model.name)
        .map((c) => c.name)
        .sort(),
      model.name,
    );
  }
});
