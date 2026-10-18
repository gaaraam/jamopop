import test from 'node:test';
import assert from 'node:assert/strict';
import { readActiveRoom, rememberActiveRoom, clearActiveRoom } from '../lib/active-room.mjs';
const storage = () => {
  const m = new Map();
  return {
    getItem: (k) => m.get(k),
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  };
};
test('navigation restores the same tab room and mode; explicit exit clears only navigation, not drafts', () => {
  const s = storage(),
    room = 'a'.repeat(24);
  s.setItem('jamopop:draft:test', '초안');
  rememberActiveRoom(s, room, 'practice', 100);
  assert.equal(readActiveRoom(s, 101).href, `/?r=${room}&m=practice`);
  rememberActiveRoom(s, room, 'speed', 102);
  assert.equal(readActiveRoom(s, 103).href, `/speed?room=${room}`);
  clearActiveRoom(s);
  assert.equal(readActiveRoom(s, 104), null);
  assert.equal(s.getItem('jamopop:draft:test'), '초안');
  assert.equal(readActiveRoom(storage(), 104), null, 'unrelated tab has no room return target');
});
test('expired, malformed, external and unavailable navigation context falls back safely', () => {
  const s = storage();
  rememberActiveRoom(s, 'a'.repeat(24), 'daily', 100);
  assert.equal(readActiveRoom(s, 86400100), null);
  for (const d of [
    '{',
    JSON.stringify({ room: 'https://evil.test', mode: 'daily', at: 100 }),
    JSON.stringify({ room: 'a'.repeat(24), mode: 'unknown', at: 100 }),
  ]) {
    s.setItem('jamopop:active-room', d);
    assert.equal(readActiveRoom(s, 101), null);
  }
  const broken = {
    getItem() {
      throw Error();
    },
    setItem() {
      throw Error();
    },
    removeItem() {
      throw Error();
    },
  };
  assert.equal(readActiveRoom(broken), null);
  assert.doesNotThrow(() => rememberActiveRoom(broken, 'a'.repeat(24), 'daily'));
  assert.doesNotThrow(() => clearActiveRoom(broken));
});
