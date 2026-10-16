'use client';
import {ThemeSwitch} from '@/components/theme';
import {useState} from 'react';
import {ArrowRight,RotateCcw,HelpCircle} from 'lucide-react';
import {score,splitWord} from '@/lib/game';
const examples=['사과','바람','구름','여름','수박'];
const answer=splitWord('수박');
export function Intro({onStart,onHelp}:{onStart:()=>void;onHelp:()=>void}){
 const [step,setStep]=useState(0);
 return <main className="signature-page">
  <h1 className="sr-only">자음모음팝</h1>
  <header className="signature-nav"><ThemeSwitch/><button onClick={onHelp} aria-label="게임 방법"><HelpCircle size={18}/><span>게임 방법</span></button></header>
  <section className="signature-center" aria-label="25칸 워들 체험">
   <div className="signature-halo" aria-hidden="true"/>
   <div className="signature-board" aria-label="다섯 번의 시도, 각 다섯 칸">{examples.map((word,row)=>{const letters=splitWord(word),colors=score(letters,answer),submitted=row<step;return letters.map((letter,col)=><div key={`${row}-${col}-${submitted}`} className={`signature-tile ${submitted?colors[col]:row===step?'current':'empty'}`} style={{animationDelay:`${submitted?col*75:(row+col)*35}ms`}} aria-label={`${row+1}번째 줄 ${col+1}칸 ${submitted?letter+' '+{green:'위치 일치',yellow:'다른 위치',gray:'미포함 또는 초과'}[colors[col]]:row===step?letter:'빈칸'}`}><span>{submitted||row===step?letter:''}</span></div>);})}</div>
   <div className="signature-console"><span aria-live="polite">{step===5?<><i className="signature-dot"/>정답 · 수박</>:<><b>{examples[step]}</b><span className="signature-arrow">→</span><span>{splitWord(examples[step]).join(' ')}</span></>}</span><button onClick={()=>setStep(s=>s===5?0:s+1)} aria-label={step===5?'체험 다시 하기':'예시 제출하기'}>{step===5?<RotateCcw size={15}/>:<ArrowRight size={15}/>}<span>{step===5?'다시':'제출'}</span></button></div>
   <div className="signature-legend"><span><i className="good"/>위치 일치</span><span><i className="near"/>다른 위치</span><span><i className="miss"/>미포함·개수 초과</span></div>
   <button className="signature-start" onClick={onStart}>시작하기<ArrowRight size={19}/></button>
   <span className="signature-note">로그인 없이 참여 가능</span>
  </section>
 </main>;
}
