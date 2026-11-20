import { GameInput } from '@/components/game/mobile-controls';
import { RoundResult } from '@/components/game/round-result';
import { splitWord } from '@/lib/game';
import { blocksEnter, inputShape } from '@/lib/input';
import { WordBoard, WordKeyboard } from '@/components/game/word-controls';
import { Users, Clock, RotateCcw } from 'lucide-react';
import type { SpeedGame } from './use-speed-game';
export function SpeedRound({
  theme,
  setTheme,
  busy,
  pressed,
  shake,
  isComposing,
  setIsComposing,
  reveal,
  press,
  room,
  data,
  draft,
  connected,
  lock,
  composing,
  compositionEnd,
  input,
  update,
  switchMode,
  width,
  act,
  round,
  play,
  puzzle,
  letters,
  countdown,
  remaining,
  ended,
  stopped,
  submit,
  typeKey,
  keyColors,
  selectedTheme,
}: SpeedGame) {
  return (
    <section className="game-panel">
      <div className="game-heading">
        <h1>스피드전</h1>
        <span className="day-stamp">
          {selectedTheme ? `${selectedTheme.emoji} ${selectedTheme.name}` : '5문제 묶음'}
        </span>
      </div>
      <div
        className={`round-timer ${remaining <= 30 ? 'urgent' : ''}`}
        role="timer"
        aria-label={`남은 시간 ${remaining}초`}
      >
        <Clock size={15} />
        <strong>
          {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
        </strong>
        <span>
          {round ? `${Math.min((play?.current || 0) + 1, 5)} / 5번 문제` : '방 공통 제한시간'}
        </span>
      </div>
      {(!round || round.canStart) && data.room.isHost && (
        <details className="speed-setup" open={!round || !data.room.active}>
          <summary>다음 판 설정</summary>
          <div className="round-controls">
            <select
              aria-label="스피드전 주제"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
            >
              {data.themes.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.emoji} {t.name}
                </option>
              ))}
            </select>
            <button
              className="secondary-btn next-round-ready"
              disabled={busy || !data.room.canStart}
              onClick={() => void act('start', { theme })}
            >
              <RotateCcw size={15} />
              {round ? '새 묶음 시작' : '3초 후 시작'}
            </button>
            {data.room.active && (
              <>
                <button
                  className="secondary-btn"
                  disabled={busy}
                  onClick={() => void switchMode('normal')}
                >
                  일반전으로
                </button>
                <button
                  className="secondary-btn"
                  disabled={busy}
                  onClick={() => void switchMode('items')}
                >
                  아이템전으로
                </button>
              </>
            )}
          </div>
          {!data.room.canStart && <p role="status">풀이 중인 참가자가 있어요.</p>}
        </details>
      )}
      <nav className="speed-problems" aria-label="묶음 진행">
        {Array.from({ length: 5 }, (_, i) => {
          const p = play?.puzzles[i];
          return (
            <button
              key={i}
              aria-label={`${i + 1}번 문제 ${p?.status === 'won' ? '성공' : p?.status === 'lost' ? '실패' : '미완료'}`}
              aria-current={play?.current === i ? 'step' : undefined}
              className={p?.status || ''}
              disabled={busy || stopped || p?.status !== 'open'}
              onClick={() => void act('select', { index: i })}
            >
              <b>{p?.status === 'won' ? '✓' : p?.status === 'lost' ? '×' : i + 1}</b>
              <small>{round?.widths[i] || '–'}칸</small>
            </button>
          );
        })}
      </nav>
      <div className="board-wrap">
        <div
          className="sheet-columns"
          aria-hidden="true"
          style={{ gridTemplateColumns: `repeat(${width},1fr)` }}
        >
          {Array.from({ length: width }, (_, i) => (
            <span key={i}>{String.fromCharCode(65 + i)}</span>
          ))}
        </div>
        <div className="sheet-rows" aria-hidden="true">
          {[1, 2, 3, 4, 5].map((n) => (
            <span key={n}>{n}</span>
          ))}
        </div>
        <WordBoard
          roundId={round ? `${round.id}:${play.current}` : 'speed-ready'}
          width={width}
          guesses={puzzle?.guesses || []}
          letters={letters}
          isFinished={!!play?.finished || ended}
          locked={!!stopped}
          composing={isComposing}
          pending={busy}
          shake={shake}
          reveal={reveal}
          won={puzzle?.status === 'won'}
        />
        {(!round || countdown > 0 || data.me.spectator) && (
          <div className="countdown-overlay" role="status">
            <small>
              {!round
                ? '방장이 시작하면 함께 풀어요'
                : data.me.spectator
                  ? '관전 중'
                  : '잠시 후 시작'}
            </small>
            {countdown > 0 ? <strong key={countdown}>{countdown}</strong> : <Users size={50} />}
          </div>
        )}
      </div>
      {(play?.finished || ended) && !data.me.spectator ? (
        <RoundResult
          key={round.id}
          room={room}
          round={round.id}
          rank={data.ranking?.find((p: any) => p.id === data.me.id && p.solved > 0)?.rank}
          onNext={data.room.isHost ? () => void act('start', { theme }) : undefined}
          nextDisabled={busy || !connected || !data.room.canStart || !round.canStart}
          waiting={!data.room.isHost}
        />
      ) : (
        <div className="input-area">
          <GameInput
            tileWidth={width}
            ref={input}
            aria-label="단어 입력"
            value={draft}
            readOnly={busy}
            disabled={!!stopped}
            placeholder="단어를 입력하거나 아래 자판을 누르세요"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={32}
            aria-busy={busy}
            onChange={(e) => {
              if (!lock.current) {
                update(e.target.value);
                if (!composing.current) press(splitWord(e.target.value).at(-1) || 'Backspace');
              }
            }}
            onCompositionStart={() => {
              composing.current = true;
              setIsComposing(true);
            }}
            onCompositionEnd={(e) => {
              composing.current = false;
              setIsComposing(false);
              compositionEnd.current = Date.now();
              if (!lock.current) {
                update(e.currentTarget.value);
                press(splitWord(e.currentTarget.value).at(-1) || '');
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229 || composing.current)
                  return;
                e.preventDefault();
                if (!blocksEnter(e.nativeEvent, composing.current, compositionEnd.current))
                  submit();
              }
            }}
          />
          <span className="input-status" role="status">
            {!stopped
              ? inputShape(draft, width).valid
                ? 'Enter로 제출'
                : `${width}칸 단어를 입력해 주세요`
              : ''}
          </span>
        </div>
      )}
      {!(play?.finished || ended) && (
        <>
          <WordKeyboard
            keyboardColors={keyColors}
            pressed={pressed}
            disabled={busy || !!stopped}
            onKey={typeKey}
          />
          <button
            className="primary submit"
            disabled={
              busy || !connected || !!stopped || isComposing || !inputShape(draft, width).valid
            }
            onClick={submit}
          >
            {busy ? (
              <span className="submit-feedback">
                제출 중
                <span aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              </span>
            ) : ended || play?.finished ? (
              '묶음 종료'
            ) : countdown ? (
              '곧 시작합니다'
            ) : (
              '제출하기'
            )}
          </button>
        </>
      )}
      {round && !stopped && (
        <div className="speed-puzzle-actions">
          <button
            className="text-btn"
            disabled={
              busy ||
              !play.puzzles.some((p: any, i: number) => i < play.current && p.status === 'open')
            }
            onClick={() => {
              for (let i = play.current - 1; i >= 0; i--)
                if (play.puzzles[i].status === 'open') {
                  void act('select', { index: i });
                  break;
                }
            }}
          >
            ← 이전 문제
          </button>
          <button
            className="text-btn"
            disabled={busy || play.puzzles.filter((p: any) => p.status === 'open').length <= 1}
            onClick={() => void act('skip')}
          >
            건너뛰기 →
          </button>
        </div>
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
      {ended && play?.answers && (
        <details className="speed-answers">
          <summary>정답 보기</summary>
          <p>{play.answers.map((a: string, i: number) => `${i + 1}. ${a}`).join(' · ')}</p>
        </details>
      )}
    </section>
  );
}
