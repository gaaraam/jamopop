import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const run = (args) => {
  const r = spawnSync(
    process.execPath,
    [
      'node_modules/wrangler/bin/wrangler.js',
      'd1',
      'execute',
      'DB',
      '--local',
      '--config',
      'dist/server/wrangler.json',
      '--persist-to',
      '.wrangler/state',
      ...args,
    ],
    { encoding: 'utf8', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } },
  );
  if (r.status !== 0) {
    console.error(r.stderr);
    process.exit(r.status ?? 1);
  }
  return r.stdout;
};
run(['--command', 'CREATE TABLE IF NOT EXISTS local_migrations(name TEXT PRIMARY KEY);']);
const result = JSON.parse(run(['--json', '--command', 'SELECT name FROM local_migrations']));
const applied = new Set(result.flatMap((x) => x.results || []).map((x) => x.name));
mkdirSync('.wrangler/migrations', { recursive: true });
for (const name of readdirSync('drizzle')
  .filter((x) => x.endsWith('.sql'))
  .sort()) {
  if (applied.has(name)) continue;
  const target = '.wrangler/migrations/' + name;
  writeFileSync(
    target,
    readFileSync('drizzle/' + name, 'utf8') +
      `\nINSERT INTO local_migrations(name) VALUES('${name.replaceAll("'", "''")}');\n`,
  );
  run(['--file', target]);
  console.log('Local migration:', name);
}
console.log('Local-only database ready. No production connection.');
