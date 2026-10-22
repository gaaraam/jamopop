'use client';
import { useEffect, useRef, useState } from 'react';
import { CharacterAvatar } from '@/components/game/character-avatar';
import { walkPath, moveOnFloor } from '@/lib/home-walk.mjs';
import type { Placement } from '@/lib/furniture';
import { DoorOpen, Shirt } from 'lucide-react';
type Point = { x: number; y: number };
export function HomeExplorer({
  avatar,
  skin,
  name,
  furniture,
  paused,
  onExit,
  onWardrobe,
  onPet,
  message,
}: {
  avatar: string;
  skin?: string;
  name: string;
  furniture: Placement[];
  paused: boolean;
  onExit: () => void;
  onWardrobe?: () => void;
  onPet: () => void;
  message?: string;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const position = useRef<Point>({ x: 50, y: 88 });
  const path = useRef<Point[]>([]),
    arrival = useRef<(() => void) | null>(null);
  const [point, setPoint] = useState(position.current),
    [walking, setWalking] = useState(false),
    [left, setLeft] = useState(false);
  const [destination, setDestination] = useState<Point | null>(null);
  const go = useRef<(goal: Point, action?: () => void) => void>(() => {});
  useEffect(() => {
    const scene = layer.current?.parentElement;
    if (!scene) return;
    const keys = new Set<string>();
    let frame = 0,
      previous = 0;
    const stop = () => {
      cancelAnimationFrame(frame);
      keys.clear();
      frame = 0;
      path.current = [];
      arrival.current = null;
      setWalking(false);
      setDestination(null);
    };
    go.current = (goal, action) => {
      if (paused) return;
      path.current = walkPath(position.current, goal, furniture);
      arrival.current = action || null;
      setDestination(path.current.at(-1) || null);
      scene.focus({ preventScroll: true });
      if (!frame) {
        previous = performance.now();
        frame = requestAnimationFrame(tick);
      }
    };
    const click = (e: MouseEvent) => {
      if (paused || (e.target as HTMLElement).closest('button,a,input,select')) return;
      const r = scene.getBoundingClientRect();
      go.current({
        x: ((e.clientX - r.left) / r.width) * 100,
        y: ((e.clientY - r.top) / r.height) * 100,
      });
    };
    const keydown = (e: KeyboardEvent) => {
      if (paused || e.ctrlKey || e.metaKey || e.altKey || e.isComposing || e.target !== scene)
        return;
      const code = e.code;
      if (
        ![
          'ArrowLeft',
          'ArrowRight',
          'ArrowUp',
          'ArrowDown',
          'KeyW',
          'KeyA',
          'KeyS',
          'KeyD',
        ].includes(code)
      )
        return;
      e.preventDefault();
      keys.add(code);
      path.current = [];
      arrival.current = null;
      setDestination(null);
      if (!frame) {
        previous = performance.now();
        frame = requestAnimationFrame(tick);
      }
    };
    const keyup = (e: KeyboardEvent) => {
      keys.delete(e.code);
    };
    const tick = (time: number) => {
      const dt = Math.min((time - previous) / 1000, 0.05);
      previous = time;
      if (!paused && keys.size && !document.hidden) {
        const dx =
          Number(keys.has('ArrowRight') || keys.has('KeyD')) -
          Number(keys.has('ArrowLeft') || keys.has('KeyA'));
        const dy =
          Number(keys.has('ArrowDown') || keys.has('KeyS')) -
          Number(keys.has('ArrowUp') || keys.has('KeyW'));
        const length = Math.hypot(dx, dy) || 1;
        const ratio = scene.clientWidth / scene.clientHeight;
        const p = position.current;
        const next = moveOnFloor(
          p,
          (dx / length) * dt * 22,
          (dy / length) * dt * 22 * ratio,
          furniture,
        );
        if (dx) setLeft(dx < 0);
        setWalking(Math.hypot(next.x - p.x, next.y - p.y) > 0.001);
        position.current = next;
        setPoint(next);
      } else if (!paused && path.current.length && !document.hidden) {
        const p = position.current,
          target = path.current[0],
          dx = target.x - p.x,
          dy = target.y - p.y,
          length = Math.hypot(dx, dy),
          step = dt * 28;
        if (Math.abs(dx) > 0.01) setLeft(dx < 0);
        const next =
          length <= step
            ? target
            : { x: p.x + (dx / length) * step, y: p.y + (dy / length) * step };
        position.current = next;
        setPoint(next);
        setWalking(true);
        if (length <= step) path.current.shift();
        if (!path.current.length) {
          setWalking(false);
          setDestination(null);
          const action = arrival.current;
          arrival.current = null;
          action?.();
        }
      }
      if (!keys.size && !path.current.length) setWalking(false);
      frame =
        (keys.size || path.current.length) && !paused && !document.hidden
          ? requestAnimationFrame(tick)
          : 0;
    };
    if (paused) stop();
    const approach = (event: Event) => {
      const { point, action } = (event as CustomEvent<{ point: Point; action: () => void }>).detail;
      go.current(point, action);
    };
    scene.addEventListener('home-approach', approach);
    scene.addEventListener('click', click);
    scene.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    scene.addEventListener('blur', stop);
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', stop);
    return () => {
      cancelAnimationFrame(frame);
      stop();
      scene.removeEventListener('home-approach', approach);
      scene.removeEventListener('click', click);
      scene.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      scene.removeEventListener('blur', stop);
      window.removeEventListener('blur', stop);
      document.removeEventListener('visibilitychange', stop);
    };
  }, [paused, furniture]);
  return (
    <div ref={layer} className="home-explorer">
      <button
        className="world-door"
        disabled={paused}
        onClick={() => go.current({ x: 88, y: 40 }, onExit)}
        aria-label="문을 열고 이웃 골목으로"
      >
        <span className="door-window" />
        <DoorOpen size={18} />
        <b>나가기</b>
      </button>
      {onWardrobe && (
        <button
          className="world-closet"
          disabled={paused}
          onClick={() => go.current({ x: 66, y: 42 }, onWardrobe)}
          aria-label="옷장 열기"
        >
          <span className="closet-mirror" />
          <Shirt />
          <b>옷장</b>
        </button>
      )}
      {destination && (
        <i
          className="walk-destination"
          style={{ left: `${destination.x}%`, top: `${destination.y}%` }}
        />
      )}
      <div
        className={`world-player ${walking ? 'is-walking' : ''}`}
        style={{ left: `${point.x}%`, top: `${point.y}%`, zIndex: Math.round(point.y) + 1 }}
      >
        <button
          className="player-interact"
          disabled={paused}
          onClick={onPet}
          aria-label={`${name} 쓰다듬기`}
        >
          {message && <span className="world-speech">{message}</span>}
          <span className="player-shadow" />
          <span className="player-facing" style={{ transform: `scaleX(${left ? -1 : 1})` }}>
            <CharacterAvatar avatar={avatar} skin={skin} />
          </span>
          <small>{name}</small>
        </button>
      </div>
      <span className="walk-help">
        바닥을 눌러 이동 <kbd>↑ ↓ ← →</kbd>
      </span>
    </div>
  );
}
