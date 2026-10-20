'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarCheck, Check, ChevronDown, Coins, Gift, Megaphone, Sparkles } from 'lucide-react';
import { ServiceHeader } from '@/components/game/service-header';
import { CharacterAvatar } from '@/components/game/character-avatar';
import './news.css';
type Post = {
  id: string;
  kind: string;
  title: string;
  body: string;
  gold: number;
  startsAt: number | null;
  endsAt: number | null;
  createdAt: number;
};
type Feed = {
  items: Post[];
  more: boolean;
  serverNow: number;
  day: string;
  attendanceGold: number;
  signedIn: boolean;
  claims: { kind: string; key: string; amount: number; otherProfile: boolean }[];
};
const labels: Record<string, string> = { notice: '공지', update: '업데이트', event: '이벤트' };
const eventTime = (n: number) =>
  new Date(n).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
const date = (n: number) =>
  new Date(n).toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
  });
export default function News() {
  const [data, setData] = useState<Feed | null>(null),
    [filter, setFilter] = useState('all'),
    [open, setOpen] = useState<string | null>(null),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(''),
    [offset, setOffset] = useState(0),
    [direct, setDirect] = useState(false),
    [now, setNow] = useState(Date.now());
  const lock = useRef(false),
    generation = useRef(0),
    clock = useRef({ server: 0, local: 0 });
  const load = useCallback(
    async (append = false) => {
      const gen = ++generation.current;
      setError('');
      try {
        const query = new URLSearchParams();
        if (append) query.set('offset', String(offset + 20));
        const post = new URLSearchParams(location.search).get('post');
        if (post && !append) query.set('post', post);
        const r = await fetch('/api/news?' + query, { signal: AbortSignal.timeout(10000) }),
          d = (await r.json()) as Feed & { error?: string };
        if (!r.ok) throw Error(d.error);
        if (gen !== generation.current) return;
        clock.current = { server: d.serverNow, local: Date.now() };
        setNow(d.serverNow);
        setData((old) => ({ ...d, items: append && old ? [...old.items, ...d.items] : d.items }));
        setOffset(append ? offset + 20 : 0);
        if (post) {
          setOpen(post);
          setDirect(true);
        }
      } catch (e) {
        if (gen === generation.current)
          setError((e as Error).message || '소식을 불러오지 못했어요.');
      }
    },
    [offset],
  );
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (clock.current.server) setNow(clock.current.server + Date.now() - clock.current.local);
    }, 30000);
    const focus = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener('visibilitychange', focus);
    return () => {
      generation.current++;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', focus);
    };
  }, []);
  async function claim(action: string, id = '') {
    if (lock.current) return;
    lock.current = true;
    setBusy(id || 'attendance');
    setError('');
    setMessage('');
    try {
      const r = await fetch('/api/news', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, id }),
          signal: AbortSignal.timeout(10000),
        }),
        d = (await r.json()) as {
          error?: string;
          otherProfile: boolean;
          received: boolean;
          amount: number;
        };
      if (!r.ok) throw Error(d.error);
      setMessage(
        d.otherProfile
          ? '연결된 다른 프로필에서 이미 받은 보상이에요.'
          : d.received
            ? `${d.amount}골드를 받았어요!`
            : '이미 받은 보상이에요.',
      );
      await load();
    } catch (e) {
      setError((e as Error).message || '처리 결과를 확인하지 못했어요.');
    } finally {
      lock.current = false;
      setBusy('');
    }
  }
  const attended = data?.claims.some(
    (c) =>
      c.kind === 'attendance' && c.key === new Date(now + 9 * 3600000).toISOString().slice(0, 10),
  );
  const login = '/auth/google/start?return_to=' + encodeURIComponent('/news');
  return (
    <main className="news-page">
      <ServiceHeader active="news" title="소식" />
      <section className="attendance-card" aria-label="오늘의 출석 보상">
        <div className="attendance-art">
          <CharacterAvatar avatar="🐰" />
          <span>
            <Gift size={28} />
          </span>
        </div>
        <div className="attendance-copy">
          <div className="news-tag">
            <CalendarCheck size={16} />
            매일 한 번
          </div>
          <h2>오늘도 반가워요</h2>
          <p>
            출석하고 <strong>{data?.attendanceGold ?? 50}골드</strong> 받아 가세요.
          </p>
          <small>한국시간 자정에 새 출석이 열려요.</small>
        </div>
        <div className="attendance-action">
          {!data ? (
            <span>확인 중…</span>
          ) : !data.signedIn ? (
            <a className="news-primary" href={login}>
              로그인하고 출석
            </a>
          ) : (
            <button
              className="news-primary"
              disabled={!!busy || attended}
              onClick={() => void claim('attendance')}
            >
              {attended ? (
                <>
                  <Check size={20} />
                  오늘 출석 완료
                </>
              ) : (
                <>
                  <Coins size={20} />
                  {busy === 'attendance' ? '받는 중…' : `${data.attendanceGold} G 받기`}
                </>
              )}
            </button>
          )}
          <a href="/shop">상점에서 사용하기 →</a>
        </div>
      </section>
      <div className="news-feedback" aria-live="polite">
        {message && <p role="status">{message}</p>}
        {error && (
          <p role="alert">
            {error} <button onClick={() => void load()}>다시 불러오기</button>
          </p>
        )}
      </div>
      <nav className="news-filters" aria-label="소식 분류">
        {['all', 'notice', 'update', 'event'].map((k) => (
          <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>
            {k === 'all' ? '전체' : labels[k]}
          </button>
        ))}
        {direct && <a href="/news">전체 소식 보기</a>}
      </nav>
      <section className="news-feed" aria-label="소식 목록">
        {!data && !error ? (
          <p>소식을 불러오는 중…</p>
        ) : data?.items.filter((p) => filter === 'all' || p.kind === filter).length === 0 ? (
          <div className="news-empty">
            <Megaphone size={30} />
            <h2>아직 등록된 소식이 없어요</h2>
            <a href="/?lobby=1">대기실로 →</a>
          </div>
        ) : (
          data?.items
            .filter((p) => filter === 'all' || p.kind === filter)
            .map((p) => {
              const received = data.claims.find((c) => c.kind === 'event' && c.key === p.id),
                future = p.startsAt !== null && now < p.startsAt,
                ended = p.endsAt !== null && now >= p.endsAt;
              return (
                <article key={p.id} className="news-post" data-kind={p.kind}>
                  <button
                    className="news-post-heading"
                    aria-expanded={open === p.id}
                    onClick={() => setOpen(open === p.id ? null : p.id)}
                  >
                    <span className="news-kind-icon">
                      {p.kind === 'event' ? (
                        <Gift />
                      ) : p.kind === 'update' ? (
                        <Sparkles />
                      ) : (
                        <Megaphone />
                      )}
                    </span>
                    <span className="news-post-title">
                      <span className="news-post-meta">
                        <b>{labels[p.kind]}</b>
                        <time dateTime={new Date(p.createdAt).toISOString()}>
                          {date(p.createdAt)}
                        </time>
                        {p.kind === 'event' && (
                          <em>
                            {received
                              ? '수령 완료'
                              : ended
                                ? '종료'
                                : future
                                  ? '시작 전'
                                  : '진행 중'}
                          </em>
                        )}
                      </span>
                      <strong>{p.title}</strong>
                    </span>
                    {p.kind === 'event' && (
                      <span className="news-gold">
                        <Coins size={18} />
                        {p.gold.toLocaleString()} G
                      </span>
                    )}
                    <ChevronDown size={18} />
                  </button>
                  {open === p.id && (
                    <div className="news-post-body">
                      <p>{p.body}</p>
                      {p.kind === 'event' && (
                        <div className="event-reward">
                          <div>
                            <Gift size={24} />
                            <strong>{p.gold.toLocaleString()} G</strong>
                            <span>
                              {eventTime(p.startsAt!)} ~ {eventTime(p.endsAt!)} · 한국시간
                            </span>
                          </div>
                          {!data.signedIn ? (
                            <a className="news-primary" href={login}>
                              로그인하고 받기
                            </a>
                          ) : (
                            <button
                              className="news-primary"
                              disabled={!!busy || !!received || future || ended}
                              onClick={() => void claim('claim', p.id)}
                            >
                              {received
                                ? received.otherProfile
                                  ? '다른 프로필에서 수령'
                                  : '수령 완료'
                                : ended
                                  ? '종료된 이벤트'
                                  : future
                                    ? '아직 시작 전이에요'
                                    : busy === p.id
                                      ? '받는 중…'
                                      : '선물 받기'}
                            </button>
                          )}
                        </div>
                      )}
                      <a className="news-permalink" href={'/news?post=' + encodeURIComponent(p.id)}>
                        이 소식 링크
                      </a>
                    </div>
                  )}
                </article>
              );
            })
        )}
      </section>
      {data?.more && (
        <button className="news-more" disabled={!!busy} onClick={() => void load(true)}>
          이전 소식 더 보기
        </button>
      )}
    </main>
  );
}
