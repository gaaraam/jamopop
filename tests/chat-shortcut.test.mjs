import test from 'node:test';
import assert from 'node:assert/strict';
import { isChatToggleKey } from '../lib/chat-shortcut.mjs';
test('backquote toggles across keyboard layouts but never during IME, repeat, or modified input', () => {
  assert.equal(isChatToggleKey({ code: 'Backquote', key: '₩' }), true);
  assert.equal(isChatToggleKey({ key: '`' }), true);
  for (const prop of ['shiftKey', 'ctrlKey', 'metaKey', 'altKey', 'repeat', 'isComposing'])
    assert.equal(isChatToggleKey({ code: 'Backquote', [prop]: true }), false, prop);
  assert.equal(isChatToggleKey({ code: 'Backquote', keyCode: 229 }), false);
  assert.equal(isChatToggleKey({ code: 'KeyA', key: 'a' }), false);
});
