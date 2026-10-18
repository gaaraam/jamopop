'use client';
import { RECENT_SOLO_KEY } from '@/lib/solo-recent.mjs';
import { useEffect, useState } from 'react';
import { ArrowRight, Play } from 'lucide-react';
import { ServiceHeader } from './service-header';
import { CharacterAvatar } from './character-avatar';
import { StackBoard } from './stack-board';
import { STACK_STAGES } from '@/lib/stack-stages.mjs';
import { ToktokBoard } from './toktok-board';
import { startToktok } from '@/lib/jamo-toktok.mjs';
import { readToktok } from '@/lib/toktok-progress.mjs';
import '@/app/solo/toktok/toktok.css';
import { readStack } from '@/lib/stack-progress.mjs';
import '@/app/solo/stack/stack.css';
import { readExit } from '@/lib/exit-progress.mjs';
import { ExitBoard } from './exit-board';
import { EXIT_STAGES } from '@/lib/exit-stages.mjs';
import '@/app/solo/challenges.css';
export function SoloHub() {
  const [progress, setProgress] = useState({ stage: 1, completed: 0 });
  const [recent, setRecent] = useState('');
  const [stackCompleted, setStackCompleted] = useState(0);
  const [toktokBest, setToktokBest] = useState(0);
  useEffect(() => {
    let saved = { stage: 1, best: {} };
    try {
      saved = readExit(localStorage);
    } catch {}
    setProgress({ stage: saved.stage, completed: Object.keys(saved.best).length });
    try {
      const recentGame = localStorage.getItem(RECENT_SOLO_KEY) || '';
      setRecent(['word', 'exit', 'stack', 'toktok'].includes(recentGame) ? recentGame : '');
      setStackCompleted(readStack(localStorage).completed.length);
      setToktokBest(readToktok(localStorage, 1).best);
    } catch {}
  }, []);
  return (
    <main className="challenge-page glass">
      <ServiceHeader active="solo" />
      {recent && (
        <a
          className="challenge-resume"
          href={
            recent === 'toktok'
              ? '/solo/toktok'
              : recent === 'stack'
                ? '/solo/stack'
                : recent === 'exit'
                  ? '/solo/exit'
                  : '/solo/word'
          }
        >
          <Play size={18} fill="currentColor" />
          <strong>
            {recent === 'toktok'
              ? '자모 톡톡'
              : recent === 'stack'
                ? '자모 쏙쏙'
                : recent === 'exit'
                  ? '콩알 탈출'
                  : '단어 복구'}
          </strong>
          <span>이어서 도전</span>
          <ArrowRight size={18} />
        </a>
      )}
      <div className="challenge-choices">
        <a className="challenge-choice word-choice" href="/solo/word">
          <div className="challenge-art" aria-hidden="true">
            <div className="word-mini">
              {[
                'ㅈ',
                'ㅏ',
                'ㅁ',
                'ㅗ',
                'ㅍ',
                'ㅏ',
                'ㅂ',
                'ㅗ',
                'ㅁ',
                'ㅏ',
                'ㄱ',
                'ㅗ',
                'ㅇ',
                'ㅏ',
                'ㄹ',
                'ㅍ',
                'ㅏ',
                'ㅂ',
                'ㅗ',
                'ㅁ',
                'ㄱ',
                'ㅗ',
                'ㅇ',
                'ㅏ',
                'ㄹ',
              ].map((x, i) => (
                <span key={i} className={i < 5 ? 'hit' : i === 8 || i === 12 ? 'near' : ''}>
                  {i < 15 ? x : ''}
                </span>
              ))}
            </div>
            <CharacterAvatar avatar="🐰" className="challenge-mascot" />
          </div>
          <div className="challenge-choice-label">
            <div>
              <h2>단어 복구</h2>
              <span>콩알 아파트</span>
            </div>
            <span className="challenge-play">
              <ArrowRight />
            </span>
          </div>
        </a>
        <a className="challenge-choice exit-choice" href="/solo/exit">
          <div className="challenge-art" aria-hidden="true">
            <ExitBoard pieces={EXIT_STAGES[0].pieces} initial={EXIT_STAGES[0].pieces} />
            <CharacterAvatar avatar="🐱" className="challenge-mascot" />
          </div>
          <div className="challenge-choice-label">
            <div>
              <h2>콩알 탈출</h2>
              <span>{progress.completed} / 30 완료</span>
            </div>
            <span className="challenge-play">
              <ArrowRight />
            </span>
          </div>
        </a>
        <a className="challenge-choice stack-choice" href="/solo/stack">
          <div className="challenge-art" aria-hidden="true">
            <StackBoard cols={STACK_STAGES[0].cols} />
            <CharacterAvatar avatar="🐻" className="challenge-mascot" />
          </div>
          <div className="challenge-choice-label">
            <div>
              <h2>자모 쏙쏙</h2>
              <span>{stackCompleted} / 30 완료</span>
            </div>
            <span className="challenge-play">
              <ArrowRight />
            </span>
          </div>
        </a>
        <a className="challenge-choice toktok-choice" href="/solo/toktok">
          <div className="challenge-art" aria-hidden="true">
            <ToktokBoard board={startToktok(43).board} preview />
            <CharacterAvatar avatar="🐻" className="challenge-mascot" />
          </div>
          <div className="challenge-choice-label">
            <div>
              <h2>자모 톡톡</h2>
              <span>{toktokBest ? `최고 ${toktokBest.toLocaleString()}점` : '합성 · 연쇄'}</span>
            </div>
            <span className="challenge-play">
              <ArrowRight />
            </span>
          </div>
        </a>
      </div>
    </main>
  );
}
