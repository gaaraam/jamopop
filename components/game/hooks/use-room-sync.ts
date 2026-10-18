'use client';
import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { type GameState } from '@/lib/game';
import { checkedFetch } from '@/lib/recovery.mjs';
import { ownSync } from '@/lib/sync-client';
import { pollDelay } from '@/lib/sync-policy.mjs';
type SyncOptions = {
  dataRef: RefObject<GameState | null>;
  roomRef: RefObject<string>;
  modeRef: RefObject<string>;
  busyRef: RefObject<boolean>;
  lastActivity: RefObject<number>;
  chatOpen: RefObject<boolean>;
  active: boolean;
  accept: (data: GameState) => void;
  onEntryRequired?: (
    room: string,
    mode: string,
    info: any,
    signal: AbortSignal,
  ) => Promise<{ state?: GameState; error?: string }>;
  setData: (data: GameState | null) => void;
  setEntryError: (error: string) => void;
  setMode: (mode: string) => void;
  setConnection: (online: boolean) => void;
  setRestoring: (restoring: boolean) => void;
};
export function useRoomSync({
  dataRef,
  roomRef,
  modeRef,
  busyRef,
  lastActivity,
  chatOpen,
  active,
  accept,
  onEntryRequired,
  setData,
  setEntryError,
  setMode,
  setConnection,
  setRestoring,
}: SyncOptions) {
  const polling = useRef<{ key: string; controller: AbortController } | null>(null),
    acceptRef = useRef(accept),
    entryRef = useRef(onEntryRequired);
  acceptRef.current = accept;
  entryRef.current = onEntryRequired;
  const refresh = useCallback(async (r = roomRef.current, m = modeRef.current) => {
    if (!r) return;
    const key = `${r}:${m}`;
    if (polling.current?.key === key) return;
    polling.current?.controller.abort();
    const current = { key, controller: new AbortController() };
    polling.current = current;
    const relevant = () =>
      polling.current === current && r === roomRef.current && m === modeRef.current;
    let fallback = false,
      delivered = false;
    try {
      const response = await checkedFetch(
        `/api/game?room=${r}&mode=${m}&away=${Date.now() - lastActivity.current > 90000 ? 1 : 0}`,
        { signal: current.controller.signal },
      );
      const d: any = await response.json();
      if (!relevant()) return;
      if (response.ok) {
        acceptRef.current(d);
        delivered = true;
      } else if (response.status === 401 || response.status === 403) {
        const joined =
          response.status === 401 && entryRef.current
            ? await entryRef.current(r, m, d, current.controller.signal)
            : null;
        if (!relevant()) return;
        if (joined?.state) {
          if (joined.state.round.mode !== modeRef.current) {
            modeRef.current = joined.state.round.mode;
            setMode(joined.state.round.mode);
          }
          acceptRef.current(joined.state);
          delivered = true;
        } else {
          setData(null);
          setEntryError(joined?.error ?? (response.status === 403 ? d.error : ''));
        }
      } else if (response.status === 404 && m !== 'daily') {
        setMode('daily');
        modeRef.current = 'daily';
        fallback = true;
      } else {
        setConnection(false);
      }
    } catch {
      if (relevant() && !current.controller.signal.aborted) setConnection(false);
    } finally {
      if (polling.current === current && (relevant() || delivered)) setRestoring(false);
      if (polling.current === current) polling.current = null;
      if (fallback && r === roomRef.current && modeRef.current === 'daily')
        void refresh(r, 'daily');
    }
  }, []);
  useEffect(() => {
    const online = () => {
      void refresh();
    };
    const offline = () => setConnection(false);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    window.addEventListener('pageshow', online);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      window.removeEventListener('pageshow', online);
    };
  }, [refresh]);
  useEffect(() => {
    if (!active) return;
    const release = ownSync();
    let last = Date.now();
    const run = () => {
      last = Date.now();
      if (!document.hidden && !busyRef.current) void refresh();
    };
    const timer = setInterval(() => {
      const d = dataRef.current;
      const finished =
        !!d &&
        (!!d.round.expired ||
          (d.players.length > 0 &&
            d.players.every((p) => p.status === 'won' || p.status === 'lost')));
      if (
        !document.hidden &&
        Date.now() - last >=
          pollDelay({
            idleMs: Date.now() - lastActivity.current,
            finished,
            chatOpen: chatOpen.current,
          })
      )
        run();
    }, 500);
    const visible = () => {
      if (!document.hidden) run();
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      release();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [active, refresh]);
  return refresh;
}
