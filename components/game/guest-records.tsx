'use client';
import { useEffect, useState, useRef } from 'react';
type Snapshot = {
  signedIn: boolean;
  pending?: number;
  conflicts?: number;
  guestSolo?: { pending: boolean; conflict: boolean };
  profile?: { name: string; avatar: string };
  avatarAccess?: string[];
};
export function GuestRecords({
  showLogin = false,
  onReady,
}: {
  showLogin?: boolean;
  onReady?: (pendingSolo: boolean) => void;
}) {
  const [data, setData] = useState<Snapshot | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [returnTo, setReturnTo] = useState('/?lobby=1');
  const lock = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    setReturnTo(location.pathname + location.search);
    fetch('/api/account', { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw Error();
        const result = (await r.json()) as Snapshot;
        if (controller.signal.aborted) return;
        setData(result);
        onReady?.(!!result.signedIn && !!result.guestSolo?.pending);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('기록 연결 상태를 확인하지 못했어요.');
      });
    return () => controller.abort();
  }, [onReady]);
  if (!data)
    return error ? (
      <section className="guest-records" role="alert">
        <p>{error}</p>
        <button className="secondary-btn" onClick={() => location.reload()}>
          다시 확인
        </button>
      </section>
    ) : null;
  const pending =
    (data.pending || 0) > (data.conflicts || 0) ||
    (data.guestSolo?.pending && !data.guestSolo.conflict);
  if (!data.signedIn)
    return showLogin ? (
      <section className="guest-records">
        <p>
          다른 기기에서도 이어하려면 기록을 계정에 연결하세요. 게스트 쿠키를 지우면 다시 찾기
          어려워요.
        </p>
        <a
          className="secondary-btn"
          href={'/auth/google/start?return_to=' + encodeURIComponent(returnTo)}
        >
          Google로 로그인
        </a>
      </section>
    ) : null;
  if (!pending && !data.guestSolo?.conflict) return null;
  async function link() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'link',
          name: data?.profile?.name || '콩알친구',
          avatar: data?.profile?.avatar || data?.avatarAccess?.[0] || '🐱',
        }),
      });
      const d = (await r.json()) as Snapshot & { error?: string };
      if (!r.ok) throw Error(d.error || '연결하지 못했어요. 다시 시도해 주세요.');
      setData(d);
      if ((d.pending || 0) === (d.conflicts || 0) && !d.guestSolo?.pending) location.reload();
      else
        setError(
          '연결 가능한 기록을 옮겼어요. 같은 방이나 개인 도전의 계정 기록과 겹치는 게스트 기록은 보관합니다.',
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="guest-records" aria-label="게스트 기록 연결">
      <strong>이 브라우저에 게스트 기록이 있어요</strong>
      <p>내 계정에 연결하면 진행 중인 판과 보상을 이어서 사용할 수 있어요.</p>
      {data.guestSolo?.conflict && (
        <p>
          개인 도전은 양쪽에 기록이 있어 합치지 않아요. 로그아웃 후 게스트 기록을 이어할 수
          있습니다.
        </p>
      )}
      {!!data.conflicts && <p>같은 방의 계정 기록과 겹치는 {data.conflicts}개 방은 보관합니다.</p>}
      {pending && (
        <button className="primary" onClick={() => void link()} disabled={busy}>
          {busy ? '기록 연결 중…' : '내 계정에 기록 연결'}
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
