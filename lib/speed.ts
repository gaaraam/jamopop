import { splitWord, score, type Guess } from './game';
export const SPEED_THEMES = [
  {
    id: 'food',
    name: '식탁 위',
    emoji: '🍎',
    words: [
      '사과',
      '포도',
      '수박',
      '딸기',
      '만두',
      '라면',
      '국수',
      '김밥',
      '당근',
      '감자',
      '양파',
      '고추',
      '소금',
      '설탕',
      '치즈',
    ],
  },
  {
    id: 'animals',
    name: '동물 친구들',
    emoji: '🦊',
    words: [
      '토끼',
      '사슴',
      '여우',
      '고양이',
      '강아지',
      '참새',
      '기린',
      '사자',
      '하마',
      '낙타',
      '물개',
      '펭귄',
      '오리',
      '거북이',
      '코끼리',
    ],
  },
  {
    id: 'home',
    name: '우리 집',
    emoji: '🏠',
    words: [
      '침대',
      '의자',
      '책상',
      '거울',
      '수건',
      '비누',
      '이불',
      '베개',
      '시계',
      '접시',
      '컵',
      '옷장',
      '서랍',
      '신발',
      '양말',
    ],
  },
  {
    id: 'trip',
    name: '여행 가는 날',
    emoji: '🧳',
    words: [
      '가방',
      '지도',
      '여권',
      '공항',
      '기차',
      '버스',
      '택시',
      '호텔',
      '바다',
      '산책',
      '사진',
      '구름',
      '섬',
      '텐트',
      '등산',
    ],
  },
].map((t) => ({
  ...t,
  words: t.words.filter((w) => splitWord(w).length >= 5 && splitWord(w).length <= 7),
}));
export type SpeedPuzzle = { guesses: Guess[]; status: 'open' | 'won' | 'lost' };
export type SpeedState = { current: number; puzzles: SpeedPuzzle[]; lastSolvedAt: number | null };
export const emptySpeed = (): SpeedState => ({
  current: 0,
  puzzles: Array.from({ length: 5 }, () => ({ guesses: [], status: 'open' })),
  lastSolvedAt: null,
});
export function chooseSpeed(words: string[], recent: string[] = []) {
  const pool = words.filter((w) => !recent.includes(w));
  const candidates = pool.length >= 5 ? pool : words;
  return [...candidates]
    .map((word) => ({ word, n: crypto.getRandomValues(new Uint32Array(1))[0] }))
    .sort((a, b) => a.n - b.n)
    .slice(0, 5)
    .map((x) => x.word);
}
export function advanceSpeed(s: SpeedState) {
  for (let step = 1; step <= 5; step++) {
    const i = (s.current + step) % 5;
    if (s.puzzles[i].status === 'open') {
      s.current = i;
      return;
    }
  }
}
export function guessSpeed(state: SpeedState, answers: string[], word: string, now: number) {
  const s = structuredClone(state),
    p = s.puzzles[s.current];
  if (p.status !== 'open') throw Error('완료한 문제예요.');
  const letters = splitWord(word);
  if (
    letters.length !== splitWord(answers[s.current]).length ||
    letters.some((x) => !/[ㄱ-ㅎㅏ-ㅣ]/.test(x))
  )
    throw Error('문제의 칸 수에 맞춰 입력해 주세요.');
  const colors = score(letters, splitWord(answers[s.current]));
  p.guesses.push({ letters, colors });
  if (colors.every((x) => x === 'green')) {
    p.status = 'won';
    s.lastSolvedAt = now;
    advanceSpeed(s);
  } else if (p.guesses.length >= 5) {
    p.status = 'lost';
    advanceSpeed(s);
  }
  return s;
}
export function speedRank(rows: any[]) {
  return [...rows]
    .sort(
      (a, b) =>
        b.solved - a.solved ||
        (a.lastSolvedAt ?? Infinity) - (b.lastSolvedAt ?? Infinity) ||
        a.id.localeCompare(b.id),
    )
    .map((r, i) => ({ ...r, rank: i + 1 }));
}
