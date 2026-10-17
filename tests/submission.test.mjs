import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeSubmission } from '../lib/submission.mjs';
const current = {
  room: { id: 'r' },
  round: { id: 'q' },
  me: { id: 'm' },
  play: { status: 'playing', guesses: [] },
  players: [
    { id: 'm', attempts: 0 },
    { id: 'other', attempts: 2 },
  ],
  chat: { messages: [] },
};
const ack = {
  submitted: true,
  roomId: 'r',
  roundId: 'q',
  memberId: 'm',
  serverNow: 100,
  finishedAt: null,
  play: { status: 'playing', guesses: [{ colors: ['green'] }] },
};
test('confirmed response advances own board without clearing chat or other participants', () => {
  const next = mergeSubmission(current, ack);
  assert.equal(next.play.guesses.length, 1);
  assert.equal(next.players[0].attempts, 1);
  assert.equal(next.players[1].attempts, current.players[1].attempts);
  assert.equal(next.chat, current.chat);
  assert.equal(current.play.guesses.length, 0);
});
test('old submissions cannot replace another room, round, account or later guesses', () => {
  for (const field of ['roomId', 'roundId', 'memberId'])
    assert.equal(mergeSubmission(current, { ...ack, [field]: 'other' }), null);
  assert.equal(
    mergeSubmission({ ...current, play: { status: 'playing', guesses: [{}, {}] } }, ack),
    null,
  );
  assert.equal(mergeSubmission({ ...current, play: { status: 'won', guesses: [{}] } }, ack), null);
  assert.equal(mergeSubmission(null, ack), null);
});

test('confirmed win gets a rank immediately and active-count updates without a second fetch', () => {
  const c = {
    ...current,
    round: { id: 'q', mode: 'daily' },
    room: { id: 'r', isHost: true },
    players: [
      { id: 'm', status: 'playing', attempts: 0, finishedAt: null },
      { id: 'other', status: 'won', attempts: 2, finishedAt: 10 },
    ],
  };
  const won = mergeSubmission(c, {
    ...ack,
    finishedAt: 100,
    play: { status: 'won', guesses: [{ colors: ['green'] }] },
  });
  assert.equal(won.players[0].rank, 1);
  assert.equal(won.room.canReset, true);
  assert.equal(won.room.activeCount, 0);
  const playing = mergeSubmission(c, ack);
  assert.equal(playing.room.canReset, false);
  assert.equal(playing.room.activeCount, 1);
});
