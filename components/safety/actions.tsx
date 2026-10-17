'use client';
import { useRef, useState } from 'react';
import { MoreHorizontal, Flag, VolumeX, UserRoundX } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
export type SafetyTarget = {
  kind: 'lobby_message' | 'room_message' | 'member' | 'room' | 'hint';
  id: string | number;
  room?: string;
  round?: string;
};
export const changed = () => window.dispatchEvent(new Event('jamopop-safety-change'));
export async function safetyPost(body: Record<string, unknown>) {
  const r = await fetch('/api/safety', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const d = (await r.json()) as { error?: string };
  if (!r.ok) throw Error(d.error || '처리하지 못했어요.');
  return d;
}
const reasons = ['욕설·괴롭힘', '도배·광고', '개인정보 노출', '부적절한 그림·이름', '기타'];
export function SafetyActions({
  target,
  name,
  onChanged,
  reportOnly = false,
}: {
  target: SafetyTarget;
  name: string;
  onChanged?: () => void;
  reportOnly?: boolean;
}) {
  const [action, setAction] = useState(''),
    [reason, setReason] = useState(reasons[0]),
    [details, setDetails] = useState(''),
    [error, setError] = useState(''),
    [done, setDone] = useState(''),
    [busy, setBusy] = useState(false);
  const lock = useRef(false),
    pending = useRef<{ key: string; id: string } | null>(null);
  async function submit() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    const key = JSON.stringify({ target, action, reason, details });
    if (pending.current?.key !== key) pending.current = { key, id: crypto.randomUUID() };
    try {
      await safetyPost({ action, target, reason, details, requestId: pending.current.id });
      setDone(
        action === 'report'
          ? '신고를 접수했어요. 문의하기에서 처리 상태를 확인할 수 있어요.'
          : action === 'mute'
            ? '이 사용자의 대화·응원·그림을 숨겼어요.'
            : '이 사용자를 차단했어요.',
      );
      if (action !== 'report') {
        changed();
        onChanged?.();
      }
      pending.current = null;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function select(value: string) {
    setAction(value);
    setDone('');
    setError('');
  }
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="safety-more"
            aria-label={`${name} 신고·차단`}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal size={18} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => select('report')}>
            <Flag size={15} />
            신고하기
          </DropdownMenuItem>
          {!reportOnly && (
            <>
              <DropdownMenuItem onSelect={() => select('mute')}>
                <VolumeX size={15} />
                대화 숨기기
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => select('block')}>
                <UserRoundX size={15} />
                사용자 차단
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog
        open={!!action}
        onOpenChange={(v) => {
          if (!v && !lock.current) setAction('');
        }}
      >
        <DialogContent className="rule-dialog safety-dialog" onKeyDown={(e) => e.stopPropagation()}>
          <DialogTitle>
            {action === 'report' ? '신고하기' : action === 'mute' ? '대화 숨기기' : '사용자 차단'}
          </DialogTitle>
          <DialogDescription>
            {done ||
              `${name}${action === 'report' ? ' 관련 내용을 관리자에게 전달합니다.' : '님의 대화·응원·그림을 숨깁니다.'}`}
          </DialogDescription>
          {!done ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              {action === 'report' ? (
                <>
                  <label>
                    신고 사유
                    <select
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      disabled={busy}
                    >
                      {reasons.map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>
                      추가 내용 <small>선택</small>
                    </span>
                    <textarea
                      value={details}
                      onChange={(e) => setDetails(e.target.value)}
                      maxLength={1000}
                      rows={4}
                      readOnly={busy}
                    />
                  </label>
                  <p>해당 내용의 사본이 관리자에게만 전달됩니다.</p>
                </>
              ) : (
                <p>
                  {action === 'block' ? '친구 요청과 초대도 서로 주고받을 수 없어요. ' : ''}게임
                  진행·순위는 유지합니다. 문의하기에서 해제할 수 있어요.
                </p>
              )}
              {error && <p role="alert">{error}</p>}
              <button className="primary" disabled={busy}>
                {busy
                  ? '처리 중…'
                  : action === 'report'
                    ? '신고 접수'
                    : action === 'mute'
                      ? '숨기기'
                      : '차단하기'}
              </button>
            </form>
          ) : (
            <button className="primary" onClick={() => setAction('')}>
              확인
            </button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
