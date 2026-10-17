// Protected QA only. Generated session/seed files are private and must never be imported into production.
import { readFileSync, writeFileSync } from 'node:fs';
const base = 'https://jamopop-qa-p0.jamopop.workers.dev',
  token = process.env.JAMOPOP_QA_TOKEN;
if (!token) throw Error('private QA key required');
const [mode, fixtures, contextFile, output] = process.argv.slice(2);
if (!['prepare', 'before', 'after'].includes(mode) || !fixtures || !contextFile || !output)
  throw Error('prepare fixtures context seed.sql | before/after fixtures context report.json');
const users = JSON.parse(readFileSync(fixtures));
if (users.length < 2 || users.length > 50) throw Error('2..50 synthetic users');
let ctx = mode === 'prepare' ? {} : JSON.parse(readFileSync(contextFile));
const samples = [];
async function call(user, path, body, label) {
  const start = performance.now();
  const r = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: 'Bearer ' + token,
      Cookie: user.cookie,
      Origin: base,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const data = await r.json();
  samples.push({ label, ms: Math.round(performance.now() - start), status: r.status });
  if (!r.ok) throw Error(label + ':' + r.status);
  return data;
}
const health = await call({ cookie: '' }, '/healthz', null, 'health');
if (health.qa !== true) throw Error('Not protected QA');
if (mode === 'prepare') {
  const c = await call(
    users[0],
    '/api/game',
    {
      action: 'create',
      name: users[0].name,
      roomName: '일상 속도 합성 시험',
      avatar: '🐱',
      width: 5,
    },
    'create',
  );
  ctx.room = c.roomId;
  const state = await call(users[0], '/api/game?room=' + ctx.room, null, 'initial');
  ctx.round = state.round.id;
  ctx.host = state.me.id;
  const joined = await call(
    users[1],
    '/api/game',
    { action: 'join', room: ctx.room, lobby: true, name: users[1].name, avatar: '🐱' },
    'join',
  );
  const state2 = await call(users[1], '/api/game?room=' + ctx.room, null, 'initial');
  ctx.player = state2.me.id;
  writeFileSync(contextFile, JSON.stringify(ctx), { mode: 0o600 });
  const strokes = JSON.stringify([
    {
      color: '#273449',
      width: 6,
      points: [
        [0.1, 0.1],
        [0.2, 0.2],
      ],
    },
  ]);
  writeFileSync(
    output,
    `INSERT INTO plays(id,round_id,member_id,guesses,status,finished_at,updated_at) VALUES('hint-${ctx.round}','${ctx.round}','${ctx.host}','[]','won',${Date.now()},${Date.now()}) ON CONFLICT(round_id,member_id) DO UPDATE SET status='won'; INSERT INTO drawing_hints(round_id,member_id,strokes,updated_at) VALUES('${ctx.round}','${ctx.host}','${strokes}',${Date.now()}); UPDATE rounds SET ends_at=${Date.now() + 1800000} WHERE id='${ctx.round}';`,
    { mode: 0o600 },
  );
  console.log('QA fixtures prepared');
  process.exit(0);
}
for (let i = 0; i < 8; i++) {
  await call(users[1], '/api/game?lobby=1', null, 'lobby');
  const start = performance.now();
  const d = await call(
    users[1],
    '/api/game',
    {
      action: 'join',
      room: ctx.room,
      lobby: true,
      name: users[1].name,
      avatar: '🐱',
      includeState: mode === 'after',
    },
    'join',
  );
  let state = d;
  if (!d.room) state = await call(users[1], '/api/game?room=' + ctx.room, null, 'join-state');
  if (state.me.id !== ctx.player || state.round.id !== ctx.round || state.play.answer)
    throw Error('join isolation');
  samples.push({
    label: 'entry-to-playable',
    ms: Math.round(performance.now() - start),
    status: 200,
  });
  await call(
    users[1],
    '/api/game',
    { action: 'check_word', room: ctx.room, roundId: ctx.round, mode: 'daily', word: '사과' },
    'server-word-check',
  );
  const h = await call(
    users[1],
    '/api/party',
    { action: 'view_hints', room: ctx.room, roundId: ctx.round },
    'hint-open',
  );
  if (h.hints.length !== 1) throw Error('hint disclosure');
}
const metrics = {};
for (const label of new Set(samples.map((s) => s.label))) {
  const a = samples.filter((s) => s.label === label),
    v = a.map((s) => s.ms).sort((a, b) => a - b);
  metrics[label] = {
    requests: a.length,
    p50Ms: v[Math.ceil(v.length * 0.5) - 1],
    p95Ms: v[Math.ceil(v.length * 0.95) - 1],
    statuses: a.reduce((m, s) => ((m[s.status] = (m[s.status] || 0) + 1), m), {}),
  };
}
writeFileSync(
  output,
  JSON.stringify(
    {
      environment: 'protected-QA-sequential-one-player',
      samples: 8,
      entryIncludesState: mode === 'after',
      metrics,
    },
    null,
    2,
  ) + '\n',
  { mode: 0o600 },
);
console.log(JSON.stringify(metrics));
