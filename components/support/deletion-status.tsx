'use client';
import { useEffect, useRef, useState } from 'react';
import { deletionCall, RECEIPT_KEY } from './deletion-tools';
import './support.css';
export function DeletionStatus() {
  const [code, setCode] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [result, setResult] = useState<{ status: string; completedAt: number | null } | null>(null);
  const lock = useRef(false);
  useEffect(() => {
    try {
      setCode(localStorage.getItem(RECEIPT_KEY) || '');
    } catch {}
  }, []);
  async function check() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      setResult(
        await deletionCall<{ status: string; completedAt: number | null }>({
          action: 'status',
          code,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '확인하지 못했습니다.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <main className="support-page">
      <header className="support-nav">
        <a href="/">← 자음모음팝</a>
        <a href="/support">문의하기</a>
      </header>
      <h1>계정 삭제 처리 결과</h1>
      <form
        className="support-compose"
        onSubmit={(e) => {
          e.preventDefault();
          void check();
        }}
      >
        <label>
          완료 조회 코드
          <input
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setResult(null);
            }}
            autoComplete="off"
            spellCheck={false}
            maxLength={64}
            readOnly={busy}
          />
        </label>
        <p>로그인 없이 확인할 수 있습니다. 처리 완료 후 코드는 90일간 유효합니다.</p>
        <button disabled={busy || !/^[a-f0-9]{64}$/.test(code)}>
          {busy ? '확인 중…' : '처리 결과 확인'}
        </button>
        {error && <p role="alert">{error}</p>}
        {result && (
          <div role="status">
            <h2>
              {result.status === 'completed'
                ? '삭제·익명화 완료'
                : result.status === 'cancelled'
                  ? '요청 취소됨'
                  : '처리 대기 중'}
            </h2>
            {result.completedAt && (
              <p>
                {new Date(result.completedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
              </p>
            )}
            <p>
              {result.status === 'completed'
                ? '계정·연결 개인 기록을 삭제하고 세션을 종료했습니다. 공유 방은 유지하며 참가자 표시는 익명화했습니다. 재생성 방지 식별자와 최소 처리 증빙은 보관합니다. 백업과 타인이 작성한 언급은 이 처리에 포함되지 않습니다.'
                : result.status === 'cancelled'
                  ? '요청이 취소되어 계정은 삭제되지 않았습니다.'
                  : '관리자가 요청을 확인하고 있습니다. 접수만으로 기록이 삭제되지 않습니다.'}
            </p>
          </div>
        )}
      </form>
    </main>
  );
}
