'use client';
import { useEffect, useState } from 'react';
import '../admin.css';
type Row = {
  subject: string;
  name: string;
  email: string;
  createdAt: number;
  status: string;
  revision: number;
};
export default function Approvals() {
  const [rows, setRows] = useState<Row[]>([]),
    [status, setStatus] = useState('pending'),
    [offset, setOffset] = useState(0),
    [next, setNext] = useState<number | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    setBusy(true);
    setError('');
    fetch(`/api/admin/approvals?status=${status}&offset=${offset}`, { signal: c.signal })
      .then(async (r) => {
        const d = (await r.json()) as { error?: string; rows: Row[]; nextOffset: number | null };
        if (!r.ok) throw Error(d.error);
        setRows(d.rows);
        setNext(d.nextOffset);
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setError(e.message);
          setRows([]);
        }
      })
      .finally(() => {
        if (!c.signal.aborted) setBusy(false);
      });
    return () => c.abort();
  }, [status, offset, refresh]);
  async function decide(row: Row, value: string) {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/admin/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: row.subject, revision: row.revision, status: value }),
      });
      const d = (await r.json()) as { error?: string; rows: Row[]; nextOffset: number | null };
      if (!r.ok) throw Error(d.error);
      setRefresh((x) => x + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : '처리하지 못했어요.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="admin-page">
      <header className="admin-nav">
        <a href="/admin">← 운영</a>
        <h1>가입 승인</h1>
      </header>
      <nav className="admin-toolbar" aria-label="신청 상태">
        {[
          ['pending', '승인 대기'],
          ['approved', '승인 완료'],
          ['rejected', '거절'],
        ].map(([value, label]) => (
          <button
            key={value}
            aria-pressed={status === value}
            onClick={() => {
              setStatus(value);
              setOffset(0);
            }}
          >
            {label}
          </button>
        ))}
        <button disabled={busy} onClick={() => setRefresh((x) => x + 1)}>
          새로고침
        </button>
      </nav>
      {error && <p role="alert">{error}</p>}
      {busy && <p role="status">처리 중…</p>}
      <div className="admin-panel admin-table">
        <table>
          <thead>
            <tr>
              <th>이름</th>
              <th>이메일</th>
              <th>가입일</th>
              <th>처리</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.subject}>
                <td>{row.name}</td>
                <td>{row.email}</td>
                <td>{new Date(row.createdAt).toLocaleDateString('ko-KR')}</td>
                <td>
                  {row.status !== 'approved' && (
                    <>
                      <button disabled={busy} onClick={() => decide(row, 'approved')}>
                        승인
                      </button>
                      {row.status === 'pending' && (
                        <button disabled={busy} onClick={() => decide(row, 'rejected')}>
                          거절
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!busy && !error && !rows.length && <p>해당 신청이 없어요.</p>}
      <button disabled={busy || offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>
        이전
      </button>
      <button disabled={busy || next === null} onClick={() => setOffset(next!)}>
        다음
      </button>
    </main>
  );
}
