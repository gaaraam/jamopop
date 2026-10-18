import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const mod = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
test('actual room sync ignores late old-room denial, cancels superseded reads and settles the current entry only', async () => {
  const pending = [],
    events = [];
  globalThis.__entryFetch = (url, options) =>
    new Promise((resolve, reject) => pending.push({ url, options, resolve, reject }));
  const dependencies = {
    react: mod('export const useRef=v=>({current:v}),useCallback=f=>f,useEffect=()=>{};'),
    '@/lib/recovery.mjs': mod(
      'export const checkedFetch=(...args)=>globalThis.__entryFetch(...args);',
    ),
    '@/lib/sync-client': mod('export const ownSync=()=>()=>{};'),
    '@/lib/sync-policy.mjs': mod('export const pollDelay=()=>3000;'),
  };
  let code = ts.transpileModule(readFileSync('components/game/hooks/use-room-sync.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const [from, to] of Object.entries(dependencies))
    code = code.replaceAll("'" + from + "'", JSON.stringify(to));
  const { useRoomSync } = await import(mod(code));
  const roomRef = { current: 'a' },
    modeRef = { current: 'daily' };
  const refresh = useRoomSync({
    roomRef,
    modeRef,
    lastActivity: { current: Date.now() },
    dataRef: { current: null },
    busyRef: { current: false },
    chatOpen: { current: false },
    active: false,
    accept: (d) => events.push(['accept', d.room]),
    setData: (d) => events.push(['data', d]),
    setEntryError: (e) => events.push(['error', e]),
    setMode: (m) => events.push(['mode', m]),
    setConnection: (c) => events.push(['connection', c]),
    setRestoring: (r) => events.push(['restoring', r]),
  });
  try {
    const old = refresh();
    roomRef.current = 'b';
    const next = refresh();
    assert.equal(pending.length, 2);
    assert.equal(pending[0].options.signal.aborted, true);
    pending[0].resolve({ ok: false, status: 401, json: async () => ({}) });
    await old;
    assert.deepEqual(events, [], 'old request cannot uncover the entry form or deny the new room');
    pending[1].resolve({ ok: true, status: 200, json: async () => ({ room: 'b' }) });
    await next;
    assert.deepEqual(events, [
      ['accept', 'b'],
      ['restoring', false],
    ]);
    events.length = 0;
    const current = refresh();
    await refresh();
    assert.equal(pending.length, 3, 'same target reads coalesce');
    pending[2].resolve({ ok: false, status: 401, json: async () => ({}) });
    await current;
    assert.deepEqual(
      events,
      [
        ['data', null],
        ['error', ''],
        ['restoring', false],
      ],
      'new participant sees setup only after the membership check',
    );
    const memberEvents = [];
    roomRef.current = 'member-room';
    modeRef.current = 'daily';
    const autoRefresh = useRoomSync({
      roomRef,
      modeRef,
      lastActivity: { current: Date.now() },
      dataRef: { current: null },
      busyRef: { current: false },
      chatOpen: { current: false },
      active: false,
      accept: (d) => {
        memberEvents.push(['accept', d.room]);
        roomRef.current = d.room;
      },
      onEntryRequired: async (r, m, info) => {
        assert.equal(info.canUseProfile, true);
        return { state: { room: 'canonical-room', round: { mode: 'daily' } } };
      },
      setData: (d) => memberEvents.push(['data', d]),
      setEntryError: (e) => memberEvents.push(['error', e]),
      setMode: () => {},
      setConnection: () => {},
      setRestoring: (r) => memberEvents.push(['restoring', r]),
    });
    const memberRead = autoRefresh();
    pending.at(-1).resolve({ ok: false, status: 401, json: async () => ({ canUseProfile: true }) });
    await memberRead;
    assert.deepEqual(
      memberEvents,
      [
        ['accept', 'canonical-room'],
        ['restoring', false],
      ],
      'member enters without uncovering setup, including canonical invite IDs',
    );
    roomRef.current = 'b';
    events.length = 0;
    const exited = refresh();
    roomRef.current = '';
    pending.at(-1).reject(Error('late network error'));
    await exited;
    assert.deepEqual(events, [], 'leaving during a read cannot break the next screen');
  } finally {
    delete globalThis.__entryFetch;
  }
});
