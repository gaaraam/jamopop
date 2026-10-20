'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Check, Coins, Gift, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { CharacterAvatar } from '@/components/game/character-avatar';
import { useModalOpen } from '@/components/game/overlay-state';
import { latestRoom } from '@/lib/sync-client';
import { attendanceEntry, alreadyWelcomed, rememberWelcome } from '@/lib/attendance-welcome.mjs';
type Offer = {
  signedIn: boolean;
  received: boolean;
  day: string;
  gold: number;
  welcomeKey?: string;
};
export function AttendanceWelcome() {
  const path = usePathname(),
    search = useSearchParams().toString(),
    modal = useModalOpen();
  const eligible = attendanceEntry(path, search);
  const [offer, setOffer] = useState<Offer | null>(null),
    [open, setOpen] = useState(false),
    [visible, setVisible] = useState(true),
    [busy, setBusy] = useState(false),
    [received, setReceived] = useState(false),
    [newlyGranted, setNewlyGranted] = useState(false),
    [otherProfile, setOtherProfile] = useState(false),
    [error, setError] = useState('');
  const shown = useRef(new Set<string>());
  const lock = useRef(false),
    alive = useRef(true),
    generation = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current++;
    };
  }, []);
  useEffect(() => {
    const ticket = ++generation.current;
    setOpen(false);
    setOffer(null);
    setReceived(false);
    setNewlyGranted(false);
    setError('');
    if (!eligible) return;
    const controller = new AbortController();
    let attempted = false;
    async function load() {
      if (document.hidden || attempted || latestRoom()) return;
      attempted = true;
      try {
        const r = await fetch('/api/news?attendance=1', {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
        });
        const d = (await r.json()) as Offer;
        if (
          r.ok &&
          !controller.signal.aborted &&
          ticket === generation.current &&
          d.signedIn &&
          !d.received
        )
          setOffer(d);
      } catch {
        /* Optional welcome never blocks navigation or gameplay on failure. */
      }
    }
    void load();
    const onVisibility = () => {
      setVisible(!document.hidden);
      if (!document.hidden) void load();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      controller.abort();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [path, search, eligible]);
  useEffect(() => {
    if (!eligible || !offer?.welcomeKey || open || modal || document.hidden || latestRoom()) return;
    if (shown.current.has(offer.welcomeKey)) return;
    try {
      if (alreadyWelcomed(localStorage, offer.welcomeKey, offer.day)) return;
      rememberWelcome(localStorage, offer.welcomeKey, offer.day);
    } catch {
      /* In-memory dismissal still works when browser storage is disabled. */
    }
    shown.current.add(offer.welcomeKey);
    setOpen(true);
  }, [offer, modal, eligible, open, visible]);
  async function claim() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    const ticket = generation.current;
    try {
      const r = await fetch('/api/news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'attendance' }),
        signal: AbortSignal.timeout(10000),
      });
      const d = (await r.json()) as {
        error?: string;
        amount: number;
        received: boolean;
        otherProfile: boolean;
      };
      if (!r.ok) throw Error(d.error || '선물을 받지 못했어요.');
      window.dispatchEvent(new CustomEvent('jamopop-reward-claimed'));
      if (!alive.current || ticket !== generation.current) return;
      setOffer((old) => (old ? { ...old, gold: d.amount } : old));
      setOtherProfile(!!d.otherProfile);
      setNewlyGranted(!!d.received);
      setReceived(true);
    } catch (e) {
      if (alive.current && ticket === generation.current)
        setError((e as Error).message || '연결을 확인하고 다시 시도해 주세요.');
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="attendance-welcome"
        data-received={(received && newlyGranted) || undefined}
      >
        <div className="welcome-scene" aria-hidden="true">
          <span className="welcome-star s1">
            <Sparkles />
          </span>
          <span className="welcome-star s2">
            <Sparkles />
          </span>
          <CharacterAvatar avatar="🐰" />
          <span className="welcome-gift">
            <Gift size={48} />
          </span>
          {[0, 1, 2, 3, 4].map((i) => (
            <span className={'welcome-coin c' + i} key={i}>
              <Coins />
            </span>
          ))}
        </div>
        <div className="welcome-message">
          <DialogTitle>
            {received
              ? newlyGranted
                ? '선물을 받았어요!'
                : '이미 받은 선물이에요'
              : '오늘의 출석 선물'}
          </DialogTitle>
          <DialogDescription>
            {received
              ? otherProfile
                ? '연결된 다른 프로필에서 이미 받은 선물이에요.'
                : '오늘도 콩알친구들과 즐겁게 놀아요.'
              : '토콩이가 오늘의 선물을 준비했어요.'}
          </DialogDescription>
        </div>
        <div className="welcome-gold">
          <Coins size={28} />
          <strong>
            {received && newlyGranted ? '+' : ''}
            {offer?.gold ?? 50}
          </strong>
          <span>G</span>
          {received && <Check size={24} />}
        </div>
        {error && (
          <p className="welcome-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="welcome-primary"
          disabled={busy}
          onClick={() => (received ? setOpen(false) : void claim())}
        >
          {busy ? '선물 여는 중…' : received ? '좋아, 시작하자!' : '선물 받기'}
        </button>
        {!received ? (
          <button className="welcome-later" onClick={() => setOpen(false)}>
            나중에 받기
          </button>
        ) : (
          <a className="welcome-later" href="/shop">
            상점 구경하기 →
          </a>
        )}
      </DialogContent>
    </Dialog>
  );
}
