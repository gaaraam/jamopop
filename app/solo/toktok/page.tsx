'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Lightbulb, RotateCcw, Undo2, Volume2, VolumeX } from 'lucide-react';
import { ServiceHeader } from '@/components/game/service-header';
import { CharacterAvatar } from '@/components/game/character-avatar';
import { ToktokBoard, type ToktokEffect } from '@/components/game/toktok-board';
import {
  GLYPHS,
  PARTS,
  finishedToktok,
  hintToktok,
  tapToktok,
  targetToktok,
  TOKTOK_FEVER,
  TOKTOK_TURNS,
} from '@/lib/jamo-toktok.mjs';
import { readToktok, replayToktok, writeToktok, nextToktokRound } from '@/lib/toktok-progress.mjs';
import { RECENT_SOLO_KEY } from '@/lib/solo-recent.mjs';
import '../challenges.css';
import './toktok.css';
type Progress = {
  seed: number;
  moves: number[];
  best: number;
  rules: number;
  round: number;
  bestRound: number;
};
const empty: Progress = { seed: 1, moves: [], best: 0, rules: 2, round: 1, bestRound: 1 };
function newSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0] || 1;
}
export default function JamoToktok() {
  const [progress, setProgress] = useState<Progress>(empty),
    [ready, setReady] = useState(false),
    [saving, setSaving] = useState(true),
    [message, setMessage] = useState(''),
    [effect, setEffect] = useState<ToktokEffect | null>(null),
    [oldBoard, setOldBoard] = useState<{ ch: number }[] | null>(null),
    [busy, setBusy] = useState(false),
    [highlight, setHighlight] = useState<number | null>(null),
    [sound, setSound] = useState(true);
  const current = useRef(progress),
    locked = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    generation = useRef(0),
    audio = useRef<AudioContext | null>(null),
    soundOn = useRef(true);
  const game = useMemo(
    () => replayToktok(progress.seed, progress.moves, progress)!,
    [progress.seed, progress.moves, progress.rules, progress.round],
  );
  const done = finishedToktok(game),
    target = targetToktok(game),
    won = game.score >= target;
  function stopMotion() {
    generation.current++;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    locked.current = false;
    setBusy(false);
    setOldBoard(null);
    setEffect(null);
  }
  useEffect(() => {
    let saved = empty;
    try {
      saved = readToktok(localStorage, newSeed()) as Progress;
    } catch {
      setSaving(false);
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
    current.current = saved;
    setProgress(saved);
    setReady(true);
    try {
      localStorage.setItem(RECENT_SOLO_KEY, 'toktok');
    } catch {}
    const hide = () => {
      if (document.hidden) stopMotion();
    };
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    document.addEventListener('visibilitychange', hide);
    motion.addEventListener('change', stopMotion);
    return () => {
      generation.current++;
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', hide);
      motion.removeEventListener('change', stopMotion);
      void audio.current?.close().catch(() => {});
    };
  }, []);
  function commit(next: Progress) {
    current.current = next;
    setProgress(next);
    setHighlight(null);
    setMessage('');
    try {
      setSaving(writeToktok(localStorage, next));
    } catch {
      setSaving(false);
    }
  }
  function playSound(level: number) {
    if (!soundOn.current || document.hidden) return;
    try {
      const ctx = (audio.current ??= new AudioContext());
      void ctx.resume().catch(() => {});
      const t = ctx.currentTime;
      for (let i = 0; i < Math.min(6, 2 + level); i++) {
        const osc = ctx.createOscillator(),
          gain = ctx.createGain();
        osc.frequency.value = [392, 494, 587, 784, 988, 1175][i];
        gain.gain.setValueAtTime(0, t + i * 0.045);
        gain.gain.linearRampToValueAtTime(0.035, t + i * 0.045 + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.045 + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t + i * 0.045);
        osc.stop(t + i * 0.045 + 0.2);
        osc.onended = () => {
          osc.disconnect();
          gain.disconnect();
        };
      }
    } catch {}
  }
  function take(index: number) {
    if (!ready || locked.current) return;
    const p = current.current,
      before = replayToktok(p.seed, p.moves, p)!;
    const next = tapToktok(before, index);
    if (!next) {
      if (!finishedToktok(before)) {
        setMessage('붙어 있는 같은 자모 둘 이상을 골라보세요.');
        setHighlight(index);
      }
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    locked.current = true;
    setBusy(true);
    const v = ++generation.current;
    commit({ ...p, moves: [...p.moves, index], best: Math.max(p.best, next.score) });
    setOldBoard(before.board);
    const baseLabel =
      next.triggered > 1
        ? `${next.triggered}연쇄!`
        : next.triggered
          ? `${GLYPHS[before.board[index].ch]} → ${(PARTS[before.board[index].ch as keyof typeof PARTS] as number[]).map((i) => GLYPHS[i]).join(' + ')}`
          : next.earned !== null
            ? `${GLYPHS[next.earned]} 합성!`
            : '톡톡!';
    const label = next.feverUsed ? `피버 ×2 · ${baseLabel}` : baseLabel;
    setEffect({
      id: v,
      cells: next.cells,
      label,
      points: next.points,
      index,
      chain: next.triggered,
      glyph: GLYPHS[before.board[index].ch],
      fever: next.feverUsed,
    });
    playSound(next.feverUsed ? 5 : next.triggered + 1);
    setMessage(
      next.rules === 2 && next.fever === TOKTOK_FEVER
        ? '피버 준비! 다음에 고른 폭발은 점수 2배'
        : `${label} +${next.points.toLocaleString()}점`,
    );
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    timer.current = setTimeout(
      () => {
        if (v !== generation.current) return;
        setOldBoard(null);
        locked.current = false;
        setBusy(false);
        timer.current = setTimeout(
          () => {
            if (v === generation.current) setEffect(null);
          },
          reduce ? 0 : 700,
        );
      },
      reduce ? 0 : 240,
    );
  }
  function restart(advance = false) {
    stopMotion();
    const p = current.current;
    commit(nextToktokRound(p, newSeed(), advance));
  }
  function undo() {
    if (locked.current || !current.current.moves.length) return;
    stopMotion();
    commit({ ...current.current, moves: current.current.moves.slice(0, -1) });
  }
  function hint() {
    if (locked.current || done) return;
    const h = hintToktok(game);
    if (h) {
      setHighlight(h.index);
      setMessage(
        `${GLYPHS[game.board[h.index].ch]}${PARTS[game.board[h.index].ch as keyof typeof PARTS] ? ' · 합성 자모를 터뜨려 보세요.' : ' · 이 무리를 눌러보세요.'}`,
      );
    }
  }
  return (
    <main className="challenge-page toktok-page glass">
      <ServiceHeader active="solo" title="자모 톡톡" />
      <a href="/solo" className="solo-games-back">
        <ArrowLeft size={16} />
        개인 도전
      </a>
      {!ready ? (
        <p role="status">불러오는 중…</p>
      ) : (
        <div className="toktok-layout">
          <aside className="toktok-info">
            <div className="toktok-companion">
              <CharacterAvatar avatar="🐻" />
              <div>
                <span>최고 점수</span>
                <strong>{progress.best.toLocaleString()}</strong>
              </div>
            </div>
            <div className="toktok-goal">
              <span>{progress.rules === 2 ? `${progress.round}라운드 목표` : '목표'}</span>
              <strong>{target.toLocaleString()}</strong>
              <div
                role="progressbar"
                aria-label="목표 점수"
                aria-valuemin={0}
                aria-valuemax={target}
                aria-valuenow={Math.min(game.score, target)}
              >
                <i style={{ width: `${Math.min(100, (game.score / target) * 100)}%` }} />
              </div>
            </div>
            <div className="toktok-recipes" aria-label="합성 자모 연결">
              <span>
                ㄲ<small>ㄱ + ㄱ</small>
              </span>
              <span>
                ㅘ<small>ㅗ + ㅏ</small>
              </span>
              <span>
                ㅐ<small>ㅏ + ㅣ</small>
              </span>
            </div>
            <details className="exit-help">
              <summary>게임 방법</summary>
              <p>
                같은 자모 둘 이상을 눌러 터뜨리세요. 합성 자모는 혼자 눌러도 돼요. ㄲ는 ㄱ, ㅘ는
                ㅗ·ㅏ, ㅐ는 ㅏ·ㅣ를 판 전체에서 연결해요. 구성 자모가 겹치면 다른 합성 자모도 이어서
                터져요.
              </p>
              <p>
                ㄱ 네 개는 ㄲ, ㅏ 네 개와 판의 ㅗ 하나는 ㅘ, ㅣ 네 개와 ㅏ 하나는 ㅐ로 합성돼요.
                18번 안에 목표 점수에 도전하세요. 라운드를 클리어하면 다음 목표가 2,000점씩
                올라가며, 최대 30,000점이에요.
              </p>
              <p>
                큰 무리·합성·연쇄로 피버 6칸을 모으세요. 피버가 차면 다음에 선택한 폭발 점수가 2배가
                돼요. 시간제한은 없으니 크게 터뜨릴 수를 골라보세요. 이전 버전의 진행 중인 판에는 새
                규칙을 적용하지 않아요.
              </p>
              <p>
                진행과 최고 점수는 이 브라우저에 저장돼요. 계정 전적·골드와 별개이며 브라우저
                데이터를 지우면 사라져요.
              </p>
            </details>
            {!saving && (
              <p className="toktok-save-error" role="alert">
                진행을 저장하지 못했어요. 창을 닫으면 현재 판이 사라질 수 있어요.
              </p>
            )}
          </aside>
          <section className="toktok-play" aria-busy={busy} aria-label="자모 톡톡 플레이">
            <div className="toktok-hud">
              <div>
                <span>점수</span>
                <strong>{game.score.toLocaleString()}</strong>
              </div>
              <div>
                <span>남은 횟수</span>
                <strong>
                  {TOKTOK_TURNS - game.turn}
                  <small> / {TOKTOK_TURNS}</small>
                </strong>
              </div>
              <button
                type="button"
                className="toktok-sound"
                aria-label={sound ? '효과음 끄기' : '효과음 켜기'}
                aria-pressed={sound}
                onClick={() => {
                  soundOn.current = !sound;
                  setSound(!sound);
                }}
              >
                {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
              </button>
            </div>
            {progress.rules === 2 && (
              <div
                className={`toktok-fever ${game.fever === TOKTOK_FEVER ? 'ready' : ''}`}
                role="progressbar"
                aria-label="피버"
                aria-valuemin={0}
                aria-valuemax={TOKTOK_FEVER}
                aria-valuenow={game.fever}
                aria-valuetext={
                  game.fever === TOKTOK_FEVER
                    ? '다음 폭발 점수 2배'
                    : `${game.fever} / ${TOKTOK_FEVER}`
                }
              >
                <strong>{game.fever === TOKTOK_FEVER ? '다음 폭발 ×2' : '피버'}</strong>
                <div aria-hidden="true">
                  {Array.from({ length: TOKTOK_FEVER }, (_, i) => (
                    <i key={i} className={i < (game.fever ?? 0) ? 'filled' : ''} />
                  ))}
                </div>
                <span aria-hidden="true">
                  {game.fever ?? 0}/{TOKTOK_FEVER}
                </span>
              </div>
            )}
            <div
              className={`toktok-play-area ${game.fever === TOKTOK_FEVER ? 'toktok-fever-ready' : ''}`}
            >
              <ToktokBoard
                board={oldBoard || game.board}
                onPick={take}
                disabled={busy || done}
                highlight={highlight}
                effect={effect}
                popping={!!oldBoard}
              />
              {done && !busy && (
                <div className="toktok-result" role="status">
                  <CharacterAvatar avatar={won ? '🐻' : '🐰'} />
                  <h2>{won ? '목표 달성!' : '이번 판 완료'}</h2>
                  {progress.rules === 2 && (
                    <p className="toktok-round-result">
                      {progress.round}라운드 · 최대 {game.maxChain ?? 0}연쇄 · 피버{' '}
                      {game.feverCount ?? 0}회
                    </p>
                  )}
                  <strong>
                    {game.score.toLocaleString()}
                    <small>점</small>
                  </strong>
                  <button type="button" className="primary" onClick={() => restart(won)}>
                    {won ? '다음 라운드' : '다시 도전'}
                    <ArrowRight size={18} />
                  </button>
                  <button type="button" onClick={undo}>
                    <Undo2 size={16} />한 수 되돌리기
                  </button>
                </div>
              )}
            </div>
            <p className="toktok-feedback" role="status">
              {message || '\u00a0'}
            </p>
            <div className="exit-tools">
              <button type="button" disabled={busy || !progress.moves.length} onClick={undo}>
                <Undo2 size={18} />
                되돌리기
              </button>
              <button type="button" disabled={busy} onClick={() => restart()}>
                <RotateCcw size={18} />새 판
              </button>
              <button type="button" disabled={busy || done} onClick={hint}>
                <Lightbulb size={18} />
                힌트
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
