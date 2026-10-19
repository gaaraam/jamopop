'use client';
import { useEffect, useState } from 'react';
import '../admin.css';
const modes: Record<string, string> = {
  home: '첫 화면',
  lobby: '대기실',
  hub: '개인 도전 목록',
  daily: '오늘의 단어',
  word: '단어 도전',
  exit: '콩알 탈출',
  stack: '자모 쏙쏙',
  toktok: '자모 톡톡',
  room: '방 대전',
  practice: '연습',
  speed: '스피드전',
};
type Funnel = {
  mode: string;
  views: number;
  starts: number;
  actions: number;
  completions: number;
  wins: number;
  retries: number;
  nextGames: number;
};
type Data = {
  summary: {
    browsers: number;
    sessions: number;
    returningBrowsers: number;
    events: number;
    firstAt: number | null;
    lastAt: number | null;
  };
  funnel: Funnel[];
  daily: {
    day: string;
    browsers: number;
    sessions: number;
    actions: number;
    completions: number;
  }[];
  serverNow: number;
};
const rate = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : '—');
export default function ProductMetrics() {
  const [days, setDays] = useState(7),
    [revision, setRevision] = useState(0),
    [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(true),
    [denied, setDenied] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    setBusy(true);
    setDenied(false);
    setData(null);
    setError('');
    const timer = setTimeout(() => controller.abort(), 10000);
    fetch(`/api/admin/product-metrics?days=${days}`, { signal: controller.signal })
      .then(async (r) => {
        const b = (await r.json()) as Data & { error?: string };
        if (r.status === 403 && alive) setDenied(true);
        if (!r.ok) throw Error(b.error || '조회하지 못했어요.');
        return b;
      })
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e) => {
        if (alive)
          setError(e.name === 'AbortError' ? '응답이 늦어요. 다시 시도해 주세요.' : e.message);
      })
      .finally(() => {
        clearTimeout(timer);
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [days, revision]);
  if (denied)
    return (
      <main className="admin-page">
        <header className="admin-nav">
          <a href="/admin">← 운영 대시보드</a>
          <strong>제품 지표</strong>
        </header>
        <section className="admin-panel" style={{ marginTop: 24 }}>
          <h1>관리자 전용 화면입니다.</h1>
          <p>관리자 계정으로 로그인한 뒤 확인해 주세요.</p>
          <a href="/?lobby=1">대기실로 이동 →</a>
        </section>
      </main>
    );
  const games = data?.funnel.filter((r) => !['home', 'lobby', 'hub'].includes(r.mode)) || [];
  return (
    <main className="admin-page">
      <header className="admin-nav">
        <a href="/admin">← 운영 대시보드</a>
        <strong>제품 지표</strong>
        <a href="/privacy#product-measurement">수집 기준</a>
      </header>
      <div className="admin-title">
        <h1>플레이 흐름</h1>
        <span>측정 참여 브라우저 · 최근 7일 보관</span>
      </div>
      <div className="admin-controls">
        <label>
          조회 기간{' '}
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={1}>최근 24시간</option>
            <option value={7}>최근 7일</option>
          </select>
        </label>
        <button disabled={busy} onClick={() => setRevision((n) => n + 1)}>
          {busy ? '조회 중…' : '새로고침'}
        </button>
      </div>
      {error && (
        <p role="alert" className="admin-error">
          {error}
        </p>
      )}
      <section className="admin-metrics">
        {[
          ['측정 브라우저', data?.summary.browsers],
          ['방문 세션', data?.summary.sessions],
          ['기간 내 다른 날 재방문', data?.summary.returningBrowsers],
        ].map(([label, value]) => (
          <article key={String(label)}>
            <span>{label}</span>
            <strong>{value ?? '—'}</strong>
          </article>
        ))}
      </section>
      <section className="admin-panel" aria-busy={busy}>
        <h2>게임별 전환</h2>
        <div className="admin-table">
          <table>
            <thead>
              <tr>
                {[
                  '게임',
                  '플레이 화면',
                  '진행 중 진입',
                  '첫 조작',
                  '완료',
                  '성공',
                  '완료율',
                  '재도전',
                  '다음 판',
                ].map((x) => (
                  <th key={x}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {games.map((r) => (
                <tr key={r.mode}>
                  <td>{modes[r.mode]}</td>
                  <td>{r.views}</td>
                  <td>{r.starts}</td>
                  <td>{r.actions}</td>
                  <td>{r.completions}</td>
                  <td>{r.wins}</td>
                  <td>{rate(r.completions, r.actions)}</td>
                  <td>{r.retries}</td>
                  <td>{r.nextGames}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!games.length && (
          <p className="admin-empty">{busy ? '불러오는 중…' : '아직 측정된 플레이가 없습니다.'}</p>
        )}
      </section>
      <section className="admin-panel" style={{ marginTop: 16 }}>
        <h2>진입 화면</h2>
        <div className="admin-table">
          <table>
            <thead>
              <tr>
                <th>화면</th>
                <th>방문 세션</th>
              </tr>
            </thead>
            <tbody>
              {data?.funnel
                .filter((r) => ['home', 'lobby', 'hub'].includes(r.mode))
                .map((r) => (
                  <tr key={r.mode}>
                    <td>{modes[r.mode]}</td>
                    <td>{r.views}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="admin-panel" style={{ marginTop: 16 }}>
        <h2>날짜별 현황</h2>
        <div className="admin-table">
          <table>
            <thead>
              <tr>
                {['한국 날짜', '브라우저', '세션', '첫 조작', '완료'].map((x) => (
                  <th key={x}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.daily.map((r) => (
                <tr key={r.day}>
                  <td>{r.day}</td>
                  <td>{r.browsers}</td>
                  <td>{r.sessions}</td>
                  <td>{r.actions}</td>
                  <td>{r.completions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <details className="admin-notes" open>
        <summary>집계 기준</summary>
        <p>
          선택적으로 참여한 표본이며 전체 회원 수나 전체 이용자 수가 아닙니다. 브라우저 식별값은
          7일마다 바뀌고, 탭의 30분 무활동 뒤 새 세션이 됩니다. 날짜는 한국시간 기준입니다. 재방문은
          조회 기간 안에 서로 다른 날짜에 나타난 브라우저 수입니다.
        </p>
        <p>
          첫 조작은 유효한 첫 이동·타일 선택·서버가 수락한 첫 제출입니다. 입력 중 글자와 사전 오류는
          수집하지 않습니다. 완료율은 같은 판·세션에서 시작과 첫 조작이 확인된 판 중 완료
          비율입니다. 복원된 완료 화면은 새 완료로 세지 않습니다. 관전은 제외합니다.
        </p>
        <p>
          재도전·다음 판은 측정된 플레이 뒤 이어간 행동입니다. 미완료 이탈은 실패로 단정하지 않으며,
          폴링·조작 원문은 보내지 않습니다. 새로고침·동의 전·통신 단절·차단 도구 때문에 일부
          이벤트가 누락될 수 있습니다. 클라이언트 신고 수치로 보상이나 순위를 판정하지 않습니다.
        </p>
        <p>
          로그인·기록 연결 성공률, 신고 처리 시간, API 지연·요청 비용은 이 표에 포함되지 않습니다.
          조회 기간의 첫 표본:{' '}
          {data?.summary.firstAt
            ? new Date(data.summary.firstAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
            : '표본 없음'}
        </p>
      </details>
    </main>
  );
}
