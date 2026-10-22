'use client';
import { useEffect, useState } from 'react';
import '../admin.css';
import './gold.css';
const number = (n: number = 0) => n.toLocaleString('ko-KR');
const labels: Record<string, string> = {
  game: '게임 보상',
  first_win: '첫 성공 보너스',
  attendance: '출석',
  event: '이벤트',
  purchase: '상점 구매',
};
export default function GoldEconomy() {
  const [days, setDays] = useState(30),
    [q, setQ] = useState(''),
    [search, setSearch] = useState(''),
    [offset, setOffset] = useState(0),
    [revision, setRevision] = useState(0),
    [data, setData] = useState<any>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(true),
    [selected, setSelected] = useState<any>(null),
    [history, setHistory] = useState<any[] | null>(null),
    [historyError, setHistoryError] = useState('');
  useEffect(() => {
    let alive = true;
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 15000);
    setBusy(true);
    setError('');
    fetch(
      '/api/admin/gold?' +
        new URLSearchParams({ days: String(days), q: search, offset: String(offset) }),
      { signal: c.signal },
    )
      .then(async (r) => {
        const d: any = await r.json();
        if (!r.ok) throw Error(d.error);
        return d;
      })
      .then((d) => {
        if (!c.signal.aborted) setData(d);
      })
      .catch((e) => {
        if (!alive) return;
        setData(null);
        setError(
          e.name === 'AbortError' ? '조회 시간이 길어졌어요. 다시 시도해 주세요.' : e.message,
        );
      })
      .finally(() => {
        clearTimeout(t);
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
      clearTimeout(t);
      c.abort();
    };
  }, [days, search, offset, revision]);
  useEffect(() => {
    setHistory(null);
    setHistoryError('');
    if (!selected) return;
    const c = new AbortController();
    fetch('/api/admin/gold?account=' + encodeURIComponent(selected.account_id), {
      signal: c.signal,
    })
      .then(async (r) => {
        const d: any = await r.json();
        if (!r.ok) throw Error(d.error);
        return d;
      })
      .then((d) => {
        if (!c.signal.aborted) setHistory(d.rows);
      })
      .catch((e) => {
        if (!c.signal.aborted) setHistoryError(e.message);
      });
    return () => c.abort();
  }, [selected, revision]);
  const s = data?.summary,
    flows = data?.daily || [],
    issued = flows.reduce((a: number, b: any) => a + b.issued, 0),
    spent = flows.reduce((a: number, b: any) => a + b.spent, 0),
    max = Math.max(1, ...flows.flatMap((r: any) => [r.issued, r.spent]));
  return (
    <main className="admin-page gold-admin">
      <header className="admin-nav">
        <a href="/admin">← 운영 대시보드</a>
        <strong>골드 현황</strong>
        <a href="/admin/news">이벤트 관리 ↗</a>
      </header>
      <div className="admin-title">
        <h1>골드 유통</h1>
        <button disabled={busy} onClick={() => setRevision((n) => n + 1)}>
          새로고침
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {busy && <p role="status">조회 중…</p>}
      <section className="admin-metrics">
        {[
          ['회원 지갑 잔액', s?.balance],
          ['누적 지급', s?.issued],
          ['누적 소비', s?.spent],
          ['게스트 연결 대기', s?.guestPending],
        ].map(([label, value]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>
              {value == null ? '—' : number(Number(value))}
              <small> G</small>
            </strong>
          </article>
        ))}
      </section>
      {s && (
        <p className="gold-reconcile">
          {s.holders}개 지갑 보유 · 상위 10개 지갑 {number(s.topTen)} G · 잔액 대조{' '}
          {s.issued - s.spent === s.balance ? '일치' : '확인 필요'}
          {s.negative > 0 && <b role="alert"> · 음수 잔액 {s.negative}개</b>}
          {s.orphanRewards > 0 && <b role="alert"> · 귀속 없는 보상 {s.orphanRewards}건</b>}
        </p>
      )}
      <section className="admin-panel">
        <header className="gold-section-head">
          <h2>지급과 소비</h2>
          <select
            aria-label="집계 기간"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {[7, 30, 90].map((d) => (
              <option key={d} value={d}>
                최근 {d}일
              </option>
            ))}
          </select>
        </header>
        <div className="gold-flow-totals">
          <span>
            지급 <b>+{number(issued)} G</b>
          </span>
          <span>
            소비 <b>−{number(spent)} G</b>
          </span>
          <span>
            순증 <b>{number(issued - spent)} G</b>
          </span>
          <span>
            소비율 <b>{issued ? ((spent / issued) * 100).toFixed(1) + '%' : '—'}</b>
          </span>
        </div>
        <div className="gold-chart" aria-label="날짜별 지급과 소비">
          <div className="gold-legend">
            <i />
            지급 <i />
            소비
          </div>
          {flows.length ? (
            flows.map((r: any) => (
              <div className="gold-bar-row" key={r.day}>
                <time>{r.day.slice(5)}</time>
                <div className="gold-bars">
                  <div style={{ width: `${(r.issued / max) * 100}%` }} />
                  <div style={{ width: `${(r.spent / max) * 100}%` }} />
                </div>
                <span>
                  +{number(r.issued)} / −{number(r.spent)}
                </span>
              </div>
            ))
          ) : (
            <p className="admin-empty">이 기간의 거래가 없습니다.</p>
          )}
        </div>
      </section>
      <div className="gold-breakdowns">
        <section className="admin-panel">
          <h2>지급 경로</h2>
          {data?.sources
            .filter((r: any) => r.kind !== 'purchase')
            .map((r: any) => (
              <div className="gold-line" key={r.kind}>
                <span>
                  {labels[r.kind] || r.kind}
                  <small>{number(r.count)}건</small>
                </span>
                <b>{number(r.amount)} G</b>
              </div>
            ))}
        </section>
        <section className="admin-panel">
          <h2>소비된 상품</h2>
          {data?.products.length ? (
            data.products.map((p: any) => (
              <div className="gold-line" key={p.item}>
                <span>
                  {p.name}
                  <small>{number(p.count)}개</small>
                </span>
                <b>{number(p.amount)} G</b>
              </div>
            ))
          ) : (
            <p className="admin-empty">이 기간의 구매가 없습니다.</p>
          )}
        </section>
      </div>
      <section className="admin-panel">
        <div className="gold-section-head">
          <h2>회원 지갑</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(q);
              setOffset(0);
              setSelected(null);
            }}
          >
            <input
              aria-label="닉네임 또는 지갑 ID"
              placeholder="닉네임 · 지갑 ID"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button>검색</button>
          </form>
        </div>
        <div className="admin-table">
          <table>
            <thead>
              <tr>
                <th>프로필</th>
                <th>지급</th>
                <th>소비</th>
                <th>잔액</th>
              </tr>
            </thead>
            <tbody>
              {data?.wallets.map((w: any) => (
                <tr key={w.account_id}>
                  <td>
                    <button onClick={() => setSelected(w)}>
                      {w.avatar} {w.name}
                    </button>
                    <small>{w.account_id}</small>
                  </td>
                  <td>{number(w.issued)}</td>
                  <td>{number(w.spent)}</td>
                  <td>
                    <b>{number(w.balance)} G</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && !data.wallets.length && <p className="admin-empty">검색 결과가 없습니다.</p>}
        </div>
        <footer className="admin-pagination">
          <span>{offset / 50 + 1}페이지</span>
          <button disabled={busy || !offset} onClick={() => setOffset((n) => n - 50)}>
            이전
          </button>
          <button
            disabled={busy || offset + 50 >= (data?.wallets[0]?.total || 0)}
            onClick={() => setOffset((n) => n + 50)}
          >
            다음
          </button>
        </footer>
      </section>
      {selected && (
        <section className="admin-panel">
          <header className="gold-section-head">
            <h2>{selected.name} · 최근 거래 100건</h2>
            <button onClick={() => setSelected(null)}>닫기</button>
          </header>
          {historyError ? (
            <p role="alert">{historyError}</p>
          ) : history === null ? (
            <p role="status">불러오는 중…</p>
          ) : history.length ? (
            history.map((r, i) => (
              <div className="gold-line" key={i}>
                <span>
                  {labels[r.kind] || r.kind}
                  {r.kind === 'purchase' && ' · ' + r.itemName}
                  <small>{r.day}</small>
                </span>
                <b>
                  {r.amount > 0 ? '+' : ''}
                  {number(r.amount)} G
                </b>
              </div>
            ))
          ) : (
            <p>거래가 없습니다.</p>
          )}
        </section>
      )}
      <details className="admin-panel gold-notes">
        <summary>집계 기준</summary>
        <p>
          현재 보존된 기록을 상점 잔액과 같은 규칙으로 계산합니다. 삭제·익명화 이전의 영구 누적
          발행량은 아닙니다. 한국 시간 기준이며, 첫 성공 보너스는 지갑·날짜당 30 G입니다.
        </p>
        <p>
          게스트 보상은 연결 전 예상 금액입니다. 같은 날짜의 기록을 회원 지갑에 연결하면 첫 성공
          보너스가 중복되지 않아 합산액이 달라질 수 있습니다. Google 계정에 여러 게임 프로필이
          연결되어 있어도 지갑은 각각 표시합니다.
        </p>
        <p>
          기간별 거래는 현재 귀속 기준으로 다시 계산합니다. 잔액과 회원 지갑은 전체 기간 기준입니다.
          소비율은 선택 기간 지급 대비 소비 비율이며, 이전에 모은 골드를 쓰면 100%를 넘을 수
          있습니다.
        </p>
        <p>골드 지급은 이벤트 관리에서 진행할 수 있습니다. 이 화면은 잔액을 변경하지 않습니다.</p>
      </details>
    </main>
  );
}
