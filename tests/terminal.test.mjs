import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTerminalCommand } from '../lib/terminal.ts';
test('only known commands route to actions', () => {
  for (const name of ['help', 'room', 'rank', 'next', 'practice', 'daily', 'view', 'clear'])
    assert.deepEqual(parseTerminalCommand('/' + name), { kind: 'command', name });
});
test('unknown or shell-looking commands never execute', () => {
  for (const s of ['/next now', '/reset', '/rm -rf', '/next; /clear', '/', '/help && next'])
    assert.equal(parseTerminalCommand(s).name, 'unknown');
});
test('words and jamo are submitted unchanged', () => {
  assert.deepEqual(parseTerminalCommand(' 사과 '), { kind: 'guess', word: '사과' });
  assert.deepEqual(parseTerminalCommand('ㅅㅏㄱㅗㅏ'), { kind: 'guess', word: 'ㅅㅏㄱㅗㅏ' });
  assert.equal(parseTerminalCommand(' /HELP ').name, 'help');
});
