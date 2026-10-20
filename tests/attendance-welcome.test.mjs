import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attendanceEntry,
  alreadyWelcomed,
  rememberWelcome,
  WELCOME_SEEN_KEY,
} from '../lib/attendance-welcome.mjs';
test('welcome only opens outside gameplay, admin and account flows', () => {
  for (const p of ['/', '/news', '/solo', '/home', '/shop']) assert.equal(attendanceEntry(p), true);
  for (const p of ['/speed', '/solo/word', '/solo/toktok', '/admin', '/transfer', '/privacy'])
    assert.equal(attendanceEntry(p), false);
  for (const q of ['r=room&lobby=1', 'room=room', 'invite=invite', 'start=1'])
    assert.equal(attendanceEntry('/', q), false);
});
test('daily dismissal separates recipients, expires old entries and tolerates unavailable storage', () => {
  const map = new Map(),
    storage = { getItem: (k) => map.get(k) || null, setItem: (k, v) => map.set(k, v) };
  rememberWelcome(storage, 'first', '2026-10-20');
  assert.equal(alreadyWelcomed(storage, 'first', '2026-10-20'), true);
  assert.equal(alreadyWelcomed(storage, 'second', '2026-10-20'), false);
  rememberWelcome(storage, 'second', '2026-10-20');
  assert.equal(alreadyWelcomed(storage, 'first', '2026-10-20'), true);
  rememberWelcome(storage, 'first', '2026-10-21');
  assert.deepEqual(JSON.parse(map.get(WELCOME_SEEN_KEY)), { first: '2026-10-21' });
  const broken = {
    getItem() {
      throw Error('blocked');
    },
    setItem() {
      throw Error('blocked');
    },
  };
  assert.equal(alreadyWelcomed(broken, 'first', '2026-10-21'), false);
  assert.doesNotThrow(() => rememberWelcome(broken, 'first', '2026-10-21'));
});
