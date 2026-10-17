// Real HTTP tests: loopback or a fixed token-protected synthetic staging only.
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const base = new URL(process.argv[2] || 'http://127.0.0.1:5260');
const local =
  ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname) && base.protocol === 'http:';
const staging =
  base.origin === 'https://jamopop-qa-p0.jamopop.workers.dev' && process.env.JAMOPOP_QA_TOKEN;
if (!local && !staging)
  throw Error('Only isolated local or explicitly protected jamopop-qa-p0 staging is allowed');
const levels = (process.argv[3] || '10,50,100').split(',').map(Number);
if (levels.some((n) => !Number.isInteger(n) || n < 1 || n > 100))
  throw Error('Concurrency must be 1..100');
const results = [];
async function request(cookie, path, body) {
  const start = performance.now();
  const r = await fetch(new URL(path, base), {
    method: body ? 'POST' : 'GET',
    headers: {
      Cookie: cookie,
      ...(staging ? { Authorization: `Bearer ${process.env.JAMOPOP_QA_TOKEN}` } : {}),
      Origin: base.origin,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const data = await r.json();
  return { status: r.status, data, ms: performance.now() - start };
}
if (staging) {
  const check = await request('', '/healthz');
  if (check.status !== 200 || check.data.qa !== true) throw Error('Not a protected QA service');
}
for (const concurrency of levels) {
  const users = Array.from({ length: concurrency }, (_, i) => ({
    cookie: 'bw_session=' + randomBytes(32).toString('hex'),
    name: 'QA' + i,
  }));
  for (let start = 0; start < users.length; start += 10) {
    const group = users.slice(start, start + 10);
    const created = await request(group[0].cookie, '/api/game', {
      action: 'create',
      name: group[0].name,
      roomName: 'local-load-' + concurrency + '-' + start,
      avatar: '🐱',
      width: 5,
    });
    if (created.status !== 200) throw Error('Create failed: ' + created.status);
    for (const u of group) u.room = created.data.roomId;
    await Promise.all(
      group.slice(1).map(async (u) => {
        const r = await request(u.cookie, '/api/game', {
          action: 'join',
          name: u.name,
          avatar: '🐱',
          room: u.room,
          lobby: true,
        });
        if (r.status !== 200)
          throw Error('Join failed: ' + r.status + ' ' + JSON.stringify(r.data));
      }),
    );
  }
  const snapshots = await Promise.all(
    users.map((u) => request(u.cookie, '/api/game?room=' + u.room)),
  );
  if (snapshots.some((x) => x.status !== 200 || !x.data.round?.id || x.data.play?.answer))
    throw Error('Snapshot failed or leaked answer');
  const submissions = await Promise.all(
    users.map((u, i) =>
      request(u.cookie, '/api/game', {
        action: 'guess',
        room: u.room,
        mode: 'daily',
        roundId: snapshots[i].data.round.id,
        word: '사과',
        expected: 0,
        fast: true,
      }),
    ),
  );
  if (submissions.some((x) => x.status !== 200))
    throw Error('Submit failed: ' + JSON.stringify(submissions.map((x) => x.status)));
  const duplicates = await Promise.all(
    users.map((u, i) =>
      request(u.cookie, '/api/game', {
        action: 'guess',
        room: u.room,
        mode: 'daily',
        roundId: snapshots[i].data.round.id,
        word: '사과',
        expected: 0,
        fast: true,
      }),
    ),
  );
  if (duplicates.some((x) => x.status !== 409))
    throw Error(
      'Duplicate status counts: ' +
        JSON.stringify(
          duplicates.reduce((out, x) => ((out[x.status] = (out[x.status] || 0) + 1), out), {}),
        ),
    );
  const restored = await Promise.all(
    users.map((u) => request(u.cookie, '/api/game?room=' + u.room)),
  );
  if (restored.some((x) => x.status !== 200 || x.data.play.guesses.length !== 1))
    throw Error('Reload did not preserve exactly one submission');
  const summarize = (rows) => {
    const times = rows.map((x) => x.ms).sort((a, b) => a - b);
    return {
      requests: rows.length,
      p50Ms: Math.round(times[Math.ceil(times.length * 0.5) - 1]),
      p95Ms: Math.round(times[Math.ceil(times.length * 0.95) - 1]),
    };
  };
  results.push({
    concurrency,
    rooms: Math.ceil(concurrency / 10),
    snapshot: summarize(snapshots),
    submission: summarize(submissions),
    duplicate: summarize(duplicates),
    restore: summarize(restored),
    verified: 'one persisted guess per participant',
  });
  console.log(JSON.stringify(results.at(-1)));
  if (process.argv[4])
    writeFileSync(
      process.argv[4],
      JSON.stringify(
        { environment: staging ? 'remote-protected-synthetic' : 'local-only', results },
        null,
        2,
      ) + '\n',
    );
}
if (process.argv[4])
  writeFileSync(
    process.argv[4],
    JSON.stringify(
      { environment: staging ? 'remote-protected-synthetic' : 'local-only', results },
      null,
      2,
    ) + '\n',
  );
