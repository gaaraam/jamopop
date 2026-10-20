'use client';
import { useEffect, useRef, useState } from 'react';
import '../admin.css';
import './news-admin.css';
type Post = {
  claimCount?: number;
  goldIssued?: number;
  id: string;
  kind: string;
  title: string;
  body: string;
  status: string;
  gold: number;
  startsAt: number | null;
  endsAt: number | null;
  revision: number;
};
const blank = () => ({
  id: '',
  kind: 'notice',
  title: '',
  body: '',
  status: 'draft',
  gold: 100,
  startsAt: null as number | null,
  endsAt: null as number | null,
  revision: 0,
});
const localTime = (value: number | null) =>
  value === null ? '' : new Date(value + 9 * 3600000).toISOString().slice(0, 16);
const timestamp = (value: string) => (value ? Date.parse(value + ':00+09:00') : null);
export default function ManageNews() {
  const [items, setItems] = useState<Post[]>([]),
    [form, setForm] = useState<Post>(blank),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [more, setMore] = useState(false),
    [offset, setOffset] = useState(0);
  const lock = useRef(false);
  async function load(append = false) {
    setError('');
    try {
      const r = await fetch('/api/news?admin=1&offset=' + (append ? offset + 20 : 0), {
          signal: AbortSignal.timeout(10000),
        }),
        d = (await r.json()) as { error?: string; items: Post[]; more: boolean };
      if (!r.ok) throw Error(d.error);
      setItems((old) => (append ? [...old, ...d.items] : d.items));
      setMore(d.more);
      setOffset(append ? offset + 20 : 0);
      setReady(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function save(status: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const r = await fetch('/api/news', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, action: 'save', status }),
          signal: AbortSignal.timeout(10000),
        }),
        d = (await r.json()) as { error?: string };
      if (!r.ok) throw Error(d.error);
      setForm(blank());
      setMessage(
        status === 'published'
          ? '소식을 게시했어요.'
          : status === 'archived'
            ? '소식을 비공개로 전환했어요. 이미 지급한 골드는 유지됩니다.'
            : '초안을 저장했어요.',
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <main className="admin-page">
      <header className="admin-nav">
        <a href="/admin">← 운영 대시보드</a>
        <strong>소식·이벤트 관리</strong>
        <a href="/news">이용자 화면 ↗</a>
      </header>
      <nav className="admin-news-tabs">
        <a href="/admin/news" aria-current="page">
          공지·업데이트·이벤트
        </a>
        <a href="/admin/announcements">실시간 전체 공지</a>
      </nav>
      {error && (
        <p role="alert">
          {error} <button onClick={() => void load()}>목록 다시 불러오기</button>
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <div className="admin-news-layout">
        <section className="admin-panel">
          <header className="admin-news-list-heading">
            <h1>소식 목록</h1>
            <button
              disabled={busy || !ready}
              onClick={() => {
                setForm(blank());
                setError('');
                setMessage('');
              }}
            >
              새 소식
            </button>
          </header>
          {!ready && !error && <p>관리 권한을 확인하는 중…</p>}
          {ready && items.length === 0 && <p>아직 등록된 소식이 없어요.</p>}
          {items.map((p) => (
            <button
              className="admin-news-row"
              key={p.id}
              disabled={busy}
              aria-pressed={form.id === p.id}
              onClick={() => {
                setForm(p);
                setMessage('');
              }}
            >
              <small>
                {{ notice: '공지', update: '업데이트', event: '이벤트' }[p.kind]} ·{' '}
                {{ draft: '초안', published: '게시 중', archived: '비공개' }[p.status]}
              </small>
              <strong>{p.title}</strong>
              {p.kind === 'event' && <span>{p.gold} G</span>}
            </button>
          ))}
          {more && <button onClick={() => void load(true)}>이전 소식 더 보기</button>}
        </section>
        <section className="admin-panel">
          <h2>{form.id ? '소식 수정' : '새 소식'}</h2>
          {form.id && form.kind === 'event' && (
            <p>
              수령 {form.claimCount || 0}명 · 지급 {(form.goldIssued || 0).toLocaleString()} G
            </p>
          )}
          <fieldset disabled={busy || !ready} className="news-editor">
            <label>
              분류
              <select
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value })}
              >
                <option value="notice">공지</option>
                <option value="update">운영 업데이트</option>
                <option value="event">감사 이벤트 · 골드 선물</option>
              </select>
            </label>
            <label>
              제목
              <input
                maxLength={80}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </label>
            <label>
              내용
              <textarea
                rows={9}
                maxLength={6000}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
              />
            </label>
            {form.kind === 'event' && (
              <div className="admin-event-options">
                <label>
                  1인당 골드
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    step={1}
                    value={form.gold}
                    onChange={(e) => setForm({ ...form, gold: Number(e.target.value) })}
                  />
                </label>
                <label>
                  수령 시작 · 한국시간
                  <input
                    type="datetime-local"
                    value={localTime(form.startsAt)}
                    onChange={(e) => setForm({ ...form, startsAt: timestamp(e.target.value) })}
                  />
                </label>
                <label>
                  수령 종료 · 한국시간
                  <input
                    type="datetime-local"
                    value={localTime(form.endsAt)}
                    onChange={(e) => setForm({ ...form, endsAt: timestamp(e.target.value) })}
                  />
                </label>
                <p>
                  Google 계정당 한 번 지급합니다. 기간은 최대 90일이며, 수령자가 생기면 종류·금액을
                  바꿀 수 없습니다.
                </p>
              </div>
            )}
            <details className="news-admin-preview">
              <summary>이용자에게 보이는 내용 미리보기</summary>
              <h3>{form.title || '제목'}</h3>
              <p>{form.body || '내용을 입력해 주세요.'}</p>
              {form.kind === 'event' && <strong>선물 {form.gold} G</strong>}
            </details>
            <div className="notice-actions">
              <button
                className="primary"
                disabled={!form.title.trim() || !form.body.trim()}
                onClick={() => void save('published')}
              >
                {busy ? '저장 중…' : form.status === 'published' ? '수정·게시' : '게시하기'}
              </button>
              <button onClick={() => void save('draft')}>초안 저장</button>
              {form.id && <button onClick={() => void save('archived')}>비공개로 전환</button>}
            </div>
          </fieldset>
        </section>
      </div>
    </main>
  );
}
