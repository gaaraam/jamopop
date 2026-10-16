import {splitWord,score,type Guess} from './game';
export type Stage={id:number;name:string;width:number;seconds:number;attempts:number;tier:'easy'|'normal'|'challenge'};
const specs:[string,number,number,number,Stage['tier']][]=[['첫 발걸음',5,0,6,'easy'],['단서 찾기',5,0,6,'easy'],['다섯 번의 기회',5,0,5,'easy'],['시계가 움직이면',5,180,5,'easy'],['차분한 추리',5,180,5,'normal'],['60초 스프린트',5,60,5,'easy'],['한 칸 더',6,180,5,'normal'],['세 번의 선택',5,0,3,'normal'],['여섯 칸 탐색',6,180,5,'normal'],['정확한 한 수',6,120,4,'normal'],['어휘 탐험',5,120,4,'challenge'],['시간을 잊고',6,0,3,'normal'],['일곱 칸 입문',7,180,5,'normal'],['마지막 집중',6,120,4,'challenge'],['정상에 서다',7,120,4,'challenge']];
export const STAGES:Stage[]=specs.map(([name,width,seconds,attempts,tier],i)=>({id:i+1,name,width,seconds,attempts,tier}));
export type SoloRun={id:string;stage:number;answer:string;startedAt:number;endsAt:number|null;status:'playing'|'won'|'lost'|'timeout'|'abandoned';guesses:Guess[];stars:number};
export type SoloState={best:Record<string,number>;recent:string[];active:SoloRun|null;xp:number};
export const emptySolo=():SoloState=>({best:{},recent:[],active:null,xp:0});
export function unlockedStage(state:SoloState){let n=1;while(n<STAGES.length&&state.best[n])n++;return n;}
export function expireSolo(state:SoloState,now:number){if(state.active?.status==='playing'&&state.active.endsAt!==null&&now>=state.active.endsAt)state.active.status='timeout';return state;}
export function starsFor(attempts:number,limit:number){return attempts<=Math.max(1,limit-3)?3:attempts<=limit-1?2:1;}
export function finishSoloGuess(state:SoloState,letters:string[],now:number){
 const r=state.active;if(!r||r.status!=='playing')throw new Error('진행 중인 도전이 없어요.');
 expireSolo(state,now);if(r.status!=='playing')throw new Error('시간이 종료됐어요.');
 const stage=STAGES[r.stage-1];if(letters.length!==stage.width)throw new Error(`${stage.width}칸 단어를 입력해 주세요.`);
 const colors=score(letters,splitWord(r.answer));r.guesses.push({letters,colors});
 if(colors.every(c=>c==='green')){r.status='won';r.stars=starsFor(r.guesses.length,stage.attempts);const previous=state.best[r.stage]||0;if(r.stars>previous){state.best[r.stage]=r.stars;state.xp+=(previous?0:30)+(r.stars-previous)*20;}}
 else if(r.guesses.length>=stage.attempts)r.status='lost';
 return state;
}
export function publicSolo(state:SoloState){return {...state,recent:undefined,active:state.active?{...state.active,answer:state.active.status==='playing'?undefined:state.active.answer}:null};}
