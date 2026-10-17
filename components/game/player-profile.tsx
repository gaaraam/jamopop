'use client';
import {SafetyActions} from '@/components/safety/actions';
import {CharacterAvatar} from '@/components/game/character-avatar';

import {useEffect,useState} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {titleNames} from './party-panel';

type Stats={completed:number;wins:number;average:number|null};
type Profile={name:string;avatar:string;skin?:string|null;linked:boolean;level:number|null;title:string;overall:Stats;room:Stats};
function RecordBlock({label,stats}:{label:string;stats:Stats}){
 return <section className="profile-record"><h3>{label}</h3><div className="profile-metrics">
 <div><strong>{stats.wins}<small>승</small></strong><span>{stats.completed}판 완료</span></div>
 <div><strong>{stats.completed?Math.round(stats.wins/stats.completed*100):'—'}{stats.completed>0&&<small>%</small>}</strong><span>성공률</span></div>
 <div><strong>{stats.average==null?'—':stats.average.toFixed(1)}{stats.average!=null&&<small>회</small>}</strong><span>성공 평균 시도</span></div>
 </div></section>;
}
export function PlayerProfile({roomId,target,onClose,meId}:{meId?:string;roomId:string;target:{id:string;name:string}|null;onClose:()=>void}){
 const [result,setResult]=useState<{key:string;profile?:Profile;error?:string}|null>(null),[retry,setRetry]=useState(0);
 const key=target?roomId+':'+target.id:'';
 useEffect(()=>{
  if(!target)return;
  const controller=new AbortController();let alive=true;
  const timer=setTimeout(()=>controller.abort(),10000);
  void fetch('/api/game?room='+encodeURIComponent(roomId)+'&profile='+encodeURIComponent(target.id),{signal:controller.signal})
   .then(async r=>{const d=await r.json() as Profile&{error?:string};if(!r.ok)throw Error(d.error||'정보를 불러오지 못했어요.');if(alive)setResult({key,profile:d})})
   .catch(e=>{if(alive)setResult({key,error:e.name==='AbortError'?'응답이 늦어지고 있어요. 다시 시도해 주세요.':e.message})})
   .finally(()=>clearTimeout(timer));
  return()=>{alive=false;clearTimeout(timer);controller.abort()};
 },[roomId,target?.id,key,retry]);
 const current=result?.key===key?result:null,p=current?.profile;
 return <Dialog open={!!target} onOpenChange={open=>{if(!open)onClose()}}><DialogContent className="rule-dialog player-profile-dialog">
 <DialogTitle className="sr-only">{target?.name} 프로필</DialogTitle>
 <DialogDescription className="sr-only">참가자의 레벨과 전체 및 현재 방 게임 전적입니다.</DialogDescription>
 {p?<><header className="public-profile-hero"><span className="public-profile-avatar"><CharacterAvatar avatar={p.avatar} skin={p.skin}/></span><div><span className="public-profile-level">{p.linked?`Lv. ${p.level}`:'게스트'}</span><h2>{p.name}</h2>{p.title&&<span className="public-profile-title">{titleNames[p.title]||p.title}</span>}</div></header>
 <div className="safety-profile-actions">{target&&target.id!==meId&&<SafetyActions target={{kind:'member',id:target.id,room:roomId}} name={p.name}/>}</div><RecordBlock label="전체 전적" stats={p.overall}/><RecordBlock label="현재 방" stats={p.room}/>
 <p className="profile-scope">방 게임 기준 · 연습·개인 도전 제외</p>
 </>:current?.error?<div className="profile-state" role="alert"><p>{current.error}</p><button onClick={()=>{setResult(null);setRetry(n=>n+1)}}>다시 불러오기</button></div>:<div className="profile-state" role="status">프로필을 불러오는 중…</div>}
 </DialogContent></Dialog>;
}
