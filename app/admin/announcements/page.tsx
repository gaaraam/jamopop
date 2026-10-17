'use client';
import { useEffect, useRef, useState } from 'react';
import '../admin.css';
export default function Notices() {
  const [body, setBody] = useState(''),
    [revision, setRevision] = useState(0),
    [active, setActive] = useState(false),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const lock = useRef(false);
  async function load() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const r = await fetch('/api/announcements?admin=1', { signal: AbortSignal.timeout(10000) });
      const d = (await r.json()) as {
        body: string;
        revision: number;
        active: number;
        error?: string;
      };
      if (!r.ok) throw Error(d.error);
      setBody(d.body);
      setRevision(d.revision);
      setActive(!!d.active);
      setReady(true);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function save(publish: boolean) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const r = await fetch('/api/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, active: publish, revision }),
        signal: AbortSignal.timeout(10000),
      });
      const d = (await r.json()) as {
        body: string;
        revision: number;
        active: number;
        error?: string;
      };
      if (!r.ok) throw Error(d.error);
      setRevision(d.revision);
      setActive(!!d.active);
      setBody(d.body);
      setMessage(
        publish
          ? '전체 공지를 게시했어요. 최대 15초 안에 접속 중인 화면에 표시됩니다.'
          : '공지를 내렸어요.',
      );
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
        <strong>전체 공지</strong>
        <a href="/?lobby=1">대기실 ↗</a>
      </header>
      <section className="admin-panel notice-editor">
        <h1>전체 공지</h1>
        <p>{active ? '게시 중' : '게시된 공지 없음'} · 대기실 / 모든 방 / 개인 도전</p>
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        <label>
          공지 내용
          <textarea
            aria-label="공지 내용"
            maxLength={300}
            rows={5}
            value={body}
            disabled={!ready || busy}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
        <small>{body.length}/300</small>
        <div className="notice-preview">
          <strong>미리보기</strong>
          <p>{body || '입력한 공지가 여기에 표시됩니다.'}</p>
        </div>
        <div className="notice-actions">
          <button
            className="primary"
            disabled={!ready || busy || !body.trim()}
            onClick={() => void save(true)}
          >
            {busy ? '처리 중…' : active ? '공지 수정·게시' : '전체 공지 게시'}
          </button>
          <button disabled={!ready || busy || !active} onClick={() => void save(false)}>
            공지 내리기
          </button>
          <button disabled={busy} onClick={() => void load()}>
            새로고침
          </button>
        </div>
      </section>
    </main>
  );
}
