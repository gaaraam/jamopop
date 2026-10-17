import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuessPreview } from '../lib/guess-preview.mjs';
test('public dictionary preview deduplicates downloads and never negatively rejects an unknown word', async () => {
  let calls = 0;
  const known = createGuessPreview(
    async () => {
      calls++;
      return ['사과', '바람'];
    },
    (s) => s,
  );
  assert.deepEqual(await Promise.all([known('사과'), known('바람'), known('추가된 단어')]), [
    true,
    true,
    false,
  ]);
  assert.equal(await known('사과'), true);
  assert.equal(calls, 1);
});
test('a failed dictionary load retries and remains advisory rather than blocking submission', async () => {
  let attempts = 0;
  const known = createGuessPreview(
    async () => {
      if (++attempts === 1) throw Error('offline');
      return ['사과'];
    },
    (s) => s,
  );
  assert.equal(await known('사과'), false);
  assert.equal(await known('사과'), true);
  assert.equal(attempts, 2);
});

test('warm dictionary gives an immediate positive lookup, but unknown entries still need the server', async () => {
  let calls = 0;
  const known = createGuessPreview(
    async () => {
      calls++;
      return ['사과'];
    },
    (s) => s,
  );
  assert.equal(known.peek('사과'), false);
  await known.warm();
  assert.equal(known.peek('사과'), true);
  assert.equal(known.peek('추가 단어'), false);
  assert.equal(calls, 1);
});
