'use client';
import { useEffect, useState, useRef } from 'react';
import { Cookie, Sparkles, Heart } from 'lucide-react';
import { CharacterAvatar } from './character-avatar';
import { residentTarget } from '@/lib/home-life';
export function HomeResident({
  avatar,
  skin,
  name,
  paused = false,
  reaction,
  onPet,
  visitor = false,
  furniture = [],
  action = 'pet',
  message = '',
  gain = 0,
}: {
  avatar: string;
  skin?: string | null;
  name: string;
  paused?: boolean;
  reaction: number;
  onPet?: () => void;
  visitor?: boolean;
  action?: string;
  message?: string;
  gain?: number;
  furniture?: { id: string; x: number }[];
}) {
  const props = useRef(furniture);
  props.current = furniture;
  const position = useRef(visitor ? 32 : 62);
  const [x, setX] = useState(visitor ? 32 : 62),
    [facing, setFacing] = useState(1),
    [mood, setMood] = useState('idle');
  useEffect(() => {
    if (paused) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const schedule = () => {
      timer = setTimeout(
        () => {
          if (stopped) return;
          if (document.hidden || reduced.matches) {
            schedule();
            return;
          }
          const nearby = props.current.filter((f) =>
            ['home-sofa', 'home-aquarium', 'home-books'].includes(f.id),
          );
          const destination =
            nearby.length && Math.random() > 0.5
              ? nearby[Math.floor(Math.random() * nearby.length)]
              : null;
          const next = destination
            ? Math.max(20, Math.min(80, destination.x))
            : residentTarget(Math.random());
          setFacing(next > position.current ? 1 : -1);
          position.current = next;
          setX(next);
          setMood('walk');
          timer = setTimeout(() => {
            setMood(
              destination?.id === 'home-sofa'
                ? 'sleep'
                : destination
                  ? 'look'
                  : Math.random() > 0.5
                    ? 'sleep'
                    : 'idle',
            );
            schedule();
          }, 2600);
        },
        5500 + Math.random() * 6500,
      );
    };
    schedule();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [paused, visitor, reaction]);
  useEffect(() => {
    if (!reaction) return;
    setMood('happy');
    const t = setTimeout(() => setMood('idle'), 1800);
    return () => clearTimeout(t);
  }, [reaction]);
  return (
    <button
      type="button"
      className={`home-walker ${paused ? 'paused' : mood} ${visitor ? 'visitor' : ''} action-${action}`}
      style={{ left: `${x}%` }}
      onClick={(e) => {
        e.stopPropagation();
        onPet?.();
      }}
      aria-label={`${name} 쓰다듬기`}
      disabled={paused || !onPet}
    >
      {message && (
        <span key={reaction} className="resident-speech" role="status">
          {message}
          {gain > 0 && <b>♥ +{gain}</b>}
        </span>
      )}
      {mood === 'happy' && (
        <span className="resident-action-prop" aria-hidden="true">
          {action === 'snack' ? (
            <Cookie />
          ) : action === 'play' ? (
            <Sparkles />
          ) : (
            <Heart fill="currentColor" />
          )}
        </span>
      )}
      <span className="resident-emote" aria-hidden="true">
        {mood === 'sleep'
          ? 'z Z'
          : mood === 'happy'
            ? '♥'
            : mood === 'look'
              ? '♫'
              : visitor
                ? '✦'
                : ''}
      </span>
      <span className="resident-facing" style={{ transform: `scaleX(${facing})` }}>
        <CharacterAvatar avatar={avatar} skin={skin} />
      </span>
      <span className="resident-name">{name}</span>
    </button>
  );
}
