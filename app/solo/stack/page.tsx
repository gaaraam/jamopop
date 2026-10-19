'use client';
import { useGameMeasurement } from '@/components/metrics/game';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Lightbulb, RotateCcw, Undo2 } from 'lucide-react';
import { ServiceHeader } from '@/components/game/service-header';
import { CharacterAvatar } from '@/components/game/character-avatar';
import { StackBoard, StackTray, type StackTile } from '@/components/game/stack-board';
import { STACK_STAGES } from '@/lib/stack-stages.mjs';
import { takeStack } from '@/lib/jamo-stack.mjs';
import { replayStack, readStack, writeStack } from '@/lib/stack-progress.mjs';
import { RECENT_SOLO_KEY } from '@/lib/solo-recent.mjs';
import workerUrl from '@/lib/stack-hint.worker.ts?worker&url';
import '../challenges.css';
import './stack.css';
type Progress = { stage: number; moves: number[]; completed: number[] };
const TIERS = [
  ['normal', '보통'],
  ['hard', '어려움'],
  ['expert', '매우 어려움'],
];
export default function JamoStack() {
  const [progress, setProgress] = useState<Progress>({ stage: 1, moves: [], completed: [] });
  const [ready, setReady] = useState(false),
    [saving, setSaving] = useState(true),
    [message, setMessage] = useState(''),
    [matched, setMatched] = useState<string | null>(null),
    [highlight, setHighlight] = useState<number | null>(null),
    [hinting, setHinting] = useState(false);
  const current = useRef(progress),
    revision = useRef(0),
    worker = useRef<Worker | null>(null),
    timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stage = STACK_STAGES[progress.stage - 1];
  const state = useMemo(
    () => replayStack(stage, progress.moves)! as { cols: StackTile[][]; tray: StackTile[] },
    [stage, progress.moves],
  );
  const { cols, tray } = state;
  const won = ready && cols.every((c) => c.length === 0) && tray.length === 0;
  const lost = ready && tray.length === 7;
  const newMetricAttempt = useGameMeasurement(
    'stack',
    ready ? String(stage.id) : null,
    progress.moves.length,
    won ? 'won' : lost ? 'lost' : 'playing',
  );
  const stopWorker = useCallback(() => {
    worker.current?.terminate();
    worker.current = null;
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = null;
    setHinting(false);
  }, []);
  useEffect(() => {
    let saved: Progress = { stage: 1, moves: [], completed: [] };
    try {
      saved = readStack(localStorage) as Progress;
    } catch {
      setSaving(false);
    }
    current.current = saved;
    setProgress(saved);
    setReady(true);
    try {
      localStorage.setItem(RECENT_SOLO_KEY, 'stack');
    } catch {}
    return () => {
      worker.current?.terminate();
      if (timeout.current) clearTimeout(timeout.current);
    };
  }, []);
  useEffect(() => {
    if (!matched) return;
    const timer = setTimeout(() => setMatched(null), 750);
    return () => clearTimeout(timer);
  }, [matched, progress.moves.length]);
  function commit(next: Progress) {
    revision.current++;
    stopWorker();
    current.current = next;
    setProgress(next);
    setMessage('');
    setHighlight(null);
    setMatched(null);
    try {
      setSaving(writeStack(localStorage, next));
    } catch {
      setSaving(false);
    }
  }
  const take = useCallback(
    (col: number) => {
      if (!ready) return;
      const p = current.current,
        s = STACK_STAGES[p.stage - 1],
        before = replayStack(s, p.moves)!;
      const next = takeStack(before.cols, before.tray, col);
      if (!next) return;
      const completed = [...p.completed];
      if (
        next.cols.every((c: StackTile[]) => !c.length) &&
        next.tray.length === 0 &&
        !completed.includes(s.id)
      )
        completed.push(s.id);
      commit({ ...p, moves: [...p.moves, col], completed });
      if (next.match) setMatched(next.tile.ch);
    },
    [ready, stopWorker],
  );
  useEffect(() => {
    function key(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      if (
        e.repeat ||
        e.isComposing ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        el.closest('input,textarea,select,[contenteditable="true"],[role="dialog"],summary') ||
        document.querySelector('[aria-modal="true"]')
      )
        return;
      if (/^[1-6]$/.test(e.key)) {
        e.preventDefault();
        take(Number(e.key) - 1);
      }
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [take]);
  function pick(id: number) {
    newMetricAttempt(id === current.current.stage ? 'retry' : 'next');
    commit({ ...current.current, stage: id, moves: [] });
  }
  function hint() {
    if (hinting || won || lost) return;
    stopWorker();
    setHinting(true);
    const v = revision.current;
    let w: Worker;
    try {
      w = new Worker(new URL(workerUrl, location.origin), { type: 'module' });
    } catch {
      setHinting(false);
      setMessage('힌트를 불러오지 못했어요. 다시 시도해 주세요.');
      return;
    }
    worker.current = w;
    timeout.current = setTimeout(() => {
      if (worker.current !== w) return;
      stopWorker();
      setMessage('힌트를 찾지 못했어요. 한 수 되돌려 보세요.');
    }, 8000);
    w.onmessage = (e) => {
      if (v !== revision.current || worker.current !== w) return;
      stopWorker();
      const col = e.data.col;
      if (Number.isInteger(col) && cols[col]?.length) {
        setHighlight(col);
        setMessage(`${col + 1}열 · ${cols[col][0].ch}`);
      } else
        setMessage(
          e.data.status === 'blocked'
            ? '막힌 판이에요. 한 수 되돌려 보세요.'
            : '힌트를 찾지 못했어요. 한 수 되돌려 보세요.',
        );
    };
    w.onerror = () => {
      if (worker.current === w) {
        stopWorker();
        setMessage('힌트를 불러오지 못했어요. 다시 시도해 주세요.');
      }
    };
    w.postMessage({ cols, tray, revision: v });
  }
  return (
    <main className="challenge-page exit-page stack-page glass">
      <ServiceHeader active="solo" title="자모 쏙쏙" />
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
              <CharacterAvatar avatar="🐻" />
              <strong>
                {progress.completed.length}
                <small> / 30 완료</small>
              </strong>
            </div>
            <div className="exit-tier-tabs" aria-label="난이도">
              {TIERS.map(([tier, label]) => (
                <button
                  key={tier}
                  aria-pressed={stage.tier === tier}
                  onClick={() => pick(STACK_STAGES.find((s) => s.tier === tier)!.id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="exit-stage-list" aria-label="스테이지">
              {STACK_STAGES.filter((s) => s.tier === stage.tier).map((s) => (
                <button
                  key={s.id}
                  aria-current={s.id === stage.id ? 'step' : undefined}
                  aria-label={`${s.id}탄${progress.completed.includes(s.id) ? ' 완료' : ''}`}
                  onClick={() => pick(s.id)}
                >
                  {s.id}
                  {progress.completed.includes(s.id) && <Check size={12} />}
                </button>
              ))}
            </div>
            <details className="exit-help">
              <summary>게임 방법</summary>
              <p>
                각 열의 맨 위 자모를 골라 보관함에 넣어요. 같은 자모 세 개가 모이면 사라져요. 일곱
                칸이 차기 전에 전부 비우세요. 숫자키 1~6으로도 고를 수 있어요.
              </p>
              <p>진행은 이 브라우저에 저장돼요. 계정 전적·골드와는 별개예요.</p>
            </details>
            {!saving && (
              <p role="alert">진행을 저장하지 못했어요. 창을 닫으면 현재 진행이 사라져요.</p>
            )}
          </aside>
          <section className="exit-play-panel stack-play-panel" aria-label={`${stage.id}탄`}>
            <div className="exit-play-heading">
              <h2>{stage.id}탄</h2>
              <span>{cols.flat().length}개 남음</span>
            </div>
            <div className="stack-play-area">
              <StackBoard cols={cols} onPick={take} highlight={highlight} disabled={won || lost} />
              {won && (
                <div className="stack-result" role="status">
                  <CharacterAvatar avatar="🐻" />
                  <h2>전부 모았어요!</h2>
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
            <StackTray tray={tray} matched={matched} />
            {lost ? (
              <div className="stack-lost" role="status">
                <strong>보관함이 꽉 찼어요</strong>
                <button
                  onClick={() =>
                    commit({ ...current.current, moves: current.current.moves.slice(0, -1) })
                  }
                >
                  <Undo2 size={16} />한 수 되돌리기
                </button>
              </div>
            ) : (
              <div className="exit-feedback" role="status">
                {message || '\u00a0'}
              </div>
            )}
            <div className="exit-tools">
              <button
                disabled={!progress.moves.length}
                onClick={() =>
                  commit({ ...current.current, moves: current.current.moves.slice(0, -1) })
                }
              >
                <Undo2 size={18} />
                되돌리기
              </button>
              <button disabled={!progress.moves.length} onClick={() => pick(stage.id)}>
                <RotateCcw size={18} />
                처음부터
              </button>
              <button disabled={won || lost || hinting} onClick={hint}>
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
