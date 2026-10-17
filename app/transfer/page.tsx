'use client';
import { useEffect, useState, useRef } from 'react';
import { ThemeSwitch } from '@/components/theme';
type TransferResponse = {
  error?: string;
  url: string;
  summary: Summary;
  profiles: Array<{ id: string; label: string }>;
  current: string;
};
type Summary = {
  found: boolean;
  name: string;
  avatar: string;
  rooms: number;
  wins: number;
  level: number;
  xp: number;
};
export default function Transfer() {
  const incomingRef = useRef<string | null>(null);
  const [profiles, setProfiles] = useState<Array<{ id: string; label: string }>>([]),
    [current, setCurrent] = useState('');
  const [ready, setReady] = useState(false),
    [ticket, setTicket] = useState(''),
    [summary, setSummary] = useState<Summary | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function send(path: string, body: unknown = {}) {
    const r = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      d = (await r.json()) as TransferResponse;
    if (!r.ok) throw Error(d.error || '다시 시도해 주세요.');
    return d;
  }
  useEffect(() => {
    let active = true;
    const incoming =
      incomingRef.current ?? new URLSearchParams(location.hash.slice(1)).get('ticket') ?? '';
    incomingRef.current = incoming;
    if (incoming) {
      setTicket(incoming);
      history.replaceState(null, '', '/transfer');
    }
    fetch('/auth/profiles')
      .then(async (r) => {
        if (r.status === 401) {
          location.replace('/auth/google/start?return_to=%2Ftransfer');
          return;
        }
        if (!r.ok) throw Error('정보를 불러오지 못했어요.');
        const d = (await r.json()) as TransferResponse;
        if (!active) return;
        if (location.search.includes('manage=1')) {
          setProfiles(d.profiles);
          setCurrent(d.current);
        }
        if (incoming) {
          const preview = await send('/auth/legacy/preview', { ticket: incoming });
          if (active) setSummary(preview.summary);
        } else if (
          !location.search.includes('manage=1') &&
          d.current &&
          !d.current.startsWith('google:')
        ) {
          location.replace('/?lobby=1');
          return;
        }
        if (active) setReady(true);
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setReady(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  async function begin() {
    setBusy(true);
    setError('');
    try {
      const d = await send('/auth/legacy/start');
      location.href = d.url;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  async function complete() {
    setBusy(true);
    setError('');
    try {
      await send('/auth/legacy/complete', { ticket });
      location.replace('/?lobby=1');
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <main className="entry-page glass refined">
      <header>
        <a href="/?lobby=1">← 대기실</a>
        <ThemeSwitch />
      </header>
      <section className="join-panel" style={{ maxWidth: 480, margin: '48px auto', padding: 32 }}>
        {!ready ? (
          <p role="status">내 기록을 확인하고 있어요…</p>
        ) : (
          <>
            <small className="secondary-text">기록 가져오기</small>
            <h1 style={{ fontSize: 28, lineHeight: 1.35, margin: '12px 0 16px' }}>
              {summary?.found
                ? `${summary.name}님의 기록을 찾았어요`
                : summary
                  ? '이전 기록을 찾지 못했어요.'
                  : '이전에 플레이한 기록이 있나요?'}
            </h1>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            {summary?.found ? (
              <>
                <div
                  style={{
                    padding: 24,
                    margin: '24px 0',
                    border: '1px solid var(--border, #dedee9)',
                    borderRadius: 18,
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 46 }}>{summary.avatar}</div>
                  <strong>{summary.name}</strong>
                  <p>
                    Lv.{summary.level} · {summary.xp.toLocaleString()} XP
                  </p>
                  <small>
                    성공 {summary.wins}회 · 참여한 방 {summary.rooms}개
                  </small>
                </div>
                <button className="primary" disabled={busy} onClick={() => void complete()}>
                  {busy ? '연결하는 중…' : '이 기록으로 시작하기'}
                </button>
              </>
            ) : (
              <>
                <p className="secondary-text">
                  {summary
                    ? '다른 계정으로 플레이했는지 확인해 주세요.'
                    : '기존 닉네임·레벨·게임 기록을 가져올 수 있어요.'}
                </p>
                <button
                  className="primary"
                  style={{ marginTop: 24 }}
                  disabled={busy}
                  onClick={() => void begin()}
                >
                  {busy
                    ? '이동하는 중…'
                    : error || summary
                      ? '다시 기록 찾기'
                      : '기존 기록 가져오기'}
                </button>
              </>
            )}
            <a
              href="/?lobby=1"
              style={{
                display: 'block',
                textAlign: 'center',
                marginTop: 20,
                color: 'inherit',
                fontSize: 14,
              }}
            >
              처음이에요 · 바로 시작
            </a>
          </>
        )}
        {profiles.length > 1 && (
          <details style={{ marginTop: 28 }}>
            <summary>저장된 프로필 전환</summary>
            {profiles.map((p) => (
              <button
                key={p.id}
                className="my-room"
                disabled={busy || p.id === current}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await send('/auth/profiles', { id: p.id });
                    location.replace('/?lobby=1');
                  } catch (e) {
                    setError((e as Error).message);
                    setBusy(false);
                  }
                }}
              >
                {p.label}
                {p.id === current ? ' · 사용 중' : ''}
              </button>
            ))}
          </details>
        )}
      </section>
    </main>
  );
}
