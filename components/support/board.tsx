'use client';
import { SafetySettings } from '@/components/safety/settings';
import { useEffect, useRef, useState } from 'react';
import { ThemeSwitch } from '@/components/theme';
import './support.css';
type Ticket = {
  id: string;
  name: string;
  category: string;
  title: string;
  body: string;
  status: string;
  answer: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
};
const labels: Record<string, string> = {
  new: '접수',
  reviewing: '확인 중',
  answered: '답변 완료',
  closed: '처리 완료',
};
const stamp = (n: number) => new Date(n).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
function Inquiry({ item, admin, onSaved }: { item: Ticket; admin: boolean; onSaved: () => void }) {
  const [answer, setAnswer] = useState(item.answer),
    [status, setStatus] = useState(item.status),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const lock = useRef(false);
  async function save() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'respond',
          id: item.id,
          revision: item.revision,
          status,
          answer,
        }),
        signal: AbortSignal.timeout(10000),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) throw Error(d.error);
      onSaved();
    } catch (e) {
      setError((e as Error).message || '저장하지 못했어요.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <details className="support-ticket">
      <summary>
        <span className="support-badge">{labels[item.status]}</span>
        <strong>{item.title}</strong>
        <small>
          {item.category} · {stamp(item.createdAt)}
        </small>
      </summary>
      <div className="support-ticket-body">
        <p className="support-meta">
          {item.name} · 문의 번호 {item.id.slice(0, 8)}
        </p>
        <p className="support-body">{item.body}</p>
        {admin ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label>
              처리 상태
              <select value={status} onChange={(e) => setStatus(e.target.value)} disabled={busy}>
                {Object.entries(labels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              관리자 답변
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                readOnly={busy}
                maxLength={4000}
                rows={5}
                placeholder="작성자에게 표시할 답변"
              />
            </label>
            {error && <p role="alert">{error}</p>}
            <button disabled={busy}>{busy ? '저장 중…' : '답변·상태 저장'}</button>
          </form>
        ) : item.answer ? (
          <div className="support-answer">
            <b>관리자 답변</b>
            <p>{item.answer}</p>
            <small>{stamp(item.updatedAt)}</small>
          </div>
        ) : (
          <p className="support-meta">답변이 등록되면 여기에서 확인할 수 있어요.</p>
        )}
      </div>
    </details>
  );
}
export function SupportBoard({ admin = false }: { admin?: boolean }) {
  const [items, setItems] = useState<Ticket[]>([]),
    [next, setNext] = useState<number | null>(null),
    [offset, setOffset] = useState(0),
    [status, setStatus] = useState(''),
    [refresh, setRefresh] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [denied, setDenied] = useState(false),
    [signedIn, setSignedIn] = useState(false),
    [sending, setSending] = useState(false),
    [notice, setNotice] = useState('');
  const [name, setName] = useState(''),
    [category, setCategory] = useState('오류'),
    [title, setTitle] = useState(''),
    [body, setBody] = useState('');
  const pending = useRef<{ payload: string; id: string } | null>(null),
    lock = useRef(false);
  useEffect(() => {
    let alive = true;
    const c = new AbortController(),
      timer = setTimeout(() => c.abort(), 10000);
    setLoading(true);
    setError('');
    fetch(`/api/inquiries?admin=${admin ? 1 : 0}&offset=${offset}&status=${status}`, {
      signal: c.signal,
    })
      .then(async (r) => {
        const d = (await r.json()) as {
          rows: Ticket[];
          nextOffset: number | null;
          signedIn: boolean;
          error?: string;
        };
        if (!r.ok) {
          if (alive && r.status === 403) {
            setDenied(true);
            setItems([]);
          }
          throw Error(d.error);
        }
        if (alive) {
          setItems(d.rows);
          setNext(d.nextOffset);
          setSignedIn(d.signedIn);
          setDenied(false);
        }
      })
      .catch((e) => {
        if (alive)
          setError(e.name === 'AbortError' ? '연결을 확인하고 다시 불러와 주세요.' : e.message);
      })
      .finally(() => {
        clearTimeout(timer);
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      clearTimeout(timer);
      c.abort();
    };
  }, [admin, offset, status, refresh]);
  async function submit() {
    if (lock.current) return;
    lock.current = true;
    setSending(true);
    setError('');
    setNotice('');
    const payload = JSON.stringify({
      name: name.trim(),
      category,
      title: title.trim(),
      body: body.trim(),
    });
    if (pending.current?.payload !== payload)
      pending.current = { payload, id: crypto.randomUUID() };
    try {
      const r = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          ...JSON.parse(payload),
          requestId: pending.current.id,
        }),
        signal: AbortSignal.timeout(10000),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) throw Error(d.error);
      setTitle('');
      setBody('');
      pending.current = null;
      setNotice('문의가 접수됐어요. 아래 내 문의에서 답변을 확인하세요.');
      setOffset(0);
      setStatus('');
      setRefresh((n) => n + 1);
    } catch (e) {
      setError((e as Error).message || '전송하지 못했어요. 다시 눌러도 중복 접수되지 않습니다.');
    } finally {
      lock.current = false;
      setSending(false);
    }
  }
  return (
    <main className="support-page">
      <header className="support-nav">
        <a href={admin ? '/admin' : '/?lobby=1'}>← {admin ? '대시보드' : '대기실'}</a>
        <strong>{admin ? '관리자 문의함' : '문의하기'}</strong>
        {admin && <a href="/admin/reports">신고함 ↗</a>}
        <ThemeSwitch />
      </header>
      <h1>{admin ? '접수된 문의' : '무엇을 도와드릴까요?'}</h1>
      <p className="support-meta">
        {admin
          ? '작성자에게만 답변이 표시됩니다.'
          : '문의 내용은 작성자와 관리자만 확인할 수 있습니다.'}
      </p>
      {denied ? (
        <p role="alert">관리자 계정으로 로그인해 주세요.</p>
      ) : (
        <>
          {!admin && <SafetySettings />}
          {!admin && (
            <form
              className="support-compose"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <div className="support-fields">
                <label>
                  닉네임
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={16}
                    required
                    readOnly={sending}
                  />
                </label>
                <label>
                  유형
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    disabled={sending}
                  >
                    {['오류', '제안', '기타'].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                제목
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={80}
                  required
                  readOnly={sending}
                />
              </label>
              <label>
                내용
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  maxLength={4000}
                  required
                  rows={6}
                  readOnly={sending}
                  placeholder="어떤 화면에서 어떤 문제가 있었는지 알려주세요."
                />
              </label>
              <p className="support-meta">
                {signedIn
                  ? '로그인한 계정으로 문의를 확인할 수 있어요.'
                  : '게스트 문의는 현재 브라우저에서 확인합니다. 쿠키를 삭제하거나 다른 계정으로 로그인하면 이 문의를 볼 수 없어요.'}{' '}
                비밀번호·회사 기밀은 적지 마세요.
              </p>
              <button
                className="support-primary"
                disabled={sending || loading || !name.trim() || !title.trim() || !body.trim()}
              >
                {sending ? '접수 중…' : '문의 접수'}
              </button>
            </form>
          )}
          {notice && (
            <p role="status" className="support-notice">
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="support-error">
              {error}
            </p>
          )}
          <div className="support-toolbar">
            <h2>{admin ? '문의 목록' : '내 문의'}</h2>
            <select
              aria-label="문의 처리 상태"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setOffset(0);
                setItems([]);
              }}
            >
              <option value="">전체 상태</option>
              {Object.entries(labels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <button disabled={loading || sending} onClick={() => setRefresh((n) => n + 1)}>
              새로고침
            </button>
          </div>
          <section aria-label="문의 목록" aria-busy={loading}>
            {items.map((item) => (
              <Inquiry
                key={`${item.id}:${item.revision}`}
                item={item}
                admin={admin}
                onSaved={() => setRefresh((n) => n + 1)}
              />
            ))}
            {!items.length && (
              <p className="support-empty">
                {loading
                  ? '불러오는 중…'
                  : error
                    ? '목록을 불러오지 못했어요.'
                    : '문의가 없습니다.'}
              </p>
            )}
          </section>
          <div className="support-pagination">
            <button
              disabled={loading || offset === 0}
              onClick={() => {
                setOffset(Math.max(0, offset - 20));
                setItems([]);
              }}
            >
              이전
            </button>
            <span>{Math.floor(offset / 20) + 1}페이지</span>
            <button
              disabled={loading || next === null}
              onClick={() => {
                setOffset(next!);
                setItems([]);
              }}
            >
              다음
            </button>
          </div>
        </>
      )}
    </main>
  );
}
