'use client';
import { CharacterAvatar } from '@/components/game/character-avatar';
import { ThemeSwitch } from '@/components/theme';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, HelpCircle } from 'lucide-react';
import { WordBoard, WordKeyboard } from './word-controls';
import { GameInput } from './mobile-controls';
import { score, splitWord, type Color, type Guess } from '@/lib/game';
import { blocksEnter } from '@/lib/input';
import { FIRST_WORDS, firstGuess, readFirstPlay, saveFirstPlay } from '@/lib/first-play';
const hints = [
  '바람을 넣어 색을 확인해 보세요.',
  '사과를 넣어 다른 단서를 찾아보세요.',
  '이제 수박을 넣어 맞혀 보세요.',
];
export function Intro({ onStart, onHelp }: { onStart: () => void; onHelp: () => void }) {
  const [playing, setPlaying] = useState(false),
    [guesses, setGuesses] = useState<Guess[]>([]),
    [draft, setDraft] = useState(''),
    [message, setMessage] = useState('');
  const composing = useRef(false),
    ended = useRef(0),
    step = guesses.length,
    done = step === 3;
  const notificationSlot = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('jamopop-header-slot', { detail: notificationSlot.current }),
    );
    return () => {
      window.dispatchEvent(new CustomEvent('jamopop-header-slot', { detail: null }));
    };
  }, []);
  useEffect(() => {
    const restored = readFirstPlay(sessionStorage);
    setGuesses(restored);
    setPlaying(restored.length > 0);
  }, []);
  const colors: Record<string, Color> = {};
  for (const g of guesses)
    g.letters.forEach((letter, i) => {
      const strength = { gray: 1, yellow: 2, green: 3 };
      if (!colors[letter] || strength[g.colors[i]] > strength[colors[letter]])
        colors[letter] = g.colors[i];
    });
  function submit() {
    if (composing.current || done) return;
    const g = firstGuess(step, draft);
    if (!g) {
      setMessage(`${FIRST_WORDS[step]}을 입력해 보세요.`);
      return;
    }
    const next = [...guesses, g];
    setGuesses(next);
    saveFirstPlay(sessionStorage, next);
    setDraft('');
    setMessage('');
  }
  return (
    <main
      className={`signature-page kongal-intro first-play ${playing ? 'is-learning refined glass' : ''}`}
    >
      <h1 className="sr-only">자음모음팝</h1>
      <header className="signature-nav">
        <ThemeSwitch />
        <button onClick={onHelp} aria-label="게임 방법">
          <HelpCircle size={18} />
          <span>게임 방법</span>
        </button>
        <span id="service-notifications" ref={notificationSlot} />
      </header>
      <section className="signature-center" aria-label="첫 판 연습">
        <div className="intro-friends" aria-hidden="true">
          <span className="intro-friend friend-cat">
            <CharacterAvatar avatar="🐱" />
          </span>
          <span className="intro-friend friend-rabbit">
            <CharacterAvatar avatar="🐰" />
          </span>
          <span className="intro-friend friend-frog">
            <CharacterAvatar avatar="🐸" />
          </span>
        </div>
        {playing ? (
          <section className="game-panel first-play-panel">
            <div className="first-play-heading">
              <h2>{done ? '첫 판 완료!' : '첫 판 연습'}</h2>
              <span>시간 제한 없음 · 보상 없는 체험</span>
            </div>
            <div className="board-wrap">
              <WordBoard
                roundId="first-play"
                width={5}
                guesses={guesses}
                letters={splitWord(draft)}
                isFinished={done}
              />
            </div>
            <div className="first-play-feedback" role="status" aria-live="polite">
              {step === 1 ? (
                <>
                  <b>같은 ㅏ도 판정이 달라요.</b>
                  <span>
                    정답에 ㅏ는 하나. 네 번째 칸은 초록, 두 번째 칸은 초과해서 회색이에요.
                  </span>
                </>
              ) : step === 2 ? (
                <>
                  <b>초록은 제자리, 노랑은 다른 자리.</b>
                  <span>ㅅ은 첫 칸에, ㄱ은 다른 칸에 있어요.</span>
                </>
              ) : done ? (
                <>
                  <b>수박 → ㅅ ㅜ ㅂ ㅏ ㄱ</b>
                  <span>다섯 칸이 모두 초록이면 정답!</span>
                </>
              ) : (
                <>
                  <b>바람 → ㅂ ㅏ ㄹ ㅏ ㅁ</b>
                  <span>한글 글자 수가 아닌, 풀어 쓴 자모 다섯 칸이에요.</span>
                </>
              )}
            </div>
            {!done ? (
              <>
                <div className="first-play-prompt">
                  <label htmlFor="first-word">{hints[step]}</label>
                  <button
                    className="text-btn"
                    type="button"
                    onClick={() => {
                      setDraft(FIRST_WORDS[step]);
                      setMessage('');
                    }}
                  >
                    {FIRST_WORDS[step]} 넣기
                  </button>
                </div>
                <div className="input-area">
                  <GameInput
                    id="first-word"
                    aria-label="연습 단어 입력"
                    aria-describedby="first-input-status"
                    placeholder="단어를 입력하거나 아래 자판을 누르세요"
                    value={draft}
                    maxLength={16}
                    onChange={(e) => {
                      setDraft(e.target.value);
                      setMessage('');
                    }}
                    onCompositionStart={() => {
                      composing.current = true;
                    }}
                    onCompositionEnd={() => {
                      composing.current = false;
                      ended.current = Date.now();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (!blocksEnter(e.nativeEvent, composing.current, ended.current)) submit();
                      }
                    }}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  <span
                    id="first-input-status"
                    className={`input-status ${message ? 'invalid' : ''}`}
                    role="status"
                  >
                    {message || '5칸 단어를 입력해 주세요'}
                  </span>
                </div>
                <WordKeyboard
                  keyboardColors={colors}
                  onKey={(key) => {
                    if (composing.current) return;
                    setDraft((value) =>
                      key === 'Backspace'
                        ? splitWord(value).slice(0, -1).join('')
                        : splitWord(value + key)
                            .slice(0, 5)
                            .join(''),
                    );
                    setMessage('');
                  }}
                />
                <button
                  className="primary submit"
                  type="button"
                  onClick={submit}
                  disabled={splitWord(draft).length !== 5}
                >
                  제출하기
                </button>
              </>
            ) : (
              <div className="first-play-next">
                <a className="primary" href="/solo?start=1">
                  개인 도전 시작
                  <ArrowRight size={18} />
                </a>
                <button className="secondary-btn" onClick={onStart}>
                  함께 풀러 가기
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
          </section>
        ) : (
          <>
            <div className="signature-board" aria-label="25칸 게임판">
              {Array.from({ length: 25 }, (_, i) => (
                <div
                  key={i}
                  className={`signature-tile ${i < 5 ? score(splitWord('바람'), splitWord('수박'))[i] : 'empty'}`}
                >
                  <span>{i < 5 ? splitWord('바람')[i] : ''}</span>
                </div>
              ))}
            </div>
            <div className="signature-legend">
              <span>
                <i className="good" />
                위치 일치
              </span>
              <span>
                <i className="near" />
                다른 위치
              </span>
              <span>
                <i className="miss" />
                미포함·개수 초과
              </span>
            </div>
            <button className="signature-start" onClick={() => setPlaying(true)}>
              시작하기
              <ArrowRight size={19} />
            </button>
          </>
        )}
        {!done && (
          <button className="text-btn first-play-skip" onClick={onStart}>
            {playing ? '연습 건너뛰고 대기실' : '바로 대기실'}
          </button>
        )}
        <a className="text-btn" href="/daily">
          오늘의 단어 →
        </a>
        <span className="signature-note">로그인 없이 플레이 가능</span>
      </section>
    </main>
  );
}
