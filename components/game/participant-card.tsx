'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {shouldCelebrateRank,shouldCelebrateWin} from '@/lib/rank-feedback';

import {unseenCheers,type Cheer} from '@/lib/cheers';
import {animateCharacterReaction} from '@/lib/character-motion.mjs';
import {launchCheerBurst} from '@/lib/cheer-burst';

function CheerBurst({emoji,eventId,confetti=false}:{emoji:string;eventId:string;confetti?:boolean}){
 const anchor=useRef<HTMLSpanElement>(null);
 const releases=useRef<(()=>void)[]>([]);
 useEffect(()=>{if(anchor.current){releases.current.push(launchCheerBurst(anchor.current,emoji,confetti));if(releases.current.length>8)releases.current.shift()?.()}},[emoji,eventId,confetti]);
 useEffect(()=>()=>{for(const release of releases.current)release()},[]);
 return <span ref={anchor} className="member-cheer-burst" aria-hidden="true"><b className="cheer-still">{emoji}</b></span>;
}

type Props={successLabel?:string;hintUsed?:boolean;memberId:string;reactions:Cheer[];serverNow:number;roundId:string;rank?:number;won:boolean;attempts:number;status:string;name:string;children:ReactNode};
export function ParticipantCard({successLabel,hintUsed,memberId,reactions,serverNow,roundId,rank,won,attempts,status,name,children}:Props){
 const card=useRef<HTMLElement>(null);
 const seenCheers=useRef(new Set(reactions.map(r=>r.id)));
 const [burst,setBurst]=useState<Cheer|null>(null);
 useEffect(()=>{
  const fresh=unseenCheers(reactions,memberId,seenCheers.current,serverNow);
  for(const r of reactions)seenCheers.current.add(r.id);
  if(seenCheers.current.size>512)seenCheers.current=new Set([...seenCheers.current].slice(-256));
  if(fresh.length)setBurst(fresh[fresh.length-1]);
 },[reactions,memberId,serverNow]);
 useEffect(()=>{if(!burst)return;const timer=setTimeout(()=>setBurst(null),3700);return()=>clearTimeout(timer)},[burst]);
 const previousWin=useRef({roundId,won});
 const [winBurst,setWinBurst]=useState(0);
 useEffect(()=>{if(shouldCelebrateWin(previousWin.current,{roundId,won}))setWinBurst(n=>n+1);previousWin.current={roundId,won}},[roundId,won]);
 useEffect(()=>{if(!winBurst)return;const timer=setTimeout(()=>setWinBurst(0),3700);return()=>clearTimeout(timer)},[winBurst]);
 const reactionKey=winBurst?`win:${roundId}:${winBurst}`:burst?.id||'';
 useEffect(()=>{
  if(!reactionKey||!card.current||document.hidden)return;
  const avatar=card.current.querySelector('.room-member-avatar > .kongal-avatar');
  if(!avatar||!avatar.getClientRects().length)return;
  return animateCharacterReaction(avatar,winBurst?'win':'cheer');
 },[reactionKey]);
 const podium=won&&rank&&rank<=3?rank:undefined;
 const previous=useRef({roundId,rank:podium});
 const [pulse,setPulse]=useState(0);
 useEffect(()=>{
  if(shouldCelebrateRank(previous.current,{roundId,rank:podium}))setPulse(n=>n+1);
  previous.current={roundId,rank:podium};
 },[roundId,podium]);
 // A fresh round remounts the card, so no animation can spill into another puzzle.
 return <article ref={card} data-character-reaction={winBurst?'win':burst?'cheer':undefined} data-fx-member={memberId} className={`room-member ${won?'is-winner':''} ${podium?`podium-card podium-${podium}`:''}`}>
  {children}
  {hintUsed&&<span className="hint-used-badge">힌트 사용</span>}
  {winBurst>0&&<CheerBurst emoji="🎉" eventId={`win-${winBurst}`} confetti/>}
  {burst&&<CheerBurst eventId={burst.id} emoji={burst.emoji}/>}
  {podium?<button className="room-member-status podium-badge" onClick={()=>setPulse(n=>n+1)} title={`${podium}위 · ${successLabel||`${attempts}회 성공`} · 눌러서 축하하기`} aria-label={`${name} ${podium}위, ${successLabel||`${attempts}회 성공`}. 축하 효과 다시 보기`}><span aria-hidden="true">{['','🥇','🥈','🥉'][podium]}</span><b>{podium}위</b></button>:<span className={`room-member-status ${won?'won':''}`}>{won?'✓ ':''}{status}</span>}
  {podium&&pulse>0&&<span className="podium-celebration" key={`${roundId}-${pulse}`} aria-hidden="true" onAnimationEnd={e=>{if(e.target===e.currentTarget)setPulse(0)}}><i/><i/><i/><i/><i/><i/></span>}
 </article>;
}
