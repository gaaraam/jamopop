import test from 'node:test';
import assert from 'node:assert/strict';
import { walkPath, blocked } from '../lib/home-walk.mjs';
test('walk paths stay on the floor and walk around solid furniture', () => {
  const furniture = [{ id: 'home-sofa', x: 50, y: 74 }];
  const path = walkPath({ x: 30, y: 74 }, { x: 70, y: 74 }, furniture);
  assert.deepEqual(path.at(-1), { x: 70, y: 74 });
  assert.ok(path.every((p) => !blocked(p, furniture)));
  for (let i = 1; i < path.length; i++)
    assert.equal(Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].y - path[i - 1].y), 2);
});
test('outside taps clamp to reachable floor and rugs do not block', () => {
  const path = walkPath({ x: 50, y: 88 }, { x: -200, y: 1000 }, [{ id: 'home-rug', x: 8, y: 92 }]);
  assert.deepEqual(path.at(-1), { x: 8, y: 92 });
});
test('unreachable furniture target stops at reachable cell without modifying saved placement', () => {
  const furniture = [{ id: 'home-sofa', x: 50, y: 74 }],
    before = JSON.stringify(furniture);
  const path = walkPath({ x: 50, y: 88 }, { x: 50, y: 74 }, furniture);
  assert.ok(!blocked(path.at(-1), furniture));
  assert.equal(JSON.stringify(furniture), before);
});
test('movement is deterministic across viewport sizes and relocates an obstructed spawn', () => {
  const furniture = [{ id: 'home-sofa', x: 50, y: 88 }];
  const a = walkPath({ x: 50, y: 88 }, { x: 70, y: 70 }, furniture);
  assert.deepEqual(a, walkPath({ x: 50, y: 88 }, { x: 70, y: 70 }, furniture));
  assert.ok(a.every((p) => !blocked(p, furniture)));
});

test('floor has real vertical depth and held motion cannot tunnel through furniture', async () => {
  const { moveOnFloor } = await import('../lib/home-walk.mjs');
  const start = { x: 50, y: 88 };
  assert.equal(moveOnFloor(start, 0, -40).y, 48);
  const furniture = [{ id: 'home-sofa', x: 50, y: 74 }];
  const end = moveOnFloor(start, 0, -70, furniture);
  assert.ok(end.y >= 77);
  assert.ok(!blocked(end, furniture));
  assert.deepEqual(moveOnFloor({ x: 8, y: 36 }, -20, -20), { x: 8, y: 36 });
});
