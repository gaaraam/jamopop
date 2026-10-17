import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
test('first play teaches duplicate counts, resumes safely and never trusts stored colors', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'first-play-'));
  try {
    const compile = (path, name) => {
      let source = ts.transpileModule(readFileSync(path, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText;
      source = source.replaceAll(
        "'./game'",
        JSON.stringify(pathToFileURL(join(dir, 'game.mjs')).href),
      );
      writeFileSync(join(dir, name), source);
      return pathToFileURL(join(dir, name)).href;
    };
    compile('lib/game.ts', 'game.mjs');
    const p = await import(compile('lib/first-play.ts', 'first.mjs'));
    const first = p.firstGuess(0, '바람');
    assert.deepEqual(first.colors, ['yellow', 'gray', 'gray', 'green', 'gray']);
    assert.equal(p.firstGuess(0, '수박'), null);
    assert.equal(p.firstGuess(3, '수박'), null);
    assert.deepEqual(p.firstGuess(0, 'ㅂㅏㄹㅏㅁ'), first);
    const storage = new Map(),
      adapter = { getItem: (k) => storage.get(k), setItem: (k, v) => storage.set(k, v) };
    const guesses = p.FIRST_WORDS.map((word, i) => p.firstGuess(i, word));
    p.saveFirstPlay(adapter, guesses);
    assert.deepEqual(p.readFirstPlay(adapter), guesses);
    assert.ok(guesses[2].colors.every((c) => c === 'green'));
    for (const bad of ['-1', '4', 'null', '{}', '"2"', 'broken']) {
      storage.set('jamopop-first-play-v1', bad);
      assert.deepEqual(p.readFirstPlay(adapter), []);
    }
    assert.doesNotThrow(() =>
      p.saveFirstPlay(
        {
          setItem() {
            throw Error('storage blocked');
          },
        },
        guesses,
      ),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
