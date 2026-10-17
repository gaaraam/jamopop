import test from 'node:test';
import assert from 'node:assert/strict';
import { AVATARS, canEquip, equippedAtLevel } from '../lib/cosmetics.ts';
test('reward gates enforce each frame threshold and reject untrusted identifiers', () => {
  assert.equal(canEquip('default', 'halo', 2), false);
  assert.equal(canEquip('default', 'halo', 3), true);
  assert.equal(canEquip('violet', 'star', 4), false);
  assert.equal(canEquip('violet', 'star', 5), true);
  assert.equal(canEquip('gold', 'crown', 9), false);
  assert.equal(canEquip('gold', 'crown', 10), true);
  assert.equal(canEquip('bad', 'none', 100), false);
  assert.deepEqual(equippedAtLevel('gold', 'crown', 1), {
    nameColor: 'default',
    avatarFrame: 'none',
  });
  assert.equal(new Set(AVATARS).size, 24);
});

import { avatarLevel, unlockedAvatars } from '../lib/cosmetics.ts';
test('avatar tiers and retained choices', () => {
  assert.deepEqual(
    [1, 2, 4, 6, 8].map((l) => unlockedAvatars(l).length),
    [8, 12, 16, 20, 24],
  );
  assert.equal(avatarLevel('🦄'), 8);
  assert.equal(unlockedAvatars(1, ['🦄', 'bad']).length, 9);
});
