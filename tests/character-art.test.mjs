import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AVATARS, avatarLevel, unlockedAvatars } from '../lib/cosmetics.ts';
import { CHARACTER_ART } from '../lib/character-art.ts';
test('all 24 existing avatar IDs map to valid shipped artwork without changing unlock tiers', () => {
  assert.deepEqual(Object.keys(CHARACTER_ART), AVATARS);
  const boxes = new Set();
  for (const emoji of AVATARS) {
    const art = CHARACTER_ART[emoji],
      box = art.box.split(' ').map(Number);
    assert.ok(
      fs.existsSync(new URL('../public/characters/kongal-0' + art.sheet + '.png', import.meta.url)),
    );
    assert.equal(box.length, 4);
    const [x, y, w, h] = box;
    assert.ok(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= 1254 && y + h <= 1254);
    boxes.add(art.sheet + ':' + art.box);
    assert.ok(unlockedAvatars(avatarLevel(emoji)).includes(emoji));
  }
  assert.equal(boxes.size, 24);
  assert.deepEqual(
    [1, 2, 4, 6, 8].map((l) => unlockedAvatars(l).length),
    [8, 12, 16, 20, 24],
  );
});
