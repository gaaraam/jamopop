'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, Copy, ArrowRight, Check, Clock3, Trophy, ShieldCheck } from 'lucide-react';
import { ServiceHeader } from '@/components/game/service-header';
import { CharacterAvatar } from '@/components/game/character-avatar';
import { WordBoard, WordKeyboard } from '@/components/game/word-controls';
import { GameInput } from '@/components/game/mobile-controls';
import { appendKey, blocksEnter, inputShape } from '@/lib/input';
import { splitWord, type Color } from '@/lib/game';
import { dailyShare, type DailyView } from '@/lib/daily';
import { draftKey, readDraft, writeDraft } from '@/lib/recovery.mjs';

export function DailyGame() {
  const [data, setData] = useState<DailyView | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(true);
  const [shareNote, setShareNote] = useState('');
  const [manualCopy, setManualCopy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const current = useRef<DailyView | null>(null);
  const lock = useRef(false),
    refreshing = useRef(false),
    offset = useRef(0);
  const composition = useRef(false),
    ended = useRef(0),
    midnight = useRef('');
  const input = useRef<HTMLInputElement>(null);
  const accept = useCallback((next: DailyView) => {
    const previous = current.current;
    current.current = next;
    if (
      !previous ||
      previous.day !== next.day ||
      previous.guesses.length !== next.guesses.length ||
      previous.signedIn !== next.signedIn ||
      next.status !== 'playing'
    ) {
      setDraft(
        next.status === 'playing'
          ? readDraft(sessionStorage, draftKey('daily', next.day), next.guesses.length)
          : '',
      );
    }
    offset.current = next.serverNow - Date.now();
    setData(next);
    setNow(next.serverNow);
    setConnected(true);
    if (previous?.day !== next.day) {
      setManualCopy(false);
      setShareNote('');
    }
  }, []);
  const refresh = useCallback(async () => {
    if (lock.current || refreshing.current) return;
    refreshing.current = true;
    setLoading(true);
    try {
      const r = await fetch('/api/daily', { signal: AbortSignal.timeout(10000) });
      const body = (await r.json()) as DailyView & { error?: string };
      if (!r.ok) throw Error(body.error);
      accept(body);
      setError('');
    } catch {
      setConnected(false);
      setError('연결을 확인해 주세요. 입력은 보관되어 있어요.');
    } finally {
      refreshing.current = false;
      setLoading(false);
    }
  }, [accept]);
  useEffect(() => {
    void refresh();
    const tick = setInterval(() => setNow(Date.now() + offset.current), 1000);
    const focus = () => {
      if (!document.hidden) void refresh();
    };
    const offline = () => setConnected(false);
    window.addEventListener('focus', focus);
    window.addEventListener('online', focus);
    window.addEventListener('offline', offline);
    document.addEventListener('visibilitychange', focus);
    return () => {
      clearInterval(tick);
      window.removeEventListener('focus', focus);
      window.removeEventListener('online', focus);
      window.removeEventListener('offline', offline);
      document.removeEventListener('visibilitychange', focus);
    };
  }, [refresh]);
  useEffect(() => {
    if (data && now >= data.resetsAt && midnight.current !== data.day && !busy) {
      midnight.current = data.day;
      void refresh();
    }
  }, [data, now, busy, refresh]);
  useEffect(() => {
    if (data?.status === 'playing' && matchMedia('(pointer:fine)').matches)
      input.current?.focus({ preventScroll: true });
  }, [data?.day, data?.guesses.length, data?.status]);
  function change(value: string) {
    if (lock.current) return;
    setDraft(value.slice(0, 32));
    setError('');
    const d = current.current;
    if (d) writeDraft(sessionStorage, draftKey('daily', d.day), d.guesses.length, value);
    if (matchMedia('(pointer:fine)').matches) input.current?.focus({ preventScroll: true });
  }
  async function submit() {
    const d = current.current;
    if (
      !d ||
      d.status !== 'playing' ||
      lock.current ||
      refreshing.current ||
      !inputShape(draft, 5).valid ||
      Date.now() + offset.current >= d.resetsAt
    )
      return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day: d.day, expected: d.guesses.length, word: draft }),
        signal: AbortSignal.timeout(10000),
      });
      const body = (await r.json()) as DailyView & { error?: string };
      if (!r.ok) {
        if (r.status === 409) {
          lock.current = false;
          await refresh();
        }
        throw Error(body.error || '제출하지 못했어요. 다시 시도해 주세요.');
      }
      writeDraft(sessionStorage, draftKey('daily', d.day), d.guesses.length, '');
      accept(body);
      setDraft('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '연결을 확인해 주세요.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function share() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(dailyShare(data));
      setShareNote('복사했어요!');
    } catch {
      setManualCopy(true);
      setShareNote('아래 결과를 선택해 복사해 주세요.');
    }
  }
  const letters = splitWord(draft),
    finished = !!data && data.status !== 'playing';
  const colors: Record<string, Color> = {},
    priority = { gray: 1, yellow: 2, green: 3 };
  data?.guesses.forEach((g) =>
    g.letters.forEach((l, i) => {
      if (!colors[l] || priority[g.colors[i]] > priority[colors[l]]) colors[l] = g.colors[i];
    }),
  );
  const valid = inputShape(draft, 5).valid;
  const feedback =
    error ||
    (letters.length > 5
      ? `${letters.length}/5칸 · ${letters.length - 5}칸 줄여 주세요`
      : letters.length === 5 && !valid
        ? '한글 자음과 모음으로 입력해 주세요.'
        : `${letters.length}/5칸`);
  const remaining = data ? Math.max(0, Math.ceil((data.resetsAt - now) / 1000)) : 0;
  return (
    <main className="daily-page refined glass">
      <ServiceHeader active="daily" title="자음모음팝" playOnly />
      <section className="daily-game game-panel" aria-label="오늘의 단어">
        <div className="daily-heading">
          <div>
            <span>
              <CalendarDays size={15} />
              {data?.day || '오늘'}
            </span>
            <h2>오늘의 단어</h2>
          </div>
          <CharacterAvatar avatar="🐱" />
        </div>
        <details className="daily-help">
          <summary>처음이라면?</summary>
          <p>
            바람 → ㅂ ㅏ ㄹ ㅏ ㅁ. 다섯 자모의 단어를 다섯 번 안에 맞혀 보세요. 초록은 제자리,
            노랑은 다른 자리, 회색은 미포함 또는 개수 초과예요.
          </p>
        </details>
        {!data ? (
          <div role="status">
            <p>{error || '문제를 불러오는 중…'}</p>
            <button onClick={() => void refresh()}>다시 연결</button>
          </div>
        ) : (
          <>
            <WordBoard
              roundId={data.day}
              width={5}
              guesses={data.guesses}
              letters={letters}
              isFinished={finished}
              pending={busy}
            />
            {!finished && (
              <>
                <form
                  className="input-area"
                  id="daily-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!blocksEnter({}, composition.current, ended.current)) void submit();
                  }}
                >
                  <GameInput
                    ref={input}
                    value={draft}
                    aria-label="오늘의 단어 입력"
                    aria-describedby="daily-feedback"
                    aria-invalid={!!error || letters.length > 5}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="5칸 단어 입력"
                    readOnly={busy}
                    onChange={(e) => change(e.target.value)}
                    onCompositionStart={() => {
                      composition.current = true;
                    }}
                    onCompositionEnd={(e) => {
                      composition.current = false;
                      ended.current = Date.now();
                      change(e.currentTarget.value);
                    }}
                    onKeyDown={(e) => {
                      if (
                        e.key === 'Enter' &&
                        blocksEnter(e.nativeEvent, composition.current, ended.current)
                      )
                        e.preventDefault();
                    }}
                  />
                  <span
                    id="daily-feedback"
                    role="status"
                    className={error || letters.length > 5 ? 'daily-error' : ''}
                  >
                    {feedback}
                  </span>
                </form>
                <WordKeyboard
                  keyboardColors={colors}
                  disabled={busy}
                  onKey={(key) =>
                    change(
                      key === 'Backspace'
                        ? splitWord(draft).slice(0, -1).join('')
                        : appendKey(draft, key, 5),
                    )
                  }
                />
                <button
                  className="primary submit daily-submit"
                  form="daily-form"
                  disabled={!valid || busy || loading || now >= data.resetsAt}
                >
                  {busy ? '확인 중…' : loading ? '기록 확인 중…' : '제출하기'}
                </button>
              </>
            )}
            {finished && (
              <div className={`daily-result ${data.status === 'won' ? 'is-won' : ''}`}>
                <div className="daily-result-summary">
                  <div className="daily-result-mascot">
                    <CharacterAvatar avatar={data.status === 'won' ? '🐱' : '🐰'} />
                    <span>
                      {data.status === 'won' ? <Trophy size={18} /> : <Check size={18} />}
                    </span>
                  </div>
                  <div className="daily-result-title">
                    <h3>{data.status === 'won' ? '오늘도 해결!' : '오늘의 도전 완료'}</h3>
                    <p>
                      오늘의 정답 <strong>{data.answer}</strong>
                    </p>
                  </div>
                  <div className="daily-result-score" aria-label={`${data.guesses.length}회 시도`}>
                    <strong>{data.guesses.length}</strong>
                    <span>/ 5회</span>
                  </div>
                </div>
                <button className="primary daily-share" onClick={() => void share()}>
                  {shareNote === '복사했어요!' ? <Check size={18} /> : <Copy size={18} />}
                  <span role="status">
                    {shareNote === '복사했어요!' ? '결과 복사 완료' : '결과 공유'}
                  </span>
                </button>
                {manualCopy && (
                  <div className="daily-copy-fallback">
                    <p role="status">{shareNote}</p>
                    <textarea
                      aria-label="공유할 결과"
                      readOnly
                      value={dailyShare(data)}
                      onFocus={(e) => e.currentTarget.select()}
                    />
                  </div>
                )}
                <div className="daily-next">
                  <div>
                    <Clock3 size={16} />
                    <span>다음 단어</span>
                    <strong>
                      {String(Math.floor(remaining / 3600)).padStart(2, '0')}:
                      {String(Math.floor((remaining % 3600) / 60)).padStart(2, '0')}
                    </strong>
                  </div>
                  <a href="/solo">
                    개인 도전 <ArrowRight size={16} />
                  </a>
                </div>
              </div>
            )}
            {(!connected || (error && finished) || now >= data.resetsAt) && (
              <button className="text-btn" onClick={() => void refresh()}>
                기록 다시 불러오기
              </button>
            )}
            <details className="daily-save">
              <summary>
                <ShieldCheck size={13} />
                {data.signedIn ? '계정에 저장됨' : '이 브라우저에 저장됨'}
              </summary>
              <p>
                {data.signedIn
                  ? '같은 계정으로 다시 접속하면 기록을 확인할 수 있어요.'
                  : '게스트 기록은 이 브라우저에서만 확인할 수 있어요. 쿠키를 삭제하면 복구할 수 없어요.'}{' '}
                새 문제는 한국시간 00:00에 열려요.
              </p>
            </details>
          </>
        )}
      </section>
    </main>
  );
}
