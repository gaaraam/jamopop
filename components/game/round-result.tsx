'use client';
import { Trophy, Flag } from 'lucide-react';
import { CharacterAvatar } from '@/components/game/character-avatar';

import { useEffect, useState } from 'react';
import { checkedFetch } from '@/lib/recovery.mjs';
export function RoundResult({
  room,
  round,
  rank,
  onNext,
  nextDisabled,
  waiting,
  answer,
  onShare,
}: {
  room: string;
  round: string;
  rank?: number;
  answer?: string;
  onShare?: () => void;
  onNext?: () => void;
  nextDisabled?: boolean;
  waiting?: boolean;
}) {
  const [result, setResult] = useState<any>(null),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0),
    [filled, setFilled] = useState(false);
  useEffect(() => {
    setFilled(false);
    if (!result) return;
    const timer = setTimeout(() => setFilled(true), 80);
    return () => clearTimeout(timer);
  }, [result]);
  useEffect(() => {
    const c = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load(attempt = 0) {
      try {
        const r = await checkedFetch(
          `/api/results?room=${encodeURIComponent(room)}&round=${encodeURIComponent(round)}`,
          { signal: c.signal },
        );
        const d: any = await r.json();
        if (r.status === 409 && attempt < 3 && !c.signal.aborted) {
          timer = setTimeout(() => void load(attempt + 1), 1000);
          return;
        }
        if (!r.ok) throw Error(d.error);
        if (!c.signal.aborted) {
          setResult(d);
          setError('');
        }
      } catch (e) {
        if (!c.signal.aborted) setError((e as Error).message);
      }
    }
    timer = setTimeout(() => void load(), 250);
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [room, round, retry]);
  if (!result)
    return (
      <div className="round-reward-loading" role="status">
        {error ? (
          <button className="text-btn" onClick={() => setRetry((n) => n + 1)}>
            결과 다시 확인
          </button>
        ) : (
          '기록 정리 중…'
        )}
      </div>
    );
  const leveled = result.after && result.before && result.after.level > result.before.level;
  return (
    <section className="round-reward" data-outcome={result.status} aria-label="이번 판 보상">
      <div className="reward-heading">
        <span className="reward-medal" aria-hidden="true">
          {result.status === 'won' ? <Trophy size={20} /> : <Flag size={20} />}
        </span>
        <span className="reward-avatar">
          <CharacterAvatar avatar={result.avatar} skin={result.skin} />
        </span>
        <div>
          <small>{leveled ? '레벨 업' : '이번 판'}</small>
          <strong>
            {leveled
              ? `Lv.${result.after.level}`
              : rank
                ? `${rank}위`
                : result.status === 'won'
                  ? result.mode === 'speed'
                    ? '5문제 완주'
                    : '정답!'
                  : result.status === 'forfeited'
                    ? '기권'
                    : '도전 완료'}
          </strong>
        </div>
        <b className="reward-xp">
          +{result.xp}
          <small>XP</small>
        </b>
      </div>
      {result.gold > 0 && (
        <a className="reward-place" href="/shop">
          🪙 +{result.gold} G · 콩알 옷장 →
        </a>
      )}
      {answer && (
        <div className="reward-answer">
          <span>
            정답 <b>{answer}</b>
          </span>
          {onShare && (
            <button className="text-btn" onClick={onShare}>
              결과 복사
            </button>
          )}
        </div>
      )}
      {rank && leveled && <span className="reward-place">이번 판 {rank}위</span>}
      {result.after && (
        <div className="reward-progress">
          <span>Lv.{result.after.level}</span>
          <progress
            aria-label="현재 레벨 경험치"
            max={result.after.required}
            value={
              filled
                ? result.after.current
                : result.before?.level === result.after.level
                  ? result.before.current
                  : 0
            }
          />
          <small>
            {result.after.current} / {result.after.required}
          </small>
        </div>
      )}
      {!result.linked && result.xp > 0 && (
        <small className="reward-guest">계정 연동 시 경험치에 반영됩니다.</small>
      )}
      {result.unlocked.length > 0 && (
        <div className="reward-unlocks" aria-label="새로 해금한 보상">
          {result.unlocked.map((x: any, i: number) => (
            <span key={i}>
              <b style={{ color: x.color }}>{x.icon}</b>
              {x.name}
            </span>
          ))}
        </div>
      )}
      {onNext ? (
        <button className="primary reward-next" disabled={nextDisabled} onClick={onNext}>
          {nextDisabled ? '다른 참가자 풀이 중' : '다음 판 시작 →'}
        </button>
      ) : waiting ? (
        <small className="reward-waiting">방장의 다음 문제를 기다리는 중</small>
      ) : null}
    </section>
  );
}
