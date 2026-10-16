 'use client';
import {useEffect,useRef,useState} from 'react';
import {hasSync,latestNotice} from '@/lib/sync-client';
import {Megaphone,X} from 'lucide-react';
export function Announcement(){
 const [notice,setNotice]=useState<{body:string;revision:number}|null>(null),[dismissed,setDismissed]=useState(0);const pending=useRef(false);
 useEffect(()=>{let alive=true;try{setDismissed(Number(sessionStorage.getItem('bw_notice_dismissed')||0))}catch{}const receive=(e:Event)=>{if(alive)setNotice((e as CustomEvent).detail)};window.addEventListener('jamopop-notice',receive);if(latestNotice()!==undefined)setNotice(latestNotice());const load=async()=>{if(pending.current||hasSync())return;pending.current=true;try{const r=await fetch('/api/announcements',{signal:AbortSignal.timeout(10000)});if(r.ok){const d=await r.json() as {announcement:{body:string;revision:number}|null};if(alive)setNotice(d.announcement)}}catch{}finally{pending.current=false}};const initial=setTimeout(()=>void load(),0);const timer=setInterval(()=>{if(!document.hidden)void load()},60000);const visible=()=>{if(!document.hidden)void load()};document.addEventListener('visibilitychange',visible);return()=>{alive=false;clearTimeout(initial);clearInterval(timer);window.removeEventListener('jamopop-notice',receive);document.removeEventListener('visibilitychange',visible)}},[]);
 if(!notice||notice.revision===dismissed)return null;
 return <aside className="global-announcement" role="status" aria-label="전체 공지"><Megaphone size={19}/><strong>전체 공지</strong><p>{notice.body}</p><button aria-label="공지 닫기" onClick={()=>{setDismissed(notice.revision);try{sessionStorage.setItem('bw_notice_dismissed',String(notice.revision))}catch{}}}><X size={18}/></button></aside>
}
