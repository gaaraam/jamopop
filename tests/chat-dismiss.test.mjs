import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const url = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
async function harness() {
  const states = [],
    refs = [];
  let stateIndex = 0,
    refIndex = 0;
  const react = {
    useState(initial) {
      const i = stateIndex++;
      if (!(i in states)) states[i] = initial;
      return [
        states[i],
        (v) => {
          states[i] = typeof v === 'function' ? v(states[i]) : v;
        },
      ];
    },
    useRef(initial) {
      return (refs[refIndex++] ||= { current: initial });
    },
    useCallback: (fn) => fn,
    useEffect() {},
  };
  globalThis.__chatReact = react;
  let code = ts.transpileModule(readFileSync('components/game/chat.tsx', 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const stub = url(
    `export const useModalOpen=()=>false, SafetyActions='safety', CharacterAvatar='avatar', MessageCircle='icon', ChevronDown='icon', Send='icon', Trash2='icon', Smile='icon', chatViewport=()=>({}), isChatToggleKey=()=>false;`,
  );
  code = code
    .replace(
      /from ['"]react\/jsx-runtime['"]/g,
      `from ${JSON.stringify(url('export const jsx=(type,props)=>({type,props}),jsxs=jsx;'))}`,
    )
    .replace(
      /from ['"]react['"]/g,
      `from ${JSON.stringify(url('export const {useState,useRef,useCallback,useEffect}=globalThis.__chatReact; //' + Math.random()))}`,
    )
    .replace(
      /from ['"](?:\.\/overlay-state|@\/[^'"]+|lucide-react)['"]/g,
      `from ${JSON.stringify(stub)}`,
    );
  const { RoomChat } = await import(url(code + '\n//' + Math.random()));
  const nodes = [];
  function render() {
    stateIndex = 0;
    refIndex = 0;
    nodes.length = 0;
    const tree = RoomChat({
      bundled: true,
      roomId: 'room',
      meId: 'me',
      isHost: false,
      onMessages() {},
    });
    const walk = (n) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) {
        n.forEach(walk);
        return;
      }
      nodes.push(n);
      walk(n.props?.children);
    };
    walk(tree);
    return tree;
  }
  const find = (predicate) => {
    const n = nodes.find(predicate);
    assert.ok(n);
    return n.props;
  };
  return { render, find };
}
test('chat close survives late IME input and synthetic click, preserving visible draft', async () => {
  const old = {
    HTMLElement: globalThis.HTMLElement,
    document: globalThis.document,
    sessionStorage: globalThis.sessionStorage,
  };
  class Element {
    blur() {
      globalThis.document.activeElement = null;
      this.onBlur?.({ currentTarget: this });
    }
  }
  globalThis.HTMLElement = Element;
  globalThis.document = { activeElement: null };
  const saved = new Map();
  globalThis.sessionStorage = { setItem: (k, v) => saved.set(k, v) };
  try {
    const h = await harness();
    let tree = h.render();
    const toggle = () => h.find((n) => n.props?.className === 'chat-toggle');
    toggle().onClick({ detail: 0 });
    tree = h.render();
    let textarea = h.find((n) => n.type === 'textarea');
    const input = new Element();
    input.value = '안녕';
    input.onBlur = textarea.onBlur;
    textarea.ref.current = input;
    tree.props.ref.current = { contains: (node) => node === input };
    document.activeElement = input;
    textarea.onFocus();
    textarea.onCompositionStart();
    textarea.onChange({ target: input });
    h.render();
    let prevented = false;
    toggle().onPointerDown({
      button: 0,
      preventDefault() {
        prevented = true;
      },
    });
    assert.equal(prevented, true);
    tree = h.render();
    assert.equal(tree.props['data-open'], false);
    // Safari can deliver both after the input has been removed.
    textarea.onCompositionEnd();
    textarea.onChange({ target: { value: '안녕하세요 자동완성' } });
    toggle().onClick({ detail: 1 });
    tree = h.render();
    assert.equal(tree.props['data-open'], false);
    assert.equal(document.activeElement, null);
    toggle().onPointerDown({ button: 0 });
    toggle().onClick({ detail: 1 });
    tree = h.render();
    assert.equal(tree.props['data-open'], true);
    textarea = h.find((n) => n.type === 'textarea');
    assert.equal(textarea.value, '안녕');
    assert.equal([...saved.values()].at(-1), '안녕');
    // Hiding the keyboard / losing focus must reject delayed correction too.
    textarea.onFocus();
    textarea.onBlur({ currentTarget: { value: '초안' } });
    textarea.onChange({ target: { value: '초안 자동완성' } });
    h.render();
    assert.equal(h.find((n) => n.type === 'textarea').value, '초안');
  } finally {
    Object.assign(globalThis, old);
    delete globalThis.__chatReact;
  }
});
test('a late send response cannot reopen the mobile keyboard after closing chat', async () => {
  const old = Object.fromEntries(
    ['HTMLElement', 'document', 'sessionStorage', 'window', 'fetch'].map((k) => [k, globalThis[k]]),
  );
  let focusCount = 0,
    reply;
  class Element {
    blur() {
      document.activeElement = null;
    }
    focus() {
      focusCount++;
    }
  }
  globalThis.HTMLElement = Element;
  globalThis.document = { activeElement: null, querySelector: () => null };
  globalThis.sessionStorage = { setItem() {} };
  globalThis.window = { matchMedia: () => ({ matches: true }) };
  globalThis.fetch = () =>
    new Promise((resolve) => {
      reply = resolve;
    });
  try {
    const h = await harness();
    h.render();
    const toggle = () => h.find((n) => n.props?.className === 'chat-toggle');
    toggle().onClick({ detail: 0 });
    let tree = h.render();
    let textarea = h.find((n) => n.type === 'textarea');
    const input = new Element();
    input.value = '안녕';
    textarea.ref.current = input;
    tree.props.ref.current = { contains: (el) => el === input };
    document.activeElement = input;
    textarea.onFocus();
    textarea.onChange({ target: input });
    h.render();
    // Clicking Send blurs the textarea first; an ordinary blur is not an IME commit.
    textarea.onBlur({ currentTarget: input });
    h.find((n) => n.type === 'form').onSubmit({ preventDefault() {} });
    assert.equal(typeof reply, 'function');
    toggle().onPointerDown({ button: 0, preventDefault() {} });
    tree = h.render();
    reply({ ok: true, json: async () => ({ messages: [], serverNow: Date.now() }) });
    await new Promise((resolve) => setImmediate(resolve));
    tree = h.render();
    assert.equal(tree.props['data-open'], false);
    assert.equal(focusCount, 0);
  } finally {
    Object.assign(globalThis, old);
    delete globalThis.__chatReact;
  }
});
