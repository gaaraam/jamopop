'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
const KEY = 'jamopop.age-confirmed.v1';
export function AgeCheck() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const exempt =
    ['/privacy', '/terms', '/support', '/account-deletion', '/how-to-play', '/news'].includes(
      path,
    ) ||
    path.startsWith('/admin') ||
    path.startsWith('/transfer');
  useEffect(() => {
    if (exempt) {
      setOpen(false);
      return;
    }
    try {
      setOpen(localStorage.getItem(KEY) !== '14+');
    } catch {
      setOpen(true);
    }
  }, [path, exempt]);
  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogTitle>시작하기 전에</DialogTitle>
        <DialogDescription>
          자음모음팝은 만 14세 이상 이용할 수 있어요. 생년월일이나 신분증은 받지 않아요.
        </DialogDescription>
        <label className="age-check-option">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          만 14세 이상입니다.
        </label>
        <p>
          <a href="/terms">이용약관</a> · <a href="/privacy">개인정보처리방침</a>
        </p>
        <button
          type="button"
          className="primary"
          disabled={!checked}
          onClick={() => {
            try {
              localStorage.setItem(KEY, '14+');
            } catch {}
            setOpen(false);
          }}
        >
          계속하기
        </button>
        <a href="/support">이용 문의</a>
      </DialogContent>
    </Dialog>
  );
}
