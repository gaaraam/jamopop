import test from 'node:test';
import assert from 'node:assert/strict';
import { motionEvents, flightPoint } from '../lib/motion-events.mjs';
const state = (extra = {}) => ({
  room: { id: 'room' },
  round: { id: 'round', width: 5 },
  me: { id: 'me' },
  play: { status: 'playing', guesses: [] },
  serverNow: 10000,
  party: { events: [] },
  ...extra,
});
test('effects never replay history, refresh, room switches or new rounds', () => {
  const won = state({ play: { status: 'won', guesses: [{}] } });
  assert.deepEqual(motionEvents(null, won), []);
  assert.deepEqual(motionEvents(won, won), []);
  assert.deepEqual(motionEvents(state(), { ...won, round: { id: 'next' } }), []);
  assert.deepEqual(motionEvents(state(), { ...won, room: { id: 'other' } }), []);
  assert.equal(motionEvents(state(), won)[0].kind, 'win');
  assert.deepEqual(motionEvents(state({ play: { status: 'won', guesses: [{}] } }), state()), []);
});
test('item events preserve participants, chronology and defensive outcomes', () => {
  const effects = [
    '시간 도둑 -15초',
    '방패 준비',
    '방패로 공격 차단',
    '반사! 공격자 -15초',
    '반사 · 방어막으로 차단',
    '반사 준비',
    '시간 충전 +15초',
  ];
  const kinds = ['attack', 'shield', 'blocked', 'reflect', 'reflect', 'reflect-ready', 'boost'];
  effects.forEach((effect, i) => {
    const e = { id: String(i), actorId: 'a', targetId: 'b', effect, createdAt: 9999 };
    const next = state({ party: { events: [e] } });
    const out = motionEvents(state(), next);
    assert.equal(out[0].kind, kinds[i]);
    assert.equal(out[0].targetId, 'b');
    assert.equal(out[0].negated, i === 2 || i === 4);
    assert.deepEqual(motionEvents(next, next), []);
    assert.deepEqual(
      motionEvents(state(), state({ party: { events: [{ ...e, createdAt: 1 }] } })),
      [],
    );
  });
  const rows = Array.from({ length: 8 }, (_, i) => ({
    id: String(i),
    actorId: 'a',
    targetId: 'b',
    effect: '시간 도둑 -15초',
    createdAt: 9999 - i,
  }));
  assert.deepEqual(
    motionEvents(state(), state({ party: { events: rows } })).map((e) => e.id),
    ['3', '2', '1', '0'],
  );
});
test('flight clamps endpoints and arcs above straight line', () => {
  const a = { x: 10, y: 50 },
    b = { x: 100, y: 50 };
  assert.deepEqual(flightPoint(a, b, -1), a);
  assert(Math.abs(flightPoint(a, b, 2).y - b.y) < 1e-8);
  assert.equal(flightPoint(a, b, 1).x, b.x);
  assert(flightPoint(a, b, 0.5).y < 50);
});
