import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const skipped = new Set([
  'node_modules',
  '.git',
  'dist',
  '.wrangler',
  '.next',
  '.vinext',
  'coverage',
]);
const failures = [];
function visit(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (skipped.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      visit(path);
      continue;
    }
    if (
      (/(^|\/)(\.env|\.dev.vars)(\.|$)/.test(path) && !path.endsWith('.example')) ||
      /\.(sqlite|db|pem|key)(-|$)/.test(path) ||
      /client_secret.*\.json$/.test(path)
    )
      failures.push(path + ': private file');
    if (/\.(png|jpg|webp|ico|woff2?)$/.test(path)) continue;
    const body = readFileSync(path, 'utf8');
    if (
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}|\bAIza[A-Za-z0-9_-]{35}\b/.test(
        body,
      )
    )
      failures.push(path + ': credential pattern');
  }
}
visit('.');
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Public-source checks passed (not a substitute for review).');
