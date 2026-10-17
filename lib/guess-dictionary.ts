import words from '../public/dictionaries/allowed-words.json';
import { ALL_WORDS } from './words';
import { splitWord } from './game';
// Server-only consumer: a permissive headword list, separate from answer selection.
const allowed = new Set([...words, ...ALL_WORDS].map((word) => splitWord(word).join('')));
export function acceptsGuess(letters: string[], dictionaryVersion: number): boolean {
  return dictionaryVersion !== 1 || allowed.has(letters.join(''));
}
