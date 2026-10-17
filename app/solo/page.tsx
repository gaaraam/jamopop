'use client';
import { GuestRecords } from '@/components/game/guest-records';
import { ServiceHeader } from '@/components/game/service-header';
import { GameInput } from '@/components/game/mobile-controls';
import { draftKey, readDraft, writeDraft } from '@/lib/recovery.mjs';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Star, House, Sparkles } from 'lucide-react';
import { ThemeSwitch } from '@/components/theme';
import { KEYS, splitWord, type Color } from '@/lib/game';
import type { Stage, SoloRun, SoloState } from '@/lib/solo';
import './solo.css';
import { appendKey, blocksEnter, inputShape } from '@/lib/input';
import { CHAPTERS } from '@/lib/solo-story';
import { SoloRewards } from '@/components/game/solo-rewards';
import { soloRewardIds } from '@/lib/skins';
import { CharacterAvatar } from '@/components/game/character-avatar';
const FLOOR_FRIENDS = ['🐱', '🐰', '🐻', '🦊', '🐧'];
const FRIEND_NAMES = ['냥콩', '토콩', '곰콩', '폭콩', '펭콩'];
type View = Omit<SoloState, 'active' | 'recent'> & {
  active: (Omit<SoloRun, 'answer'> & { answer?: string }) | null;
  stages: Stage[];
  unlocked: number;
  signedIn: boolean;
  serverNow: number;
};
export default function Solo() {
  const quickStarted = useRef(false);
  const [recordsChecked, setRecordsChecked] = useState(false),
    [guestSoloPending, setGuestSoloPending] = useState(false);
  const recordsReady = useCallback((pending: boolean) => {
    setRecordsChecked(true);
    setGuestSoloPending(pending);
  }, []);
  const [quickError, setQuickError] = useState(false);
  const [pickedFloor, setPickedFloor] = useState<number | null>(null);
  const [data, setData] = useState<View | null>(null),
    [draft, setDraftState] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [now, setNow] = useState(Date.now()),
    [onMap, setOnMap] = useState(true),
    [connected, setConnected] = useState(true);
  const [inputError, setInputError] = useState('');
  const latestRun = useRef<View['active']>(null),
    textRef = useRef('');
  function setDraft(value: string | ((s: string) => string)) {
    const text = typeof value === 'function' ? value(textRef.current) : value;
    textRef.current = text;
    setDraftState(text);
    setInputError('');
    const r = latestRun.current;
    if (r) writeDraft(localStorage, draftKey('solo', r.id), r.guesses.length, text);
  }
  const refreshing = useRef(false);
  const lock = useRef(false),
    sequence = useRef(0),
    offset = useRef(0),
    composing = useRef(false),
    ended = useRef(0),
    input = useRef<HTMLInputElement>(null),
    initial = useRef(true),
    runId = useRef<string | null>(null);
  const accept = useCallback((d: View) => {
    const previous = latestRun.current;
    latestRun.current = d.active;
    const r = d.active;
    if (
      runId.current !== r?.id ||
      previous?.guesses.length !== r?.guesses.length ||
      r?.status !== 'playing'
    ) {
      runId.current = r?.id || null;
      const text =
        r?.status === 'playing'
          ? readDraft(localStorage, draftKey('solo', r.id), r.guesses.length)
          : '';
      textRef.current = text;
      setDraftState(text);
    }
    offset.current = d.serverNow - Date.now();
    setData(d);
    setNow(d.serverNow);
    setConnected(true);
    setError('');
    if (initial.current) {
      initial.current = false;
      setOnMap(!d.active || d.active.status !== 'playing');
    }
  }, []);
  const refresh = useCallback(async () => {
    if (lock.current || refreshing.current) return;
    refreshing.current = true;
    const revision = ++sequence.current;
    try {
      const response = await fetch('/api/solo', { signal: AbortSignal.timeout(10000) });
      const d = (await response.json()) as View & { error?: string };
      if (revision !== sequence.current) return;
      if (!response.ok) throw Error(d.error);
      accept(d);
    } catch (e) {
      if (revision === sequence.current) {
        setConnected(false);
        setError('재연결 중 · 입력은 보관되어 있어요.');
      }
    } finally {
      refreshing.current = false;
    }
  }, [accept]);
  useEffect(() => {
    void refresh();
    const tick = setInterval(() => setNow(Date.now() + offset.current), 250);
    const focus = () => {
      if (!document.hidden) void refresh();
    };
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', focus);
    return () => {
      clearInterval(tick);
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', focus);
      sequence.current++;
    };
  }, [refresh]);
  useEffect(() => {
    const online = () => void refresh(),
      offline = () => {
        setConnected(false);
        setError('재연결 중 · 입력은 보관되어 있어요.');
      };
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, [refresh]);
  const active = data?.active,
    stage = active ? data?.stages[active.stage - 1] : undefined;
  const remaining = active?.endsAt ? Math.max(0, Math.ceil((active.endsAt - now) / 1000)) : null;
  const stopped = active?.status !== 'playing' || remaining === 0;
  useEffect(() => {
    if (remaining === 0 && active?.status === 'playing') void refresh();
  }, [remaining, active?.status, refresh]);
  async function act(body: Record<string, unknown>) {
    if (lock.current) return;
    lock.current = true;
    sequence.current++;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/solo', {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = (await response.json()) as View & { error?: string };
      if (!response.ok) {
        if (response.status === 400 && body.action === 'guess') {
          setInputError(d.error || '등록된 단어가 아니에요. 다른 단어를 입력해 주세요.');
          return false;
        }
        if (response.status === 409) {
          lock.current = false;
          await refresh();
        }
        throw Error(d.error);
      }
      accept(d);
      if (body.action === 'start' || body.action === 'guess') setDraft('');
      if (body.action === 'start') setOnMap(false);
      return true;
    } catch (e) {
      if (e instanceof TypeError || ['TimeoutError', 'AbortError'].includes((e as Error).name))
        setConnected(false);
      setError((e as Error).message || '연결을 확인한 뒤 다시 시도해 주세요.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function startNext() {
    setQuickError(false);
    if (!data) return;
    const ok = await act({
      action: 'start',
      stage: data.unlocked,
      previousId: data.active?.id || null,
    });
    if (!ok) setQuickError(true);
  }
  useEffect(() => {
    if (
      !data ||
      !recordsChecked ||
      guestSoloPending ||
      quickStarted.current ||
      !new URLSearchParams(location.search).has('start')
    )
      return;
    quickStarted.current = true;
    if (data.active?.status === 'playing') {
      setOnMap(false);
      return;
    }
    void startNext();
  }, [data, recordsChecked, guestSoloPending]);
  function submit() {
    if (
      !active ||
      !connected ||
      !stage ||
      stopped ||
      composing.current ||
      Date.now() - ended.current < 100 ||
      !inputShape(draft.trim(), stage.width).valid
    )
      return;
    void act({ action: 'guess', runId: active.id, expected: active.guesses.length, word: draft });
  }
  const letters = splitWord(draft),
    colors: Record<string, Color> = {};
  for (const g of active?.guesses || [])
    g.letters.forEach((key, i) => {
      const strength = { gray: 1, yellow: 2, green: 3 };
      if (!colors[key] || strength[g.colors[i]] > strength[colors[key]]) colors[key] = g.colors[i];
    });
  const chapter = CHAPTERS[Math.floor(((stage?.id || data?.unlocked || 1) - 1) / 3)];
  const mapChapter = CHAPTERS[(pickedFloor ?? chapter.id) - 1];
  const mapFirst = (mapChapter.id - 1) * 3 + 1;
  const mapComplete = [mapFirst, mapFirst + 1, mapFirst + 2].every((n) => data?.best[n]);
  const stars = Object.values(data?.best || {}).reduce((a, b) => a + b, 0);
  return (
    <main className="solo-page glass" data-playing={!onMap}>
      <ServiceHeader
        active="solo"
        playOnly={
          !data ||
          (!Object.keys(data.best).length && (!data.active || data.active.status === 'playing'))
        }
      />
      {!data ? (
        <section className="solo-loading">
          <p>{error || '도전 기록을 불러오는 중…'}</p>
          <button onClick={() => refresh()}>다시 불러오기</button>
        </section>
      ) : (
        <>
          <div className="solo-summary" aria-label="개인 도전 기록">
            <div className="solo-stat">
              <Star aria-hidden="true" />
              <div>
                <span>획득 별</span>
                <strong>
                  {stars}
                  <small>/ 45</small>
                </strong>
              </div>
            </div>
            <div className="solo-stat">
              <House aria-hidden="true" />
              <div>
                <span>복구한 방</span>
                <strong>
                  {Object.keys(data.best).length}
                  <small>/ 15</small>
                </strong>
              </div>
            </div>
            <div className="solo-stat">
              <Sparkles aria-hidden="true" />
              <div>
                <span>경험치</span>
                <strong>
                  {data.xp.toLocaleString()}
                  <small>XP</small>
                </strong>
              </div>
            </div>
          </div>
          <GuestRecords onReady={recordsReady} showLogin={!!active && stopped} />
          {quickError && (
            <button className="solo-primary" disabled={busy} onClick={() => void startNext()}>
              도전 시작 다시 시도
            </button>
          )}
          <p className="solo-save-note">
            {data.signedIn
              ? '계정에 진행과 보상이 저장됩니다.'
              : '게스트 · 이 브라우저에서 이어할 수 있어요. 쿠키를 삭제하면 기록을 찾을 수 없습니다.'}
          </p>
          {!connected && (
            <button className="text-btn" onClick={() => void refresh()}>
              다시 연결
            </button>
          )}
          {error && (onMap || stopped) && (
            <p className="solo-error" role="alert">
              {error}
            </p>
          )}
          {onMap ? (
            <>
              <section className="kongal-quest-heading">
                <div>
                  <span>콩알친구들 · 단어 복구 작전</span>
                  <h1>콩알 아파트</h1>
                </div>
                <span className="quest-total">
                  {Object.keys(data.best).length}
                  <small> / 15 복구</small>
                </span>
              </section>
              {stars === 45 && (
                <section className="quest-ending" role="status">
                  <CharacterAvatar avatar="🐧" skin="solo-golden-penguin" />
                  <div>
                    <h2>모든 창문에 별이 켜졌어요!</h2>
                    <p>냥콩, 토콩, 곰콩, 폭콩, 펭콩. 다섯 친구의 이름이 모두 돌아왔습니다.</p>
                    <strong>황금별 구조대 펭콩 획득</strong>
                  </div>
                </section>
              )}
              <div className="kongal-quest">
                <section className="quest-building" aria-label="도전할 층 선택">
                  <div className="quest-roof">
                    <span>콩알 APT</span>
                    <i />
                  </div>
                  <div className="quest-floors">
                    {[...CHAPTERS].reverse().map((ch) => {
                      const first = (ch.id - 1) * 3 + 1,
                        available = data.unlocked >= first,
                        done = [first, first + 1, first + 2].every((n) => data.best[n]);
                      return (
                        <button
                          key={ch.id}
                          className={`quest-floor ${done ? 'restored' : ''} ${available ? 'available' : 'sealed'} ${mapChapter.id === ch.id ? 'selected' : ''}`}
                          aria-pressed={mapChapter.id === ch.id}
                          aria-label={`${ch.id}층 ${FRIEND_NAMES[ch.id - 1]} · ${done ? '복구 완료' : available ? '도전 가능' : '아직 잠김'}`}
                          style={{ '--floor-color': ch.color } as React.CSSProperties}
                          onClick={() => setPickedFloor(ch.id)}
                        >
                          <span className="quest-floor-number">
                            {ch.id === 5 ? 'R' : ch.id}
                            <small>{ch.id === 5 ? '옥상' : '층'}</small>
                          </span>
                          <span className="quest-friend">
                            <CharacterAvatar avatar={FLOOR_FRIENDS[ch.id - 1]} />
                          </span>
                          <span className="quest-windows">
                            {[first, first + 1, first + 2].map((n) => (
                              <i
                                key={n}
                                className={data.best[n] ? 'lit' : n <= data.unlocked ? 'next' : ''}
                              >
                                {data.best[n] ? (
                                  <Star size={16} fill="currentColor" aria-hidden="true" />
                                ) : n <= data.unlocked ? (
                                  '·'
                                ) : (
                                  '−'
                                )}
                              </i>
                            ))}
                          </span>
                          <span className="quest-floor-state">
                            {done ? '완료' : available ? '도전' : '잠김'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="quest-building-base">
                    <i />
                    <span>한 단어씩, 불을 켜 주세요.</span>
                    <i />
                  </div>
                </section>
                <section
                  className="quest-destination"
                  style={{ '--floor-color': mapChapter.color } as React.CSSProperties}
                  aria-label="선택한 층"
                >
                  <div className="quest-destination-top">
                    <span>{mapChapter.id === 5 ? '옥상' : `${mapChapter.id}층`}</span>
                    <b>
                      {mapComplete
                        ? '복구 완료'
                        : data.unlocked >= mapFirst
                          ? '도전 가능'
                          : '아직 잠겨 있어요'}
                    </b>
                  </div>
                  <div className="quest-character-scene">
                    <span className="quest-speech">
                      {mapComplete
                        ? '우리 방에 불이 돌아왔어!'
                        : data.unlocked >= mapFirst
                          ? '같이 단어를 찾아볼래?'
                          : '아래층에서 기다릴게!'}
                    </span>
                    <CharacterAvatar
                      avatar={FLOOR_FRIENDS[mapChapter.id - 1]}
                      skin={
                        mapComplete
                          ? (
                              {
                                1: 'solo-detective-cat',
                                3: 'solo-archive-bear',
                                5: 'solo-rescue-penguin',
                              } as Record<number, string>
                            )[mapChapter.id]
                          : undefined
                      }
                    />
                    <span className="quest-scene-shadow" />
                  </div>
                  <h2>
                    {FRIEND_NAMES[mapChapter.id - 1]}의{' '}
                    {['탕비실', '회의실', '자료실', '관제실', '옥상'][mapChapter.id - 1]}
                  </h2>
                  <p className="quest-mission">{mapChapter.mission}</p>
                  <div className="quest-stage-list">
                    {data.stages.slice(mapFirst - 1, mapFirst + 2).map((s) => {
                      const best = data.best[s.id] || 0,
                        locked = s.id > data.unlocked,
                        ongoing = active?.status === 'playing',
                        resume = ongoing && active.stage === s.id;
                      return (
                        <button
                          key={s.id}
                          className={`quest-stage ${s.id === data.unlocked ? 'current' : ''}`}
                          disabled={locked || busy || (ongoing && !resume)}
                          onClick={() => {
                            if (resume) setOnMap(false);
                            else
                              void act({
                                action: 'start',
                                stage: s.id,
                                previousId: active?.id || null,
                              });
                          }}
                        >
                          <span className="quest-stage-number">
                            {String(s.id).padStart(2, '0')}
                          </span>
                          <span>
                            <strong>{s.name}</strong>
                            <small>
                              {s.width}칸 · {s.attempts}회 ·{' '}
                              {s.seconds ? `${s.seconds / 60}분` : '시간 무제한'}
                            </small>
                          </span>
                          <span className="quest-stage-action">
                            {locked
                              ? '잠김'
                              : resume
                                ? '이어하기 →'
                                : best
                                  ? '다시 도전'
                                  : '시작 →'}
                            <small aria-label={`최고 별점 ${best}개`}>
                              {[1, 2, 3].map((n) => (
                                <Star
                                  key={n}
                                  size={13}
                                  fill={n <= best ? 'currentColor' : 'none'}
                                  aria-hidden="true"
                                />
                              ))}
                            </small>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <details className="quest-story">
                    <summary>이 방의 이야기</summary>
                    <p>{mapComplete ? mapChapter.done : mapChapter.intro}</p>
                  </details>
                </section>
              </div>
              {(active?.status === 'playing' && active.stage < mapFirst) ||
              (active?.status === 'playing' && active.stage > mapFirst + 2) ? (
                <button className="solo-resume" onClick={() => setOnMap(false)}>
                  <b>{active.stage}단계 진행 중</b>
                  <span>이어서 도전 →</span>
                </button>
              ) : null}
              <SoloRewards best={data.best} signedIn={data.signedIn} />
              <details className="solo-how">
                <summary>진행과 보상 안내</summary>
                <p>
                  단어를 입력해 초록·노랑·회색 단서를 확인하세요. 초록은 위치 일치, 노랑은 다른
                  위치, 회색은 미포함입니다. 칸 수는 풀어 쓴 자모 수입니다.
                </p>
                <p>
                  처음 클리어하면 30XP, 최고 별 하나당 20XP를 받습니다. 같은 별점을 다시 얻으면 추가
                  보상은 없어요. 회원은 기존 레벨과 꾸미기 해금에 반영됩니다. 게스트 보상은 개인
                  도전 안에 저장되며 계정 연동 시 자동 이전되지 않습니다.
                </p>
                <p>
                  남은 기회가 3회 이상이면 별 3개, 1회 이상이면 별 2개, 마지막 기회에 맞히면 별
                  1개입니다. 다음 단계로 갈수록 시간·기회·어휘 범위가 달라집니다. 재도전하면 새
                  단어가 나오지만 새로고침은 같은 도전을 이어갑니다.
                </p>
              </details>
            </>
          ) : stage && active ? (
            <section className="solo-play">
              <div className="solo-play-heading">
                <button onClick={() => setOnMap(true)}>← 스테이지</button>
                <span>STAGE {String(stage.id).padStart(2, '0')}</span>
                <b className={remaining !== null && remaining <= 30 ? 'urgent' : ''} role="timer">
                  {remaining === null
                    ? '∞'
                    : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`}
                </b>
              </div>
              <div className="mission-banner">
                <span>{chapter.icon}</span>
                <div>
                  <small>
                    {chapter.place} · {chapter.mission}
                  </small>
                  <h1>{stage.name}</h1>
                </div>
              </div>
              <details className="solo-mission-story">
                <summary>층 이야기</summary>
                <p>{chapter.intro}</p>
              </details>
              <p className="solo-play-meta">
                {stage.width}칸{' '}
                <span>
                  남은 기회 {Math.max(0, stage.attempts - active.guesses.length)} / {stage.attempts}
                </span>
              </p>
              <div
                className="solo-board main-board"
                style={
                  {
                    gridTemplateColumns: `repeat(${stage.width},1fr)`,
                    '--board-columns': stage.width,
                    '--board-rows': stage.attempts,
                  } as React.CSSProperties
                }
                aria-label="개인 도전 게임판"
              >
                {Array.from({ length: stage.attempts }, (_, r) =>
                  Array.from({ length: stage.width }, (_, c) => {
                    const g = active.guesses[r];
                    return (
                      <span
                        key={`${active.id}-${r}-${c}`}
                        className={`solo-tile tile ${g?.colors[c] || ''} ${!g && r === active.guesses.length ? 'current-row' : ''}`}
                      >
                        {g?.letters[c] ||
                          (!stopped && r === active.guesses.length ? letters[c] : '')}
                      </span>
                    );
                  }),
                )}
              </div>
              {stopped ? (
                <div className="solo-result">
                  <strong>
                    {active.status === 'won'
                      ? '클리어!'
                      : active.status === 'abandoned'
                        ? '도전을 종료했어요'
                        : remaining === 0
                          ? '시간 종료'
                          : '기회를 모두 사용했어요'}
                  </strong>
                  {active.answer && (
                    <p>
                      정답 <b>{active.answer}</b>
                    </p>
                  )}
                  {active.status === 'won' && (
                    <p className="story-clear">
                      {stage.id % 3 === 0
                        ? chapter.done
                        : '찾았다! 이름표에 글자가 하나씩 돌아오고 있어.'}
                    </p>
                  )}
                  {active.status === 'won' && stage.id % 3 === 0 && (
                    <div className="solo-friend-thanks">
                      <CharacterAvatar
                        avatar={FLOOR_FRIENDS[chapter.id - 1]}
                        skin={
                          (
                            {
                              1: 'solo-detective-cat',
                              3: 'solo-archive-bear',
                              5: 'solo-rescue-penguin',
                            } as Record<number, string>
                          )[chapter.id]
                        }
                      />
                      <p>
                        함께해 줘서 고마워!
                        <br />
                        {chapter.id === 5
                          ? '우리 동네에 단어가 돌아왔어.'
                          : '다음 층 친구도 도와줄래?'}
                      </p>
                    </div>
                  )}
                  {active.status === 'won' && (
                    <div
                      className="solo-clear-stars"
                      aria-label={`최고 별점 ${data.best[stage.id]}개`}
                    >
                      {[1, 2, 3].map((n) => (
                        <Star
                          key={n}
                          size={26}
                          fill={n <= data.best[stage.id] ? 'currentColor' : 'none'}
                          aria-hidden="true"
                        />
                      ))}
                    </div>
                  )}
                  <div>
                    <button
                      disabled={busy}
                      onClick={() =>
                        act({ action: 'start', stage: stage.id, previousId: active.id })
                      }
                    >
                      새 단어로 다시 도전
                    </button>
                    {active.status === 'won' && stage.id < 15 && (
                      <button
                        className="solo-primary"
                        disabled={busy}
                        onClick={() =>
                          act({ action: 'start', stage: stage.id + 1, previousId: active.id })
                        }
                      >
                        다음 스테이지 →
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <form
                  id="solo-guess-form"
                  className="input-area"
                  onSubmit={(e) => {
                    e.preventDefault();
                    submit();
                  }}
                >
                  <GameInput
                    ref={input}
                    aria-label="도전 단어 입력"
                    aria-describedby="solo-input-status"
                    aria-invalid={
                      !!inputError || (!!draft && !inputShape(draft, stage.width).valid)
                    }
                    value={draft}
                    onChange={(e) => {
                      if (!lock.current) setDraft(e.target.value.slice(0, 32));
                    }}
                    onCompositionStart={() => {
                      composing.current = true;
                    }}
                    onCompositionEnd={(e) => {
                      composing.current = false;
                      ended.current = Date.now();
                      if (!lock.current) setDraft(e.currentTarget.value.slice(0, 32));
                    }}
                    onKeyDown={(e) => {
                      if (
                        e.key === 'Enter' &&
                        blocksEnter(e.nativeEvent, composing.current, ended.current)
                      )
                        e.preventDefault();
                    }}
                    readOnly={busy}
                    aria-busy={busy}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={`${stage.width}칸 단어 입력`}
                  />
                  <span
                    id="solo-input-status"
                    className={`solo-input-status ${inputError || error || (draft && !inputShape(draft, stage.width).valid) ? 'invalid' : ''}`}
                    role="status"
                    aria-live="polite"
                  >
                    {inputError ||
                      error ||
                      (letters.length > stage.width
                        ? `${letters.length} / ${stage.width}칸 · ${letters.length - stage.width}칸 줄여 주세요`
                        : letters.length < stage.width
                          ? `${letters.length} / ${stage.width}칸 입력`
                          : !inputShape(draft, stage.width).valid
                            ? '한글 자음과 모음으로 입력해 주세요.'
                            : '제출할 수 있어요')}
                  </span>
                </form>
              )}
              <div className="solo-keyboard keyboard" aria-label="도전 한글 자판">
                {KEYS.map((row, i) => (
                  <div key={row}>
                    {[...row].map((k) => (
                      <button
                        type="button"
                        key={k}
                        className={`key ${colors[k] || ''}`}
                        disabled={busy || stopped}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          if (!lock.current && !composing.current) {
                            const next = appendKey(textRef.current, k, stage.width);
                            if (next === textRef.current)
                              setInputError(`${stage.width}칸까지 입력할 수 있어요.`);
                            else setDraft(next);
                          }
                          if (window.matchMedia('(hover:hover) and (pointer:fine)').matches)
                            input.current?.focus();
                        }}
                      >
                        {k}
                      </button>
                    ))}
                    {i === 0 && (
                      <button
                        type="button"
                        className="key"
                        aria-label="한 칸 삭제"
                        disabled={busy || stopped}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          if (!lock.current && !composing.current)
                            setDraft((value) => splitWord(value).slice(0, -1).join(''));
                          if (window.matchMedia('(hover:hover) and (pointer:fine)').matches)
                            input.current?.focus();
                        }}
                      >
                        ⌫
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {!stopped && (
                <button
                  type="submit"
                  form="solo-guess-form"
                  className="solo-primary solo-submit"
                  disabled={busy || !connected || !inputShape(draft, stage.width).valid}
                >
                  {busy ? '확인 중…' : '제출하기'}
                </button>
              )}
              {stopped && active.status === 'won' && soloRewardIds(data.best).length > 0 && (
                <SoloRewards best={data.best} signedIn={data.signedIn} celebrate />
              )}
              <div className="legend">
                <span>
                  <i className="green" />
                  위치 일치
                </span>
                <span>
                  <i className="yellow" />
                  다른 위치
                </span>
                <span>
                  <i className="gray" />
                  미포함
                </span>
              </div>
              {!stopped && (
                <button
                  className="solo-abandon"
                  disabled={busy}
                  onClick={() => {
                    if (confirm('이번 도전을 종료할까요? 재도전은 새 단어로 시작합니다.'))
                      void act({ action: 'abandon', runId: active.id });
                  }}
                >
                  이번 도전 포기
                </button>
              )}
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}
