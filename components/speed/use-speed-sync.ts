import { rememberActiveRoom } from '@/lib/active-room.mjs';
import { publishRoom } from '@/lib/sync-client';
import { draftKey, readDraft, rememberRoom } from '@/lib/recovery.mjs';
import { useCallback, useEffect, useRef, useState } from 'react';
export function useSpeedSync() {
  const [room, setRoom] = useState('');
  const [data, setData] = useState<any>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [clock, setClock] = useState(Date.now());
  const [connected, setConnected] = useState(true);
  const lock = useRef(false),
    loading = useRef(false),
    epoch = useRef(0),
    offset = useRef(0),
    composing = useRef(false),
    compositionEnd = useRef(0),
    input = useRef<HTMLInputElement>(null),
    drafts = useRef<Record<string, string>>({}),
    currentKey = useRef(''),
    latest = useRef<any>(null);
  const accept = useCallback((d: any) => {
    publishRoom(d.room);
    if (latest.current && d.serverNow < latest.current.serverNow) return;
    if (latest.current?.room.active && !d.room.active) {
      location.replace('/?r=' + d.room.id);
      return;
    }
    rememberActiveRoom(sessionStorage, d.room.id, d.room.active ? 'speed' : 'daily');
    latest.current = d;
    offset.current = d.serverNow - Date.now();
    setClock(Date.now() + offset.current);
    setData(d);
    const key = d.round ? draftKey(d.me.id, d.round.id, d.play.current) : '';
    const row = d.play?.puzzles[d.play.current]?.guesses.length || 0;
    const restored = key ? readDraft(localStorage, key, row) : '';
    if (currentKey.current !== key || drafts.current[key] !== restored) {
      currentKey.current = key;
      drafts.current[key] = restored;
      setDraft(restored);
    }
    rememberRoom(localStorage, d.room.id, d.room.name, 'speed');
    setConnected(true);
  }, []);
  useEffect(() => {
    setRoom(new URLSearchParams(location.search).get('room') || '');
  }, []);
  const refresh = useCallback(async () => {
    if (!room || lock.current || loading.current) return;
    loading.current = true;
    const seq = epoch.current;
    try {
      const r = await fetch('/api/speed?room=' + encodeURIComponent(room), {
          signal: AbortSignal.timeout(10000),
        }),
        d: any = await r.json();
      if (!r.ok) throw Error(d.error);
      if (seq === epoch.current) {
        accept(d);
        setError('');
      }
    } catch (e) {
      if (seq === epoch.current) {
        setConnected(false);
        setError('재연결 중 · 입력은 보관되어 있어요');
      }
    } finally {
      loading.current = false;
    }
  }, [room, accept]);
  useEffect(() => {
    if (!room) return;
    let stopped = false,
      timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (!document.hidden) await refresh();
      if (!stopped)
        timer = setTimeout(
          tick,
          !latest.current?.round ? 1000 : !latest.current.round.ended ? 3000 : 10000,
        );
    };
    void tick();
    const visible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      epoch.current++;
      document.removeEventListener('visibilitychange', visible);
    };
  }, [room, refresh]);
  useEffect(() => {
    const online = () => void refresh(),
      offline = () => {
        setConnected(false);
        setError('재연결 중 · 입력은 보관되어 있어요');
      };
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, [refresh]);
  useEffect(() => {
    const t = setInterval(() => setClock(Date.now() + offset.current), 250);
    return () => clearInterval(t);
  }, []);
  return {
    room,
    data,
    draft,
    setDraft,
    error,
    setError,
    clock,
    connected,
    setConnected,
    lock,
    epoch,
    offset,
    composing,
    compositionEnd,
    input,
    drafts,
    currentKey,
    latest,
    accept,
    refresh,
  };
}
