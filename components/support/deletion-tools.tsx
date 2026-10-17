'use client';
import { useRef, useState } from 'react';
export const RECEIPT_KEY = 'jamopop.deletion-receipt';
export async function deletionCall<T>(body: Record<string, unknown>) {
  const r = await fetch('/api/account-deletion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const data = (await r.json()) as T & { error?: string };
  if (!r.ok) throw Error(data.error || '처리하지 못했습니다.');
  return data;
}
type Preview = {
  token: string;
  profileCount: number;
  profiles: { id: string; name: string }[];
  expiresAt: number;
  counts: { label: string; count: number }[];
};
export function DeletionTools({
  inquiry,
  admin,
  closed,
  onSaved,
}: {
  inquiry: string;
  admin: boolean;
  closed: boolean;
  onSaved: () => void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null),
    [confirm, setConfirm] = useState(''),
    [code, setCode] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const lock = useRef(false);
  async function act(action: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const d = await deletionCall<Preview & { code: string }>({
        action,
        inquiry,
        token: preview?.token,
        confirm,
      });
      if (action === 'preview') {
        setPreview(d);
        setConfirm('');
      }
      if (action === 'receipt') {
        setCode(d.code);
        try {
          localStorage.setItem(RECEIPT_KEY, d.code);
          setNotice('이 브라우저에 조회 코드를 저장했습니다. 별도로 복사해 보관할 수도 있습니다.');
        } catch {
          setNotice('브라우저에 저장하지 못했습니다. 아래 코드를 복사해 보관하세요.');
        }
      }
      if (action === 'execute' || action === 'cancel') {
        setPreview(null);
        setConfirm('');
        setNotice(
          action === 'execute' ? '삭제·익명화가 완료됐습니다.' : '삭제 요청을 취소했습니다.',
        );
        onSaved();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '처리하지 못했습니다.');
      if (action === 'execute') {
        setPreview(null);
        setConfirm('');
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="deletion-tools" aria-label="계정 삭제 처리">
      {closed ? (
        <p>
          종료된 삭제 요청입니다. <a href="/account-deletion">완료 결과 확인</a>
        </p>
      ) : admin ? (
        <>
          <p>
            연결된 Google·Sites 프로필 전체가 대상입니다. 다른 참가자의 방·플레이는 삭제하지
            않습니다. 관리자 계정은 이 화면에서 삭제할 수 없습니다.
          </p>
          <button type="button" disabled={busy} onClick={() => void act('preview')}>
            삭제 대상 미리보기
          </button>
          {preview && (
            <>
              <h3>연결 프로필 {preview.profileCount}개</h3>
              <ul>
                {preview.profiles.map((p) => (
                  <li key={p.id}>
                    {p.name} <small className="deletion-reference">{p.id}</small>
                  </li>
                ))}
              </ul>
              <dl className="deletion-counts">
                {preview.counts
                  .filter((c) => c.count > 0)
                  .map((c) => (
                    <div key={c.label}>
                      <dt>{c.label}</dt>
                      <dd>{c.count}건</dd>
                    </div>
                  ))}
              </dl>
              <p>
                공유 방 참가자는 익명 표기로 남습니다. 재생성 방지용 식별자와 최소 처리 증빙은
                보관합니다. 기존 백업과 타인이 작성한 언급까지 즉시 삭제하는 작업은 아닙니다.
              </p>
              <p>
                현재 DB에서 되돌릴 수 없습니다. 조회 코드를 발급받은 요청만 실행할 수 있습니다.
                미리보기는 5분간 유효합니다.
              </p>
              <label>
                실행 확인: 계정 삭제 실행
                <input
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  readOnly={busy}
                  maxLength={30}
                  autoComplete="off"
                />
              </label>
              <button
                type="button"
                disabled={busy || confirm !== '계정 삭제 실행'}
                onClick={() => void act('execute')}
              >
                {busy ? '처리 중…' : '삭제·익명화 실행'}
              </button>
            </>
          )}
        </>
      ) : (
        <>
          <p>
            삭제 후에는 로그인 세션이 종료됩니다. 먼저 완료 조회 코드를 받아 보관해 주세요. 코드는
            타인에게 공유하지 마세요.
          </p>
          <button type="button" disabled={busy} onClick={() => void act('receipt')}>
            완료 조회 코드 받기
          </button>
          {code && (
            <label>
              완료 조회 코드
              <input readOnly value={code} onFocus={(e) => e.target.select()} />
              <a href="/account-deletion">완료 결과 확인</a>
            </label>
          )}
          <details>
            <summary>삭제 요청 취소</summary>
            <button type="button" disabled={busy} onClick={() => void act('cancel')}>
              요청 취소하기
            </button>
          </details>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
