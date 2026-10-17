'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {changed,safetyPost} from './actions';
type Restriction={kind:string;reason:string;expiresAt:number};
const status:Record<string,string>={new:'접수',reviewing:'확인 중',closed:'처리 완료'};
export function SafetySettings(){
 const [data,setData]=useState<{blocks:{id:string;name:string;mode:string}[];reports:{id:string;name:string;reason:string;status:string}[];restriction:Restriction|null}|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);const lock=useRef(false);
 const load=useCallback(async(signal?:AbortSignal)=>{try{const r=await fetch('/api/safety',{signal:signal||AbortSignal.timeout(10000)});const d=await r.json() as NonNullable<typeof data>&{error?:string};if(signal?.aborted)return;if(!r.ok)throw Error(d.error);setData(d);setError('')}catch(e){if(!signal?.aborted)setError((e as Error).message)}},[]);
 useEffect(()=>{const c=new AbortController();void load(c.signal);return()=>c.abort()},[load]);
 async function remove(id:string){if(lock.current)return;lock.current=true;setBusy(true);try{await safetyPost({action:'unblock',id});changed();await load()}catch(e){setError((e as Error).message)}finally{lock.current=false;setBusy(false)}}
 return <details className="support-ticket safety-settings"><summary><strong>차단 관리 · 내 신고</strong></summary><div className="support-ticket-body">{error&&<p role="alert">{error}<button onClick={()=>void load()}>다시 불러오기</button></p>}{data?.restriction&&<p role="status">{data.restriction.kind==='warn'?'주의 안내':'이용 제한'} · {data.restriction.reason}<br/>{new Date(data.restriction.expiresAt).toLocaleString('ko-KR')}까지 · 아래 문의로 이의를 신청할 수 있어요.</p>}<h3>숨김·차단</h3>{data?.blocks.map(b=><div className="safety-list-row" key={b.id}><span><b>{b.name}</b><small>{b.mode==='block'?'사용자 차단':'대화 숨김'}</small></span><button disabled={busy} onClick={()=>void remove(b.id)}>해제</button></div>)}{data&&!data.blocks.length&&<p>숨기거나 차단한 사용자가 없어요.</p>}<h3>내 신고</h3>{data?.reports.map(r=><div className="safety-list-row" key={r.id}><span><b>{r.name}</b><small>{r.reason}</small></span><span>{status[r.status]}</span></div>)}{data&&!data.reports.length&&<p>접수한 신고가 없어요.</p>}</div></details>;
}
// Initial load and explicit actions only: no additional polling loop.
export function SafetyNotice(){
 const [item,setItem]=useState<Restriction|null>(null);
 useEffect(()=>{let alive=true;const c=new AbortController();async function load(){try{const r=await fetch('/api/safety?notice=1',{signal:c.signal});if(!r.ok)return;const d=await r.json() as {restriction?:Restriction};if(alive)setItem(d.restriction||null)}catch{}}void load();window.addEventListener('jamopop-safety-change',load);return()=>{alive=false;c.abort();window.removeEventListener('jamopop-safety-change',load)}},[]);
 useEffect(()=>{if(!item)return;const timer=setTimeout(()=>setItem(null),Math.max(0,item.expiresAt-Date.now()));return()=>clearTimeout(timer)},[item?.expiresAt]);
 if(!item||item.expiresAt<=Date.now())return null;
 return <aside className="safety-notice" role="status"><strong>{item.kind==='warn'?'주의 안내':item.kind==='chat_mute'?'대화·그림 공유 제한':'이용 일시 제한'}</strong><span>{item.reason}</span><a href="/support">문의·이의 신청</a></aside>;
}
