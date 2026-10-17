'use client';
import { useEffect, useState, useRef } from 'react';
import '../admin.css';
const titleNames: Record<string, string> = {
  last_second: '벼락치기',
  last_chance: '벼랑 끝 생존자',
};
const statuses: Record<string, string> = {
  playing: '진행 중',
  won: '성공',
  lost: '실패',
  timeout: '시간 종료',
  abandoned: '포기',
};
const kinds: Record<string, string> = {
  google: 'Google 회원',
  guest: '게스트',
  legacy: 'Sites 회원',
};
const time = (n: number) =>
  n ? new Date(n).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '—';
export default function Users() {
  const detailRef = useRef<HTMLElement>(null);
  const [q, setQ] = useState(''),
    [search, setSearch] = useState(''),
    [kind, setKind] = useState(''),
    [link, setLink] = useState(''),
    [active, setActive] = useState(''),
    [offset, setOffset] = useState(0),
    [revision, setRevision] = useState(0),
    [selected, setSelected] = useState('');
  const [data, setData] = useState<any>(null),
    [detail, setDetail] = useState<any>(null),
    [error, setError] = useState(''),
    [detailError, setDetailError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const c = new AbortController();
    let alive = true;
    setBusy(true);
    setError('');
    fetch(
      '/api/admin/users?' +
        new URLSearchParams({ q: search, kind, link, active, offset: String(offset) }),
      { signal: c.signal },
    )
      .then(async (r) => {
        const d = (await r.json()) as { error?: string };
        if (!r.ok) throw Error(d.error || '조회하지 못했어요.');
        return d;
      })
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e) => {
        if (alive && e.name !== 'AbortError') {
          setError(e.message);
          setData(null);
        }
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
      c.abort();
    };
  }, [search, kind, link, active, offset, revision]);
  useEffect(() => {
    detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setDetail(null);
    setDetailError('');
    if (!selected) return;
    const c = new AbortController();
    fetch('/api/admin/users?key=' + encodeURIComponent(selected), { signal: c.signal })
      .then(async (r) => {
        const d = (await r.json()) as { error?: string };
        if (!r.ok) throw Error(d.error || '조회하지 못했어요.');
        return d;
      })
      .then((d) => {
        if (!c.signal.aborted) setDetail(d);
      })
      .catch((e) => {
        if (!c.signal.aborted) setDetailError(e.message);
      });
    return () => c.abort();
  }, [selected, revision]);
  return (
    <main className="admin-page">
      <header className="admin-nav">
        <a href="/admin">← 운영 대시보드</a>
        <strong>사용자 관리</strong>
        <a href="/admin/inquiries">문의함 ↗</a>
      </header>
      <div className="admin-title">
        <h1>회원 · 게스트</h1>
        <button onClick={() => setRevision((n) => n + 1)} disabled={busy}>
          새로고침
        </button>
      </div>
      <section className="admin-metrics">
        {[
          ['Google 회원', 'google'],
          ['게스트 식별', 'guest'],
          ['Sites 회원', 'legacy'],
          ['기록 연결 완료', 'linked'],
          ['24시간 내 활동', 'active'],
        ].map(([label, key]) => (
          <article key={key}>
            <span>{label}</span>
            <strong>{data?.summary[key] ?? '—'}</strong>
          </article>
        ))}
      </section>
      <section className="admin-panel">
        <div className="admin-toolbar">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(q);
              setOffset(0);
            }}
          >
            <input
              aria-label="닉네임 또는 사용자 ID 검색"
              placeholder="닉네임 · 사용자 ID"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button>검색</button>
          </form>
          <select
            aria-label="회원 구분"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">전체 사용자</option>
            {Object.entries(kinds).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select
            aria-label="기록 연결"
            value={link}
            onChange={(e) => {
              setLink(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">모든 연결 상태</option>
            <option value="linked">연결 완료</option>
            <option value="unlinked">미연결</option>
          </select>
          <select
            aria-label="최근 활동"
            value={active}
            onChange={(e) => {
              setActive(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">전체 기간</option>
            <option value="day">24시간 내 활동</option>
            <option value="week">7일 내 활동</option>
          </select>
        </div>
        {error && <p role="alert">{error}</p>}
        <div className="admin-table" aria-busy={busy}>
          <table>
            <thead>
              <tr>
                {['사용자', '구분', '기존 기록', '프로필', '참여 방 기록', '최근 활동'].map((x) => (
                  <th key={x}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.rows.map((u: any) => (
                <tr key={u.userKey}>
                  <td>
                    <button onClick={() => setSelected(u.userKey)}>
                      {u.avatar} <b>{u.name}</b>
                    </button>
                    <small>{u.userKey}</small>
                  </td>
                  <td>{kinds[u.kind]}</td>
                  <td>
                    <span className="admin-badge">{u.linked ? '연결 완료' : '미연결'}</span>
                  </td>
                  <td>{u.profiles}</td>
                  <td>{u.roomCount}</td>
                  <td>{time(u.lastAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data?.rows.length === 0 && <p className="admin-empty">검색 결과가 없습니다.</p>}
        </div>
        <footer className="admin-pagination">
          <span>
            {data?.total ?? 0}명 · {offset / 50 + 1}페이지
          </span>
          <button disabled={busy || !offset} onClick={() => setOffset((n) => Math.max(0, n - 50))}>
            이전
          </button>
          <button
            disabled={busy || data?.nextOffset == null}
            onClick={() => setOffset(data.nextOffset)}
          >
            다음
          </button>
        </footer>
      </section>
      {selected && (
        <section ref={detailRef} className="admin-panel admin-user-detail" aria-label="사용자 상세">
          <header>
            <h2>{detail ? `${detail.user.avatar} ${detail.user.name}` : '사용자 상세'}</h2>
            <button onClick={() => setSelected('')}>닫기</button>
          </header>
          {detailError ? (
            <p role="alert">{detailError}</p>
          ) : !detail ? (
            <p role="status">조회 중…</p>
          ) : (
            <>
              <p>
                {kinds[detail.user.kind]} · {detail.user.linked ? '기록 연결 완료' : '기록 미연결'}
              </p>
              <p>
                등록일 {time(detail.user.createdAt)} · 최근 활동 {time(detail.user.lastAt)}
              </p>
              <h3>전체 방 전적</h3>
              <p>
                {detail.stats.completed}판 · {detail.stats.wins}승 · 성공 평균{' '}
                {detail.stats.average?.toFixed(1) ?? '—'}회
              </p>
              <h3>프로필 · 레벨</h3>
              {detail.profiles.map((p: any) => (
                <p key={p.userKey}>
                  {p.avatar} {p.name} · {p.level ? `Lv.${p.level}` : '게스트'} · {p.userKey}
                </p>
              ))}
              <h3>개인 도전</h3>
              {detail.solo.length ? (
                detail.solo.map((s: any, i: number) => (
                  <p key={i}>
                    {s.xp} XP · {s.cleared}개 층 완료 ·{' '}
                    {s.active
                      ? `${s.active.stage}층 (${statuses[s.active.status] || s.active.status})`
                      : '진행 중인 도전 없음'}
                  </p>
                ))
              ) : (
                <p>기록 없음</p>
              )}
              <h3>칭호 · 꾸미기</h3>
              <p>
                {detail.titles.map((t: any) => titleNames[t.title] || t.title).join(' · ') ||
                  '칭호 없음'}
              </p>
              {detail.cosmetics.map((c: any, i: number) => (
                <p key={i}>
                  닉네임 {c.nameColor} · 프레임 {c.avatarFrame}
                </p>
              ))}
              <h3>연결 이력</h3>
              {detail.links.map((l: any, i: number) => (
                <p key={i}>
                  {l.label || '게임 프로필'} · {l.imported ? '기존 기록 연결' : 'Google 프로필'} ·{' '}
                  {time(l.linkedAt)}
                </p>
              ))}
              <small>{detail.historyNote}</small>
              <h3>참여 방 · 최근 100개</h3>
              {detail.rooms.map((r: any, i: number) => (
                <p key={r.id + i}>
                  <a href={`/?r=${r.id}`}>{r.name} ↗</a> · {r.nickname} ·{' '}
                  {r.blocked ? '퇴장' : r.archivedAt ? '보관' : r.spectator ? '관전' : '참가'} ·{' '}
                  {time(r.lastAt)}
                </p>
              ))}
            </>
          )}
        </section>
      )}
      <p className="admin-notes">
        게스트는 브라우저 식별값 기준입니다. 쿠키 삭제·다른 브라우저 사용 시 같은 사람이 중복 집계될
        수 있습니다. Google 계정에 연결된 게임 프로필은 한 사용자로 묶습니다.
      </p>
    </main>
  );
}
