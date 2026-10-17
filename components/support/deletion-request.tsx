'use client';
import { useEffect, useRef, useState } from 'react';

export function DeletionRequest({ signedIn, onSaved }: { signedIn: boolean; onSaved: () => void }) {
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const lock = useRef(false);
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const reveal = () => {
      if (location.hash === '#account-deletion' && details.current) details.current.open = true;
    };
    reveal();
    window.addEventListener('hashchange', reveal);
    return () => window.removeEventListener('hashchange', reveal);
  }, []);
  async function submit() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request-deletion', confirm: confirmation }),
        signal: AbortSignal.timeout(10000),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw Error(result.error || '접수하지 못했어요.');
      setNotice(
        '삭제 요청을 접수했어요. 아래 내 문의에서 처리 안내를 확인하세요. 아직 기록은 삭제되지 않았습니다.',
      );
      setConfirmation('');
      onSaved();
    } catch (error) {
      setError(error instanceof Error ? error.message : '연결을 확인하고 다시 시도해 주세요.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <details ref={details} id="account-deletion" className="support-ticket">
      <summary>
        <strong>계정 삭제 요청</strong>
      </summary>
      <div className="support-ticket-body">
        <p>
          현재 로그인한 계정과 연결 기록의 삭제를 요청합니다. 관리자가 연결된 프로필과 공유 기록의
          처리 범위를 확인하고 이 문의에 답변합니다.
        </p>
        <p>
          접수 즉시 삭제되지 않습니다. 별도의 게스트 기록이나 다른 계정의 기록은 자동으로 포함하지
          않습니다.
        </p>
        {signedIn ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <label>
              확인 문구: 계정 삭제 요청
              <input
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                readOnly={busy}
                maxLength={30}
                autoComplete="off"
              />
            </label>
            <button disabled={busy || confirmation !== '계정 삭제 요청'}>
              {busy ? '접수 중…' : '삭제 요청 접수'}
            </button>
          </form>
        ) : (
          <p>
            <a href="/auth/google/start?return_to=%2Fsupport%23account-deletion">
              삭제할 계정으로 로그인
            </a>
            해 주세요. 게스트 기록은 아래 일반 문의로 요청해 주세요.
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
      </div>
    </details>
  );
}
