import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
const mod = { exports: {} };
runInNewContext(
  ts.transpileModule(readFileSync('components/ui/async-status.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText,
  { module: mod, exports: mod.exports, require },
);
const { AsyncStatus } = mod.exports;
const render = (props) =>
  renderToStaticMarkup(createElement(AsyncStatus, { label: '준비 중', onRetry() {}, ...props }));
test('loading is announced without presenting a failure action', () => {
  const html = render({});
  assert.match(html, /role="status"/);
  assert.match(html, /aria-busy="true"/);
  assert.doesNotMatch(html, /<button/);
});
test('a failed request exposes an alert and a keyboard-operable retry', () => {
  const html = render({ error: '연결을 확인해 주세요' });
  assert.match(html, /role="alert"/);
  assert.match(html, /연결을 확인해 주세요/);
  assert.match(html, /<button/);
  assert.doesNotMatch(html, /준비 중/);
});
test('retrying hides stale error text and prevents another retry action', () => {
  const html = render({ error: '이전 오류', retrying: true });
  assert.match(html, /role="status"/);
  assert.match(html, /준비 중/);
  assert.doesNotMatch(html, /이전 오류|<button/);
});
