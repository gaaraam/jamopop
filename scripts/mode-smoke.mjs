import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
const base = 'http://127.0.0.1:5260';
const results = [];
async function api(cookie, path, body) {
  const r = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json() };
}
for (const variant of ['normal', 'items'])
  for (const [width, word] of [
    [5, '사과'],
    [6, '바나나'],
    [7, '컴퓨터'],
  ]) {
    const cookie = 'bw_session=' + randomBytes(32).toString('hex');
    const created = await api(cookie, '/api/game', {
      action: 'create',
      roomName: '가상 모드 점검',
      name: 'QA',
      avatar: '🐱',
      variant,
      width,
    });
    assert.equal(created.status, 200);
    const room = created.data.roomId;
    const state = await api(cookie, '/api/game?room=' + room);
    assert.equal(state.status, 200);
    assert.equal(state.data.round.width, width);
    assert.equal(state.data.party.variant, variant);
    assert(!state.data.play.answer);
    const body = {
      action: 'guess',
      room,
      mode: 'daily',
      roundId: state.data.round.id,
      word,
      expected: 0,
      fast: true,
    };
    const first = await api(cookie, '/api/game', body);
    assert.equal(first.status, 200, JSON.stringify(first.data));
    assert.equal(first.data.play.guesses.length, 1);
    assert.equal(first.data.play.guesses[0].colors.length, width);
    assert.equal((await api(cookie, '/api/game', body)).status, 409);
    assert.equal((await api(cookie, '/api/game?room=' + room)).data.play.guesses.length, 1);
    results.push({ variant, width, submit: true, duplicateRejected: true, reloadPreserved: true });
  }
const cookie = 'bw_session=' + randomBytes(32).toString('hex');
const room = (
  await api(cookie, '/api/game', {
    action: 'create',
    roomName: '가상 스피드 점검',
    name: 'QA',
    avatar: '🐱',
  })
).data.roomId;
const speed = await api(cookie, '/api/speed', { action: 'start', room, theme: 'food' });
assert.equal(speed.status, 200, JSON.stringify(speed.data));
assert(!speed.data.play.answers);
await new Promise((r) => setTimeout(r, 3200));
const current = (await api(cookie, '/api/speed?room=' + room)).data;
const width = current.round.widths[current.play.current],
  body = {
    action: 'guess',
    room,
    roundId: current.round.id,
    revision: current.play.revision,
    word: { 4: '포도', 5: '사과', 6: '김밥' }[width],
  };
const first = await api(cookie, '/api/speed', body);
assert.equal(first.status, 200, JSON.stringify(first.data));
assert.equal((await api(cookie, '/api/speed', body)).status, 409);
results.push({ variant: 'speed', submit: true, duplicateRejected: true });
console.log(JSON.stringify({ environment: 'local-synthetic-http', results }));
