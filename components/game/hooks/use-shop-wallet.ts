'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
/** A request snapshot is unknown until settled. Reads and writes share one lock. */
export function useShopWallet<T>() {
  const [data, setData] = useState<T | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [guest, setGuest] = useState(false),
    [error, setError] = useState('');
  const lock = useRef(false),
    version = useRef(0);
  const request = useCallback(async (body?: Record<string, unknown>) => {
    if (lock.current) return false;
    lock.current = true;
    const ticket = ++version.current;
    body ? setBusy(true) : setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/shop', {
        signal: AbortSignal.timeout(10000),
        ...(body
          ? {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            }
          : {}),
      });
      const result = (await response.json()) as T & { error?: string };
      if (ticket !== version.current) return false;
      setGuest(response.status === 401);
      if (response.status === 401) setData(null);
      if (!response.ok) throw Error(result.error || '상점 정보를 불러오지 못했어요.');
      setData(result);
      return true;
    } catch (e) {
      if (ticket === version.current) setError((e as Error).message);
      return false;
    } finally {
      if (ticket === version.current) {
        lock.current = false;
        setLoading(false);
        setBusy(false);
      }
    }
  }, []);
  useEffect(() => {
    void request();
    return () => {
      version.current++;
      lock.current = false;
    };
  }, [request]);
  return { data, loading, busy, guest, error, request };
}
