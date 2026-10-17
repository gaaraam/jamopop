import {score,splitWord,type Guess} from './game';
export const FIRST_WORDS=['바람','사과','수박'] as const;
const KEY='jamopop-first-play-v1';
export function firstGuess(step:number,value:string):Guess|null{
 const expected=FIRST_WORDS[step];if(!expected||splitWord(value.trim()).join('')!==splitWord(expected).join(''))return null;
 const letters=splitWord(expected);return {letters,colors:score(letters,splitWord('수박'))};
}
export function readFirstPlay(storage:Pick<Storage,'getItem'>):Guess[]{
 try{const n=JSON.parse(storage.getItem(KEY)||'0');return Number.isInteger(n)&&n>=0&&n<=3?FIRST_WORDS.slice(0,n).map((word,i)=>firstGuess(i,word)!):[]}catch{return []}
}
export function saveFirstPlay(storage:Pick<Storage,'setItem'>,guesses:Guess[]){try{storage.setItem(KEY,JSON.stringify(guesses.length))}catch{}}
