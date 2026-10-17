import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { pathToFileURL } from 'node:url';
const game = pathToFileURL(process.cwd() + '/lib/game.ts').href;
const code = ts
  .transpileModule(fs.readFileSync('lib/input.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  })
  .outputText.replace("'./game'", JSON.stringify(game));
const { blocksEnter, keyboardJamo, appendKey, inputShape, previewKey } = await import(
  'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
);
test('physical keyboard and touch yield identical jamo', () => {
  let physical = '',
    touch = '';
  for (const k of 'tkrhk') physical = appendKey(physical, keyboardJamo(k), 5);
  for (const k of 'ㅅㅏㄱㅗㅏ') touch = appendKey(touch, k, 5);
  assert.equal(physical, touch);
  assert.equal(physical, 'ㅅㅏㄱㅗㅏ');
  assert(inputShape('사과', 5).valid);
  assert.equal(previewKey('round', '사과'), previewKey('round', touch));
});
test('rapid input caps width atomically without losing accepted letters', () => {
  for (const width of [5, 6, 7]) {
    let value = '';
    for (let n = 0; n < 100; n++) value = appendKey(value, 'ㄱ', width);
    assert.equal(value, 'ㄱ'.repeat(width));
  }
});
test('shifted consonants and compound vowels expand correctly at boundaries', () => {
  assert.equal(keyboardJamo('R', true), 'ㄲ');
  assert.equal(keyboardJamo('O', true), 'ㅒ');
  assert.equal(appendKey('ㄱㄱㄱㄱ', 'ㄲ', 5), 'ㄱㄱㄱㄱ');
  assert.equal(appendKey('ㄱㄱㄱ', 'ㄲ', 5), 'ㄱㄱㄱㄱㄱ');
  assert.equal(keyboardJamo('ArrowLeft'), null);
  assert.equal(keyboardJamo(' '), null);
  assert.equal(keyboardJamo('F5'), null);
});
test('invalid and excess input cannot become submittable; round isolates preview', () => {
  assert(!inputShape('abcde', 5).valid);
  assert(!inputShape('사과!', 5).valid);
  assert(!inputShape('사과사과', 5).valid);
  assert(!inputShape('', 5).valid);
  assert.notEqual(previewKey('old', '사과'), previewKey('new', '사과'));
});

test('IME commit Enter, Safari 229, repeat, and immediate post-composition are not submissions', () => {
  assert(blocksEnter({ isComposing: true }, false, 0, 1000));
  assert(blocksEnter({ keyCode: 229 }, false, 0, 1000));
  assert(blocksEnter({}, true, 0, 1000));
  assert(blocksEnter({ repeat: true }, false, 0, 1000));
  assert(blocksEnter({}, false, 950, 1000));
  assert(!blocksEnter({}, false, 900, 1000));
});
