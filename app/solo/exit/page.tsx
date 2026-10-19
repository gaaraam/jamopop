'use client';
import { useGameMeasurement } from '@/components/metrics/game';
import { RECENT_SOLO_KEY } from '@/lib/solo-recent.mjs';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Lightbulb,
  RotateCcw,
  Undo2,
  Check,
} from 'lucide-react';
import { ServiceHeader } from '@/components/game/service-header';
import { CharacterAvatar } from '@/components/game/character-avatar';
import { ExitBoard, type ExitPiece } from '@/components/game/exit-board';
import { EXIT_STAGES } from '@/lib/exit-stages.mjs';
import { movePiece } from '@/lib/kongal-exit.mjs';
import { readExit, writeExit, replayExit } from '@/lib/exit-progress.mjs';
import hintWorkerUrl from '@/lib/exit-hint.worker.ts?worker&url';
import '../challenges.css';
type Step = { id: number; dx: number; dy: number };
type Progress = { stage: number; moves: Step[]; best: Record<string, number> };
const TIERS = [
  ['normal', '보통'],
  ['hard', '어려움'],
  ['expert', '매우 어려움'],
];
const DIRECTIONS = [
  { dx: 0, dy: -1, name: '위', Icon: ArrowUp },
  { dx: -1, dy: 0, name: '왼쪽', Icon: ArrowLeft },
  { dx: 0, dy: 1, name: '아래', Icon: ArrowDown },
  { dx: 1, dy: 0, name: '오른쪽', Icon: ArrowRight },
];
export default function KongalExit() {
  const [progress, setProgress] = useState<Progress>({ stage: 1, moves: [], best: {} });
  const [ready, setReady] = useState(false),
    [selected, setSelected] = useState<number | null>(null),
    [message, setMessage] = useState(''),
    [saving, setSaving] = useState(true),
    [hinting, setHinting] = useState(false);
  const current = useRef(progress),
    revision = useRef(0),
    worker = useRef<Worker | null>(null);
  const stage = EXIT_STAGES.find((s) => s.id === progress.stage)!;
  const pieces = replayExit(stage, progress.moves) as ExitPiece[];
  const won = ready && pieces.length === 0;
  const newMetricAttempt = useGameMeasurement(
    'exit',
    ready ? String(stage.id) : null,
    progress.moves.length,
    won ? 'won' : 'playing',
  );
  const cancelHint = useCallback(() => {
    worker.current?.terminate();
    worker.current = null;
    setHinting(false);
  }, []);
  useEffect(() => {
    let saved: Progress = { stage: 1, moves: [], best: {} };
    try {
      saved = readExit(localStorage) as Progress;
    } catch {
      setSaving(false);
    }
    current.current = saved;
    setProgress(saved);
    setReady(true);
    try {
      localStorage.setItem(RECENT_SOLO_KEY, 'exit');
    } catch {}
    return () => worker.current?.terminate();
  }, []);
  function commit(next: Progress) {
    revision.current++;
    cancelHint();
    current.current = next;
    setProgress(next);
    try {
      setSaving(writeExit(localStorage, next));
    } catch {
      setSaving(false);
    }
    setMessage('');
  }
  const move = useCallback(
    (id: number | null, dx: number, dy: number) => {
      if (id === null || !ready) return;
      const p = current.current,
        s = EXIT_STAGES.find((s) => s.id === p.stage)!,
        ps = replayExit(s, p.moves);
      if (!ps?.length) return;
      const next = movePiece(ps, id, dx, dy);
      if (!next) {
        setMessage('이쪽은 막혀 있어요.');
        return;
      }
      if (p.moves.length >= 5000) {
        setMessage('이 판을 다시 시작해 주세요.');
        return;
      }
      const moves = [...p.moves, { id, dx, dy }];
      const best = { ...p.best };
      if (!next.pieces.length) best[s.id] = Math.min(best[s.id] || Infinity, moves.length);
      commit({ ...p, moves, best });
      if (next.escaped) setSelected(null);
    },
    [ready, cancelHint],
  );
  useEffect(() => {
    function key(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      if (
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        el.closest('input,textarea,select,[contenteditable="true"],[role="dialog"],summary') ||
        document.querySelector('[aria-modal="true"]')
      )
        return;
      const d = (
        { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] } as Record<
          string,
          number[]
        >
      )[e.key];
      if (d && selected !== null) {
        e.preventDefault();
        move(selected, d[0], d[1]);
      }
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [move, selected]);
  function pick(id: number) {
    newMetricAttempt(id === current.current.stage ? 'retry' : 'next');
    commit({ ...current.current, stage: id, moves: [] });
    setSelected(null);
  }
  function hint() {
    if (hinting || won) return;
    cancelHint();
    setHinting(true);
    const v = revision.current;
    let w: Worker;
    try {
      w = new Worker(new URL(hintWorkerUrl, window.location.origin), { type: 'module' });
    } catch {
      setHinting(false);
      setMessage('힌트를 불러오지 못했어요. 다시 시도해 주세요.');
      return;
    }
    worker.current = w;
    const timer = window.setTimeout(() => {
      if (worker.current !== w) return;
      cancelHint();
      setMessage('힌트를 찾지 못했어요. 한 수 되돌려 보세요.');
    }, 8000);
    w.onmessage = (e) => {
      clearTimeout(timer);
      if (v !== revision.current || worker.current !== w) return;
      cancelHint();
      const step = e.data.step;
      if (step) {
        const p = pieces.find((p) => p.id === step.id);
        setSelected(step.id);
        const d = DIRECTIONS.find((d) => d.dx === step.dx && d.dy === step.dy)!;
        setMessage(`${p?.ch} · ${d.name}으로 한 칸`);
      } else
        setMessage(
          e.data.status === 'blocked'
            ? '막힌 판이에요. 한 수 되돌려 보세요.'
            : '힌트를 찾지 못했어요. 한 수 되돌려 보세요.',
        );
    };
    w.onerror = () => {
      clearTimeout(timer);
      if (worker.current === w) {
        cancelHint();
        setMessage('힌트를 불러오지 못했어요. 다시 시도해 주세요.');
      }
    };
    w.postMessage({ pieces, revision: v });
  }
  return (
    <main className="challenge-page exit-page glass">
      <ServiceHeader active="solo" title="콩알 탈출" />
      <a className="solo-games-back" href="/solo">
        <ArrowLeft size={16} />
        개인 도전
      </a>
      {!ready ? (
        <p role="status">불러오는 중…</p>
      ) : (
        <div className="exit-layout">
          <aside className="exit-stage-panel">
            <div className="exit-friend">
              <CharacterAvatar avatar="🐱" />
              <strong>
                {Object.keys(progress.best).length}
                <small> / 30 완료</small>
              </strong>
            </div>
            <div className="exit-tier-tabs" aria-label="난이도">
              {TIERS.map(([tier, label]) => (
                <button
                  key={tier}
                  aria-pressed={stage.tier === tier}
                  onClick={() => pick(EXIT_STAGES.find((s) => s.tier === tier)!.id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="exit-stage-list" aria-label="스테이지">
              {EXIT_STAGES.filter((s) => s.tier === stage.tier).map((s) => (
                <button
                  key={s.id}
                  aria-current={stage.id === s.id ? 'step' : undefined}
                  onClick={() => pick(s.id)}
                  aria-label={`${s.id}탄${progress.best[s.id] ? ' 완료' : ''}`}
                >
                  {s.id}
                  {progress.best[s.id] ? <Check size={12} /> : null}
                </button>
              ))}
            </div>
            <details className="exit-help">
              <summary>게임 방법</summary>
              <p>
                자모 블록을 같은 글자가 표시된 출구로 보내세요. 블록을 선택한 뒤 방향키나 화살표
                버튼으로 움직여요. 터치로 밀어도 돼요.
              </p>
              <p>진행은 이 브라우저에 저장돼요. 계정 전적·골드와는 별개예요.</p>
            </details>
            {!saving && <p role="alert">저장 공간이 부족해요. 현재 진행은 창을 닫으면 사라져요.</p>}
          </aside>
          <section className="exit-play-panel" aria-label={`${stage.id}탄`}>
            <div className="exit-play-heading">
              <h2>{stage.id}탄</h2>
              <span>{progress.moves.length}수</span>
              <span>
                {pieces.length} / {stage.pieces.length} 남음
              </span>
            </div>
            <div className="exit-board-wrap">
              <ExitBoard
                pieces={pieces}
                initial={stage.pieces}
                selected={selected}
                onSelect={(id) => {
                  cancelHint();
                  setSelected(id);
                  setMessage('');
                }}
                onDrag={move}
              />
              {won && (
                <div className="exit-win" role="status">
                  <CharacterAvatar avatar="🐱" />
                  <h2>탈출 성공!</h2>
                  <p>{progress.moves.length}수</p>
                  <button
                    className="primary"
                    onClick={() => pick(stage.id === 30 ? 1 : stage.id + 1)}
                  >
                    {stage.id === 30 ? '다시 도전' : '다음 판'}
                    <ArrowRight size={18} />
                  </button>
                </div>
              )}
            </div>
            <div className="exit-feedback" role="status">
              {message || (!won && selected === null ? '블록 선택' : '\u00a0')}
            </div>
            <div className="exit-direction-pad" aria-label="블록 이동">
              {DIRECTIONS.map(({ dx, dy, name, Icon }) => (
                <button
                  key={name}
                  aria-label={`${name}으로 이동`}
                  disabled={selected === null || won}
                  onClick={() => move(selected, dx, dy)}
                >
                  <Icon size={23} />
                </button>
              ))}
            </div>
            <div className="exit-tools">
              <button
                disabled={!progress.moves.length}
                onClick={() => {
                  commit({ ...current.current, moves: current.current.moves.slice(0, -1) });
                  setSelected(null);
                }}
              >
                <Undo2 size={18} />
                되돌리기
              </button>
              <button onClick={() => pick(stage.id)} disabled={!progress.moves.length}>
                <RotateCcw size={18} />
                처음부터
              </button>
              <button onClick={hint} disabled={hinting || won}>
                <Lightbulb size={18} />
                {hinting ? '찾는 중…' : '힌트'}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
