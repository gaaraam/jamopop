import { splitWord } from './game';
export const INPUT_JAMO = 'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎㅏㅑㅓㅕㅗㅛㅜㅠㅡㅣ';
export function inputShape(value: string, width: number) {
  const letters = splitWord(value);
  return {
    letters,
    valid: letters.length === width && letters.every((c) => INPUT_JAMO.includes(c)),
  };
}
export function keyboardJamo(key: string, shift = false) {
  const en = 'qwertyuiopasdfghjklzxcvbnm',
    ko = 'ㅂㅈㄷㄱㅅㅛㅕㅑㅐㅔㅁㄴㅇㄹㅎㅗㅓㅏㅣㅋㅌㅊㅍㅠㅜㅡ';
  const shifted: Record<string, string> = {
    q: 'ㅃ',
    w: 'ㅉ',
    e: 'ㄸ',
    r: 'ㄲ',
    t: 'ㅆ',
    o: 'ㅒ',
    p: 'ㅖ',
  };
  if (key === 'Enter' || key === 'Backspace') return key;
  if (key.length !== 1) return null;
  const lower = key.toLowerCase(),
    i = en.indexOf(lower);
  const mapped = i >= 0 ? (shift && shifted[lower]) || ko[i] : key;
  return splitWord(mapped).every((c) => INPUT_JAMO.includes(c)) ? mapped : null;
}
export function appendKey(value: string, key: string, width: number) {
  const next = splitWord(value + key);
  return next.length <= width ? next.join('') : value;
}
export function previewKey(roundId: string, value: string) {
  return `${roundId}:${splitWord(value).join('')}`;
}
export function blocksEnter(
  event: { isComposing?: boolean; keyCode?: number; repeat?: boolean },
  composing: boolean,
  lastCompositionEnd: number,
  now = Date.now(),
) {
  return (
    !!event.isComposing ||
    event.keyCode === 229 ||
    !!event.repeat ||
    composing ||
    now - lastCompositionEnd < 80
  );
}

// Physical keys use the same decomposed-jamo deletion as the on-screen keyboard.
export function editTileDraft(value: string, key: string, start = value.length, end = start) {
  const before = value.slice(0, start),
    after = value.slice(end);
  if (key === 'Backspace') {
    return start !== end ? before + after : splitWord(before).slice(0, -1).join('') + after;
  }
  return before + key + after;
}
