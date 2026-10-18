'use client';
import { RECENT_SOLO_KEY } from '@/lib/solo-recent.mjs';
import { useEffect, useState } from 'react';
import { ArrowRight, Play } from 'lucide-react';
import { ServiceHeader } from './service-header';
import { CharacterAvatar } from './character-avatar';
import { readExit } from '@/lib/exit-progress.mjs';
import { ExitBoard } from './exit-board';
import { EXIT_STAGES } from '@/lib/exit-stages.mjs';
import '@/app/solo/challenges.css';
export function SoloHub() {
  const [progress, setProgress] = useState({ stage: 1, completed: 0 });
  const [recent, setRecent] = useState('');
  useEffect(() => {
    let saved = { stage: 1, best: {} };
    try {
      saved = readExit(localStorage);
    } catch {}
    setProgress({ stage: saved.stage, completed: Object.keys(saved.best).length });
    try {
      setRecent(localStorage.getItem(RECENT_SOLO_KEY) || '');
    } catch {}
  }, []);
  return (
    <main className="challenge-page glass">
      <ServiceHeader active="solo" />
      {recent && (
        <a className="challenge-resume" href={recent === 'exit' ? '/solo/exit' : '/solo/word'}>
          <Play size={18} fill="currentColor" />
          <strong>{recent === 'exit' ? '콩알 탈출' : '단어 복구'}</strong>
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
      </div>
    </main>
  );
}
