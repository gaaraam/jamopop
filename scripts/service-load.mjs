// Synthetic sessions only; the production origin is never accepted.
import { randomBytes, createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
const [mode, file, output, arg] = process.argv.slice(2);
if (mode === 'prepare') {
  const count = Number(arg || 30);
  if (!Number.isInteger(count) || count < 10 || count > 50) throw Error('10..50 users');
  const run = randomBytes(6).toString('hex'),
    now = Date.now(),
    sql = [],
    users = [];
  for (let i = 0; i < count; i++) {
    const token = randomBytes(32).toString('hex'),
      memberToken = randomBytes(32).toString('hex'),
      owner = `perf17-${run}-${i}`;
    if (i % 2 === 0) {
      sql.push(
        `INSERT INTO google_accounts VALUES('${owner}','${owner}','qa${i}@invalid.example','QA${i}',${now},${now});INSERT INTO google_sessions VALUES('${createHash('sha256').update(token).digest('hex')}','${owner}',${now + 3600000});INSERT INTO profiles(id,name,avatar,created_at) VALUES('${owner}','QA${i}','🐱',${now});`,
      );
    }
    users.push({
      name: 'QA' + i,
      cookie: `bw_session=${memberToken}${i % 2 === 0 ? `; __Host-jamopop_session=${token}` : ''}`,
      linked: i % 2 === 0,
    });
  }
  writeFileSync(file, JSON.stringify(users), { mode: 0o600 });
  writeFileSync(output, sql.join('\n'), { mode: 0o600 });
  console.log(JSON.stringify({ syntheticUsers: count }));
  process.exit(0);
}
if (mode !== 'run')
  throw Error('prepare fixtures.json seed.sql 30 | run fixtures.json report.json 120');
const base = 'https://jamopop-qa-p0.jamopop.workers.dev',
  token = process.env.JAMOPOP_QA_TOKEN;
if (!token) throw Error('QA token required');
const seconds = Number(arg || 120);
if (seconds < 30 || seconds > 600) throw Error('30..600 seconds');
const users = JSON.parse(readFileSync(file, 'utf8'));
if (users.length > 50) throw Error('User cap');
const samples = [],
  failures = [];
async function call(user, path, body, label = path.split('?')[0]) {
  const start = performance.now();
  let status = 0,
    data;
  try {
    const r = await fetch(base + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: 'Bearer ' + token,
        Cookie: user?.cookie || '',
        Origin: base,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    status = r.status;
    data = await r.json();
  } catch {}
  samples.push({ endpoint: label, status, ms: Math.round(performance.now() - start) });
  return { status, data };
}
const health = await call(null, '/healthz');
if (health.data?.qa !== true) throw Error('Not protected QA');
for (let at = 0; at < users.length; at += 10) {
  const group = users.slice(at, at + 10),
    created = await call(
      group[0],
      '/api/game',
      { action: 'create', name: group[0].name, roomName: '합성 지속 시험', avatar: '🐱', width: 5 },
      'setup',
    );
  if (created.status !== 200) throw Error('Synthetic room create ' + created.status);
  for (const u of group) u.room = created.data.roomId;
  const joins = await Promise.all(
    group
      .slice(1)
      .map((u) =>
        call(
          u,
          '/api/game',
          { action: 'join', room: u.room, lobby: true, name: u.name, avatar: '🐱' },
          'setup',
        ),
      ),
  );
  if (joins.some((x) => x.status !== 200)) throw Error('Synthetic join failed');
}
for (const u of users) {
  const r = await call(u, '/api/game?room=' + u.room, null, 'initial');
  if (r.status !== 200 || r.data.play?.answer) throw Error('Initial snapshot');
  u.round = r.data.round.id;
}
await Promise.all(
  users.map(async (u) => {
    const r = await call(
      u,
      '/api/game',
      {
        action: 'guess',
        room: u.room,
        roundId: u.round,
        mode: 'daily',
        word: '사과',
        expected: 0,
        fast: true,
      },
      'submit',
    );
    if (r.status !== 200) failures.push({ endpoint: 'submit', status: r.status });
  }),
);
const start = performance.now();
let cycles = 0;
while (performance.now() - start < seconds * 1000) {
  const tick = performance.now();
  await Promise.all(
    users.map(async (u, i) => {
      const r = await call(u, '/api/game?room=' + u.room, null, 'snapshot');
      if (r.status !== 200 || r.data.play?.guesses?.length !== 1)
        failures.push({ endpoint: 'snapshot_restore', status: r.status });
      if (cycles % 5 === 0) {
        const endpoint =
          i % 3 === 0
            ? '/api/game?lobby=1'
            : i % 3 === 1
              ? '/api/solo'
              : u.linked
                ? '/api/shop'
                : '/api/lobby-chat';
        const x = await call(u, endpoint, null, endpoint.includes('lobby=') ? 'lobby' : endpoint);
        if (x.status !== 200) failures.push({ endpoint: endpoint.split('?')[0], status: x.status });
        if (u.linked) {
          const a = await call(u, '/api/account', null, 'account');
          if (a.status !== 200) failures.push({ endpoint: 'account', status: a.status });
        }
      }
      if (cycles % 10 === 0) {
        const duplicate = await call(
          u,
          '/api/game',
          {
            action: 'guess',
            room: u.room,
            roundId: u.round,
            mode: 'daily',
            word: '사과',
            expected: 0,
            fast: true,
          },
          'duplicate',
        );
        if (duplicate.status !== 409)
          failures.push({ endpoint: 'duplicate', status: duplicate.status });
      }
    }),
  );
  cycles++;
  await new Promise((r) => setTimeout(r, Math.max(0, 3000 - (performance.now() - tick))));
}
const groups = Object.groupBy(samples, (x) => x.endpoint);
const result = {
  environment: 'remote-protected-synthetic',
  users: users.length,
  linked: users.filter((u) => u.linked).length,
  durationSeconds: Math.round((performance.now() - start) / 1000),
  cycles,
  failures,
  metrics: Object.fromEntries(
    Object.entries(groups).map(([key, rows]) => {
      const times = rows.map((x) => x.ms).sort((a, b) => a - b);
      return [
        key,
        {
          requests: rows.length,
          p50Ms: times[Math.ceil(times.length * 0.5) - 1],
          p95Ms: times[Math.ceil(times.length * 0.95) - 1],
          statuses: rows.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {}),
        },
      ];
    }),
  ),
};
writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
if (failures.length) process.exitCode = 1;
