import test from 'node:test';
import assert from 'node:assert/strict';
import { searchPolicy } from '../lib/search-policy.mjs';
import { shareResult } from '../lib/share-result.mjs';
test('only clean public URLs are indexable; private and error URLs are not', () => {
  for (const p of ['/', '/daily', '/how-to-play'])
    assert.equal(searchPolicy('https://play.jamopop.workers.dev' + p), 'index, follow');
  for (const p of [
    '/?r=secret',
    '/?lobby=1',
    '/daily?ticket=secret',
    '/admin',
    '/home',
    '/shop',
    '/solo',
    '/transfer',
    '/api/game',
    '/auth/google/start',
  ])
    assert.equal(searchPolicy('https://play.jamopop.workers.dev' + p), 'noindex, follow');
  assert.equal(searchPolicy('https://play.jamopop.workers.dev/', 404), 'noindex, follow');
});
test('native share forwards only supplied safe text; cancellation does not copy', async () => {
  let payload;
  assert.equal(
    await shareResult('grid', {
      share: async (p) => {
        payload = p;
      },
    }),
    'shared',
  );
  assert.deepEqual(payload, { title: '자음모음팝 · 오늘의 단어', text: 'grid' });
  let copied = false;
  assert.equal(
    await shareResult('grid', {
      share: async () => {
        throw { name: 'AbortError' };
      },
      clipboard: {
        writeText: async () => {
          copied = true;
        },
      },
    }),
    'cancelled',
  );
  assert.equal(copied, false);
});
test('unsupported/failed share falls back to clipboard then manual copy', async () => {
  assert.equal(await shareResult('grid', { clipboard: { writeText: async () => {} } }), 'copied');
  assert.equal(
    await shareResult('grid', {
      share: async () => {
        throw Error();
      },
      clipboard: {
        writeText: async () => {
          throw Error();
        },
      },
    }),
    'manual',
  );
  assert.equal(
    await shareResult(
      'grid',
      {
        share: async () => {
          throw Error('must not call');
        },
        clipboard: { writeText: async () => {} },
      },
      true,
    ),
    'copied',
  );
});
