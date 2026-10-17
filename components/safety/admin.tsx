'use client';
import { useEffect, useRef, useState } from 'react';
import { ThemeSwitch } from '@/components/theme';
import { safetyPost } from './actions';
import '@/components/support/support.css';
type Stroke = { color: string; width: number; points: number[][] };
type Report = {
  id: string;
  kind: string;
  name: string;
  reason: string;
  details: string;
  evidence: { body?: string; name?: string; roomName?: string; strokes?: Stroke[] };
  status: string;
  revision: number;
  createdAt: number;
  actions: {
    operatorName: string;
    kind: string;
    reason: string;
    createdAt: number;
    expiresAt: number | null;
  }[];
};
const labels: Record<string, string> = { new: '접수', reviewing: '확인 중', closed: '처리 완료' },
  measures: Record<string, string> = {
    none: '상태·메모만 저장',
    warn: '주의 안내',
    chat_mute: '대화·그림 공유 제한',
    suspend: '이용 일시 제한',
    revoke: '제한 해제',
  };
const kinds: Record<string, string> = {
  lobby_message: '대기실 채팅',
  room_message: '방 채팅',
  member: '닉네임',
  room: '방 이름',
  hint: '그림 힌트',
};
function ReportCard({ item, reload }: { item: Report; reload: () => void }) {
  const [status, setStatus] = useState(item.status),
    [measure, setMeasure] = useState('none'),
    [hours, setHours] = useState(24),
    [note, setNote] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const lock = useRef(false);
  async function save() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await safetyPost({
        action: 'review',
        id: item.id,
        revision: item.revision,
        status,
        measure,
        hours,
        note,
      });
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <details className="support-ticket">
      <summary>
        <span className="support-badge">{labels[item.status]}</span>
        <strong>
          {item.name} · {item.reason}
        </strong>
        <small>
          {kinds[item.kind]} · {new Date(item.createdAt).toLocaleString('ko-KR')}
        </small>
      </summary>
      <div className="support-ticket-body">
        {item.evidence.roomName && <p className="support-meta">방 · {item.evidence.roomName}</p>}
        <div className="safety-evidence" aria-label="신고 당시 내용">
          {item.evidence.body || item.evidence.name}
          {item.evidence.strokes && (
            <svg viewBox="0 0 600 360" aria-label="신고된 그림">
              {item.evidence.strokes.map((s, i) => (
                <polyline
                  key={i}
                  fill="none"
                  stroke={/^#[0-9a-f]{6}$/i.test(s.color) ? s.color : '#273449'}
                  strokeWidth={Math.max(1, Math.min(20, s.width))}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={s.points.map((p) => `${p[0] * 600},${p[1] * 360}`).join(' ')}
                />
              ))}
            </svg>
          )}
        </div>
        {item.details && <p className="support-body">{item.details}</p>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="support-fields">
            <label>
              처리 상태
              <select value={status} disabled={busy} onChange={(e) => setStatus(e.target.value)}>
                {Object.entries(labels).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label>
              조치
              <select value={measure} disabled={busy} onChange={(e) => setMeasure(e.target.value)}>
                {Object.entries(measures).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            {!['none', 'revoke'].includes(measure) && (
              <label>
                기간
                <select
                  value={hours}
                  disabled={busy}
                  onChange={(e) => setHours(Number(e.target.value))}
                >
                  <option value={1}>1시간</option>
                  <option value={24}>24시간</option>
                  <option value={168}>7일</option>
                </select>
              </label>
            )}
          </div>
          <label>
            처리 사유
            <textarea
              required
              minLength={2}
              maxLength={500}
              rows={3}
              value={note}
              readOnly={busy}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <p className="support-meta">
            주의·이용 제한 사유는 대상 사용자에게 표시됩니다. 이의 신청은 문의함에서 확인합니다.
          </p>
          {error && <p role="alert">{error}</p>}
          <button disabled={busy || note.trim().length < 2}>
            {busy ? '저장 중…' : '처리 저장'}
          </button>
        </form>
        {item.actions.length > 0 && (
          <ul className="safety-history" aria-label="운영 처리 이력">
            {item.actions.map((a, i) => (
              <li key={i}>
                <b>{measures[a.kind]}</b> · {a.reason}
                <small>
                  {a.operatorName} · {new Date(a.createdAt).toLocaleString('ko-KR')}
                  {a.expiresAt && ` · ${new Date(a.expiresAt).toLocaleString('ko-KR')}까지`}
                </small>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
export function SafetyAdmin() {
  const [data, setData] = useState<{ rows: Report[]; nextOffset: number | null } | null>(null),
    [status, setStatus] = useState(''),
    [offset, setOffset] = useState(0),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const c = new AbortController();
    let alive = true;
    setLoading(true);
    setData(null);
    setError('');
    fetch(`/api/safety?admin=1&status=${status}&offset=${offset}`, { signal: c.signal })
      .then(async (r) => {
        const d = (await r.json()) as { rows: Report[]; nextOffset: number | null; error?: string };
        if (!r.ok) throw Error(d.error);
        if (alive) setData(d);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      c.abort();
    };
  }, [status, offset, revision]);
  return (
    <main className="support-page safety-admin">
      <header className="support-nav">
        <a href="/admin">← 운영</a>
        <strong>신고함</strong>
        <a href="/admin/inquiries">문의·이의 신청 ↗</a>
        <ThemeSwitch />
      </header>
      <h1>이용자 신고</h1>
      <div className="support-toolbar">
        <select
          aria-label="신고 처리 상태"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setOffset(0);
          }}
        >
          <option value="">전체 상태</option>
          {Object.entries(labels).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <button disabled={loading} onClick={() => setRevision((n) => n + 1)}>
          새로고침
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {data?.rows.map((r) => (
        <ReportCard
          key={r.id + ':' + r.revision}
          item={r}
          reload={() => setRevision((n) => n + 1)}
        />
      ))}
      {!data?.rows.length && !error && (
        <p className="support-empty">{loading ? '불러오는 중…' : '접수된 신고가 없어요.'}</p>
      )}
      <div className="support-pagination">
        <button
          disabled={loading || offset === 0}
          onClick={() => setOffset(Math.max(0, offset - 20))}
        >
          이전
        </button>
        <span>{Math.floor(offset / 20) + 1}페이지</span>
        <button
          disabled={loading || !data?.nextOffset}
          onClick={() => setOffset(data!.nextOffset!)}
        >
          다음
        </button>
      </div>
    </main>
  );
}
