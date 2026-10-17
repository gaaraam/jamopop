import test from 'node:test';
import assert from 'node:assert/strict';
import { activeChatBubbles } from '../lib/chat-bubbles.ts';
const m = (id, memberId, createdAt, deleted = 0) => ({
  id,
  memberId,
  createdAt,
  deleted,
  body: '메시지 ' + id,
});
test('eight-second expiry is not renewed by polling', () => {
  const messages = [m(1, 'a', 1000)];
  assert.equal(activeChatBubbles(messages, 8999).a.id, 1);
  assert.deepEqual(activeChatBubbles([...messages], 9000), {});
  assert.deepEqual(activeChatBubbles(messages, 20000), {});
});
test('each speaker has only their latest message, regardless of input order', () => {
  const result = activeChatBubbles([m(3, 'a', 3000), m(2, 'b', 2000), m(1, 'a', 1000)], 4000);
  assert.equal(result.a.id, 3);
  assert.equal(result.b.id, 2);
});
test('deleted latest message does not resurrect older text; old/future messages hidden', () => {
  assert.deepEqual(
    activeChatBubbles([m(1, 'a', 1000), m(2, 'a', 2000, 1), m(3, 'b', 5000)], 4000),
    {},
  );
});
