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
  setData,
  setEntryError,
  setMode,
  setConnection,
  setRestoring,
}: SyncOptions) {
  const polling = useRef(false),
    acceptRef = useRef(accept);
  acceptRef.current = accept;
  const refresh = useCallback(async (r = roomRef.current, m = modeRef.current) => {
    if (!r || polling.current) return;
    polling.current = true;
    try {
      const response = await checkedFetch(
        `/api/game?room=${r}&mode=${m}&away=${Date.now() - lastActivity.current > 90000 ? 1 : 0}`,
      );
      const d: any = await response.json();
      if (r !== roomRef.current || m !== modeRef.current) return;
      if (response.ok) {
        if (r === roomRef.current && m === modeRef.current) acceptRef.current(d);
      } else if (response.status === 401 || response.status === 403) {
        setData(null);
        setEntryError(response.status === 403 ? d.error : '');
      } else if (response.status === 404 && m !== 'daily') {
        setMode('daily');
        modeRef.current = 'daily';
      } else {
        setConnection(false);
      }
    } catch {
      setConnection(false);
    } finally {
      polling.current = false;
      setRestoring(false);
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
