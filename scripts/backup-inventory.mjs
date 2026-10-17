// Read-only inventory. Never prints SQL contents and never removes a backup.
import { readdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const root = process.argv[2];
if (!root) throw Error('Usage: node scripts/backup-inventory.mjs /private/backup/root');
const base = resolve(root),
  cutoff = Date.now() - 30 * 86400000;
let total = 0,
  expired = 0,
  bytes = 0;
async function visit(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isSymbolicLink()) continue;
    const path = join(dir, e.name);
    if (e.isDirectory()) await visit(path);
    else if (e.isFile() && /\.(sql|sqlite|db|gz)$/.test(e.name)) {
      const s = await stat(path);
      total++;
      bytes += s.size;
      if (s.mtimeMs < cutoff) expired++;
    }
  }
}
await visit(base);
console.log(
  JSON.stringify({ mode: 'preview-only', retentionDays: 30, files: total, expired, bytes }),
);
