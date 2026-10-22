'use client';
import { useEffect, useState } from 'react';
import { ThemeSwitch } from '@/components/theme';
import './admin.css';
type Row = {
  id?: string;
  userKey?: string;
  name: string;
  avatar?: string;
  kind?: string;
  lastAt?: number;
  plays?: number;
  wins?: number;
  solo?: number;
  soloXp?: number;
  host?: string;
  members?: number;
  online?: number;
  roundNo?: number;
  archivedAt?: number;
  mode?: string;
  status?: string;
  attempts?: number;
  stage?: number;
  stars?: number;
};
type Data = {
  summary: {
    users: number;
    rooms: number;
    plays: number;
    activeUsers: number;
    solo: number;
    wins: number;
  };
  rows: Row[];
  nextOffset: number | null;
  serverNow: number;
};
const status: Record<string, string> = {
  playing: '진행 중',
  won: '성공',
  lost: '실패',
  timeout: '시간 종료',
  abandoned: '포기',
  forfeited: '기권',
  interrupted: '중단',
};
const mode: Record<string, string> = {
  speed: '스피드전',
  solo: '개인 도전',
  daily: '방 문제',
  practice: '연습',
  live: '기존 대전',
};
function time(n?: number) {
  return n
    ? new Date(n).toLocaleString('ko-KR', {
        timeZone: 'Asia/Seoul',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';
}
export default function Admin() {
  const [selectedMode, setSelectedMode] = useState(''),
    [view, setView] = useState('users'),
    [days, setDays] = useState(7),
    [query, setQuery] = useState(''),
    [search, setSearch] = useState(''),
    [offset, setOffset] = useState(0),
    [data, setData] = useState<Data | null>(null),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(''),
    [denied, setDenied] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) setRevision((n) => n + 1);
    }, 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let alive = true;
    setBusy(true);
    setError('');
    fetch(
      `/api/admin?${new URLSearchParams({ view, mode: selectedMode, days: String(days), q: search, offset: String(offset) })}`,
      { signal: controller.signal },
    )
      .then(async (r) => {
        if (r.status === 403) {
          if (alive) {
            setDenied(true);
            setData(null);
          }
          throw Error('관리자 계정으로 로그인해 주세요.');
        }
        if (!r.ok) throw Error('현황을 불러오지 못했어요.');
        return r.json();
      })
      .then((d) => {
        if (alive) {
          setData(d as Data);
          setDenied(false);
        }
      })
      .catch((e) => {
        if (alive)
          setError(
            e.name === 'AbortError' ? '응답이 늦어지고 있어요. 다시 시도해 주세요.' : e.message,
          );
      })
      .finally(() => {
        clearTimeout(timeout);
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [view, selectedMode, days, search, offset, revision]);
  function change(next: string) {
    setView(next);
    setOffset(0);
    setData(null);
    setSearch('');
    setQuery('');
  }
  return (
    <main className="admin-page">
      <header className="admin-nav">
        <a href="/?lobby=1">← 대기실</a>
        <strong>운영 대시보드</strong>
        <a href="/admin/metrics">제품 지표 ↗</a>
        <a href="/admin/users">사용자 관리 ↗</a>
        <a href="/admin/gold">골드 현황 ↗</a>
        <a href="/admin/news">소식·이벤트 ↗</a>
        <a href="/admin/announcements">실시간 공지 ↗</a>
        <a href="/admin/inquiries">문의함 ↗</a>
        <a href="/admin/reports">신고함 ↗</a>
        <a href="/admin/operations">데이터 보관 ↗</a>
        <ThemeSwitch />
      </header>
      <div className="admin-title">
        <div>
          <small>ADMIN / ACTIVITY</small>
          <h1>사용자 활동</h1>
        </div>
        <span>{data ? `${time(data.serverNow)} 기준 · 30초 갱신` : '관리자 권한 확인'}</span>
      </div>
      {denied ? (
        <section className="admin-panel">
          <h2>관리자 전용 화면입니다.</h2>
          <p>대기실의 계정 연동에서 관리자 계정으로 로그인해 주세요.</p>
          <a href="/?lobby=1">대기실로 이동 →</a>
        </section>
      ) : (
        <>
          <div className="admin-controls">
            <label>
              조회 기간{' '}
              <select
                value={days}
                onChange={(e) => {
                  setDays(Number(e.target.value));
                  setOffset(0);
                  setData(null);
                }}
              >
                <option value={1}>최근 24시간</option>
                <option value={7}>최근 7일</option>
                <option value={30}>최근 30일</option>
                <option value={36500}>전체</option>
              </select>
            </label>
            <button disabled={busy} onClick={() => setRevision((n) => n + 1)}>
              {busy ? '조회 중…' : '새로고침'}
            </button>
          </div>
          <section className="admin-metrics">
            {[
              ['전체 사용자', data?.summary.users],
              ['열린 방', data?.summary.rooms],
              ['기간 내 플레이 사용자', data?.summary.activeUsers],
              ['기간 내 플레이', data?.summary.plays],
              ['개인 도전', data?.summary.solo],
              ['성공', data?.summary.wins],
            ].map(([label, value]) => (
              <article key={String(label)}>
                <span>{label}</span>
                <strong>{value ?? '—'}</strong>
              </article>
            ))}
          </section>
          <section className="admin-panel">
            <div className="admin-toolbar">
              <nav aria-label="운영 조회 종류">
                {[
                  ['users', '사용자'],
                  ['rooms', '방 현황'],
                  ['records', '플레이 기록'],
                ].map(([key, label]) => (
                  <button key={key} aria-pressed={view === key} onClick={() => change(key)}>
                    {label}
                  </button>
                ))}
              </nav>
              {view === 'records' && (
                <select
                  aria-label="플레이 모드"
                  value={selectedMode}
                  onChange={(e) => {
                    setSelectedMode(e.target.value);
                    setOffset(0);
                    setData(null);
                  }}
                >
                  <option value="">전체 모드</option>
                  <option value="speed">스피드전</option>
                  <option value="solo">개인 도전</option>
                  <option value="daily">방 문제</option>
                  <option value="practice">연습</option>
                  <option value="live">기존 대전</option>
                </select>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setSearch(query);
                  setOffset(0);
                  setData(null);
                }}
              >
                <input
                  aria-label={view === 'rooms' ? '방 이름 검색' : '닉네임 검색'}
                  placeholder={view === 'rooms' ? '방 이름 검색' : '닉네임 검색'}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  maxLength={60}
                />
                <button>검색</button>
              </form>
            </div>
            {error && (
              <p role="alert" className="admin-error">
                {error}
              </p>
            )}
            <div className="admin-table" aria-busy={busy}>
              <table>
                <thead>
                  <tr>
                    {(view === 'users'
                      ? ['사용자', '최근 플레이', '플레이', '성공', '개인 도전', '개인 XP']
                      : view === 'rooms'
                        ? ['방', '방장', '참여 / 접속', '최근 접속', '기간 내 플레이', '상태']
                        : ['사용자', '모드', '단계', '결과', '시도 / 별', '최근 기록']
                    ).map((x) => (
                      <th key={x}>{x}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data?.rows.map((r) => (
                    <tr key={r.id || r.userKey}>
                      {view === 'users' ? (
                        <>
                          <td>
                            <b>
                              {r.avatar} {r.name}
                            </b>
                            <small>
                              {r.kind} · {r.userKey}
                            </small>
                          </td>
                          <td>{time(r.lastAt)}</td>
                          <td>{r.plays}</td>
                          <td>{r.wins}</td>
                          <td>{r.solo}</td>
                          <td>{r.soloXp}</td>
                        </>
                      ) : view === 'rooms' ? (
                        <>
                          <td>
                            <a href={`/?r=${r.id}`}>{r.name} ↗</a>
                            <small>{r.roundNo}번째 판</small>
                          </td>
                          <td>{r.host || '—'}</td>
                          <td>
                            {r.members} / <b>{r.online}</b>
                          </td>
                          <td>{time(r.lastAt)}</td>
                          <td>{r.plays}</td>
                          <td>
                            <span className="admin-badge">{r.archivedAt ? '보관' : '열림'}</span>
                          </td>
                        </>
                      ) : (
                        <>
                          <td>
                            <b>
                              {r.avatar} {r.name}
                            </b>
                            <small>
                              {r.kind} · {r.userKey}
                            </small>
                          </td>
                          <td>{mode[r.mode || ''] || r.mode}</td>
                          <td>{r.stage ? `${r.stage}단계` : '—'}</td>
                          <td>
                            <span className={`admin-badge ${r.status === 'won' ? 'success' : ''}`}>
                              {status[r.status || ''] || r.status}
                            </span>
                          </td>
                          <td>
                            {r.attempts}회{r.mode === 'solo' ? ` / ★ ${r.stars}` : ''}
                          </td>
                          <td>{time(r.lastAt)}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data?.rows.length && (
                <p className="admin-empty">
                  {busy
                    ? '기록을 불러오는 중…'
                    : error
                      ? '조회 실패'
                      : '조회 조건에 맞는 기록이 없습니다.'}
                </p>
              )}
            </div>
            <footer className="admin-pagination">
              <span>{Math.floor(offset / 50) + 1}페이지 · 최대 50개씩</span>
              <div>
                <button
                  disabled={busy || offset === 0}
                  onClick={() => {
                    setOffset(Math.max(0, offset - 50));
                    setData(null);
                  }}
                >
                  이전
                </button>
                <button
                  disabled={busy || data?.nextOffset == null}
                  onClick={() => {
                    setOffset(data!.nextOffset!);
                    setData(null);
                  }}
                >
                  다음
                </button>
              </div>
            </footer>
          </section>
          <details className="admin-notes">
            <summary>집계 기준과 기록 범위</summary>
            <p>
              회원은 계정별, 게스트는 브라우저 식별값별로 합칩니다. 같은 사람이 다른 브라우저를 쓰면
              별도 사용자일 수 있습니다. 사용자·방 검색은 아래 목록에만 적용되며 상단 숫자는 전체
              서비스 기준입니다.
            </p>
            <p>
              방 플레이는 한 번 이상 제출한 판, 개인 도전은 시작한 판을 셉니다. 개인 XP는 조회
              기간과 관계없는 누적값입니다. 접속은 방의 최근 20초 연결 기준이며, 최근 플레이 시각과
              다릅니다.
            </p>
            <p>
              개인 도전의 판별 기록은 이번 업데이트부터 보관합니다. 업데이트 이전에는 마지막 판과
              최고 기록만 남아 있으며, 이전 판의 최근 기록 시각은 시작 시각으로 표시됩니다. 이미
              덮어쓴 과거 재도전은 복원할 수 없습니다.
            </p>
          </details>
        </>
      )}
    </main>
  );
}
