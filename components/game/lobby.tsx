'use client';
import {CharacterAvatar} from '@/components/game/character-avatar';

import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {Plus,RefreshCw,Search,Users,ArrowRight,Archive,RotateCcw,MoreHorizontal,Eye,LockKeyhole} from 'lucide-react';

import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem,DropdownMenuSeparator} from '@/components/ui/dropdown-menu';
import {Companions,type PeopleSnapshot} from './companions';
import {ownSync,publishNotice,publishInvitations,publishRoom} from '@/lib/sync-client';
import {pollDelay} from '@/lib/sync-policy.mjs';
import {RoomChat,type ChatSnapshot} from './chat';
const noBubbles=()=>{};
export type LobbyRoom={id:string;name:string;locked?:boolean;hostName:string|null;width:number;roundNo:number;memberCount:number;onlineCount:number;lastActive:number;variant?:string;playing?:number;won?:number;preview?:{id:string;name:string;avatar:string;skin?:string|null;online:boolean;spectator:boolean;status:string;progress:number}[]};
export function Lobby({onSelect,onCreate,onRegister,signedIn,playerName,playerAvatar,headerTools}:{headerTools?:ReactNode;playerName:string;playerAvatar:string;onSelect:(room:Pick<LobbyRoom,'id'|'name'|'locked'>,spectator?:boolean)=>void;onCreate:()=>void;onRegister:()=>void;signedIn:boolean|null}){
 const [profile,setProfile]=useState<{avatar:string;skin?:string}|null>(null);
 const [rooms,setRooms]=useState<LobbyRoom[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[search,setSearch]=useState(''),[activeOnly,setActiveOnly]=useState(false),[hasMore,setHasMore]=useState(false);
 const [isAdmin,setIsAdmin]=useState(false),[archived,setArchived]=useState(false),[busy,setBusy]=useState<string|null>(null);
 const [people,setPeople]=useState<PeopleSnapshot>();const [chat,setChat]=useState<ChatSnapshot>();const [self,setSelf]=useState<{level:number;current:number;required:number}|null>(null);const activity=useRef(Date.now()),chatOpen=useRef(false);const onChatOpen=useCallback((open:boolean)=>{chatOpen.current=open},[]);
 const mutating=useRef(false);
 const controller=useRef<AbortController|null>(null);
 const refresh=useCallback(async()=>{
  if(controller.current||mutating.current)return;
  const current=new AbortController();controller.current=current;
  const timeout=setTimeout(()=>current.abort(),10000);
  setLoading(true);
  try{
   const response=await fetch(`/api/game?lobby=1${archived?'&archived=1':''}`,{signal:current.signal});
   if(!response.ok)throw new Error();
   const result=await response.json() as {profile:{avatar:string;skin?:string}|null;rooms:LobbyRoom[];serverNow:number;hasMore:boolean;isAdmin:boolean;chat:ChatSnapshot;announcement:any;people:PeopleSnapshot;invitations:any;progression:{level:number;current:number;required:number}|null};
   if(controller.current!==current)return;
   publishInvitations(result.invitations);publishRoom(null);setPeople(result.people);setProfile(result.profile);setSelf(result.progression);setChat(result.chat);publishNotice(result.announcement);setIsAdmin(result.isAdmin);setRooms(result.rooms);setHasMore(result.hasMore);setError('');
  }catch{if(controller.current===current)setError('방 목록을 불러오지 못했어요. 다시 시도해 주세요.');}
  finally{clearTimeout(timeout);if(controller.current===current){controller.current=null;setLoading(false);}}
 },[archived]);
 useEffect(()=>{
  const release=ownSync();let last=Date.now();void refresh();const run=()=>{last=Date.now();void refresh()};const timer=setInterval(()=>{if(!document.hidden&&Date.now()-last>=pollDelay({lobby:true,idleMs:Date.now()-activity.current,chatOpen:chatOpen.current}))run()},500);const active=()=>{activity.current=Date.now()};window.addEventListener('pointerdown',active);window.addEventListener('keydown',active);
  const visible=()=>{if(!document.hidden)run()};document.addEventListener('visibilitychange',visible);
  return()=>{release();clearInterval(timer);window.removeEventListener('pointerdown',active);window.removeEventListener('keydown',active);document.removeEventListener('visibilitychange',visible);const old=controller.current;controller.current=null;old?.abort();};
 },[refresh]);
  const organize=async(room:LobbyRoom)=>{
  if(mutating.current)return;
  if(!archived&&!window.confirm(`‘${room.name}’ 방을 대기실에서 숨길까요?\n게임과 기록은 유지되며, 보관된 방에서 복원할 수 있어요.`))return;
  mutating.current=true;const pending=controller.current;controller.current=null;pending?.abort();setLoading(false);setBusy(room.id);setError('');
  try{const response=await fetch('/api/game',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:archived?'restore_room':'archive_room',room:room.id})});const data=await response.json() as {error?:string};if(!response.ok)throw new Error(data.error||'방을 정리하지 못했어요.');setRooms(v=>v.filter(r=>r.id!==room.id));}
  catch(e){setError(e instanceof Error?e.message:'다시 시도해 주세요.');}finally{mutating.current=false;setBusy(null);}
 };
 const visible=rooms.filter(r=>(!activeOnly||r.onlineCount>0)&&`${r.name} ${r.hostName||''}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
 return <section className="room-lobby game-lounge" aria-label="방 대기실">
  <header className="lounge-heading"><div className="lounge-title"><h1>{archived?'보관된 방':'대기실'}</h1><span className="lounge-room-total">{rooms.length}개 방</span></div><div className="lounge-entry-actions"><a href="/solo" className="lounge-solo"><span aria-hidden="true">🏢</span><strong>개인 도전</strong></a><button className="primary lounge-create" onClick={onCreate}><Plus size={20}/>방 만들기</button><div className="lounge-header-tools">{headerTools}</div></div></header>
  <div className="lounge-layout"><div className="lounge-play-area">
  {isAdmin&&<div className="lobby-archive-tabs"><button className={!archived?'lobby-filter selected':'lobby-filter'} aria-pressed={!archived} disabled={loading||!!busy} onClick={()=>{if(archived){setRooms([]);setArchived(false);}}}>열린 방</button><button className={archived?'lobby-filter selected':'lobby-filter'} aria-pressed={archived} disabled={loading||!!busy} onClick={()=>{if(!archived){setRooms([]);setArchived(true);}}}><Archive size={15}/>보관된 방</button><span>보관해도 게임과 기록은 유지됩니다.</span></div>}
  <div className="lobby-toolbar"><label className="lobby-search"><Search size={18}/><input aria-label="방 이름 또는 방장 검색" placeholder="방 이름 또는 방장 검색" value={search} onChange={e=>setSearch(e.target.value)}/></label><button className={activeOnly?'lobby-filter selected':'lobby-filter'} aria-pressed={activeOnly} onClick={()=>setActiveOnly(v=>!v)}>접속 중인 방</button><button className="icon-btn" aria-label="방 목록 새로고침" disabled={loading} onClick={()=>void refresh()}><RefreshCw size={18}/></button></div>
  {error&&<div className="lobby-error" role="alert">{error}<button className="text-btn" onClick={()=>void refresh()} disabled={loading}>다시 시도</button></div>}
  <div className="lobby-room-grid" aria-busy={loading}>
   {visible.map(r=><article className={`lobby-room lounge-room ${r.onlineCount?'room-awake':'room-quiet'}`} key={r.id}>
    <div className="room-card-heading"><h2>{r.locked&&<LockKeyhole size={15} aria-label="비밀번호 방"/>}{r.name}</h2><DropdownMenu><DropdownMenuTrigger asChild><button className="room-card-more" aria-label={`${r.name} 더보기`}><MoreHorizontal size={21}/></button></DropdownMenuTrigger><DropdownMenuContent align="end" className="room-card-menu"><div className="room-card-details"><b>{r.width}칸 · {r.roundNo||1}번째 판</b><span>방장 {r.hostName||'—'}</span></div><DropdownMenuSeparator/><DropdownMenuItem onSelect={()=>onSelect(r,true)}><Eye size={16}/>관전하기</DropdownMenuItem>{isAdmin&&<DropdownMenuItem disabled={!!busy} onSelect={()=>void organize(r)}>{archived?<RotateCcw size={16}/>:<Archive size={16}/>} {busy===r.id?'처리 중…':archived?'대기실로 복원':'방 보관'}</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu></div>
    <div className="room-card-badges"><span className={`room-mode-badge mode-${r.variant||'normal'}`}><span aria-hidden="true">{r.variant==='speed'?'⚡':r.variant==='items'?'🎁':'🎯'}</span>{r.variant==='speed'?'스피드전':r.variant==='items'?'아이템전':'일반전'}</span><span className={`room-state-badge ${r.playing?'running':''}`}><i/>{r.playing?'플레이 중':r.won?`${r.won}명 성공`:'대기 중'}</span></div>
    <div className="lounge-stage"><div className="lounge-stage-grid" aria-hidden="true">{Array.from({length:25},(_,i)=><i key={i}/>)}</div><div className="lobby-cast" aria-label="참가자 진행상황">{(r.preview||[]).map(m=><div key={m.id} className={`lobby-character ${m.online?'is-online':''} ${m.status==='won'?'is-winner':m.status==='playing'?'is-playing':''}`} title={`${m.name} · ${m.spectator?'관전':m.status==='won'?'성공':m.status==='lost'?'종료':m.progress?`${m.progress}${r.variant==='speed'?'문제 완료':'회 시도'}`:'도전 전'}`}><div className="lobby-avatar"><span><CharacterAvatar avatar={m.avatar} skin={m.skin}/></span>{m.status==='won'?<b>★</b>:m.online?<i/>:null}</div><span className="lobby-character-name">{m.name}</span><div className="lobby-pips" aria-label={`${m.name} ${m.progress}${r.variant==='speed'?'문제 완료':'회 시도'}`}>{Array.from({length:5},(_,i)=><i key={i} className={i<m.progress?'filled':''}/>)}</div></div>)}{r.memberCount<6&&Array.from({length:Math.min(2,6-r.memberCount)},(_,i)=><button key={`seat-${i}`} className="lounge-seat" aria-label={`${r.name} 빈자리로 입장`} onClick={()=>onSelect(r)}><Plus size={20}/></button>)}{r.memberCount>6&&<span className="lobby-more">+{r.memberCount-6}</span>}</div></div>
    <div className="room-card-footer"><span className="room-count" aria-label={`참가자 ${r.memberCount}명, 최대 40명`}><Users size={17}/><b>{r.memberCount}</b><span>/ 40</span></span><button className="room-enter" aria-label={`${r.name} ${signedIn===false?'게스트로 입장':'입장'}`} onClick={()=>onSelect(r)}>{signedIn===false?'게스트로 입장':'입장하기'}<ArrowRight size={18}/></button></div>
   </article>)}
  </div>
  {!visible.length&&!error&&<div className="lobby-empty" role="status">{loading?'방 목록을 불러오는 중…':search||activeOnly?'조건에 맞는 방이 없어요.':archived?'보관된 방이 없어요.':'아직 방이 없어요. 첫 방을 만들어 보세요.'}</div>}
  {hasMore&&<p className="lobby-note">최근 활동 순으로 100개 방까지 표시합니다.</p>}
  </div><aside className="lounge-sidebar" aria-label="내 정보와 친구">
   <section className="lounge-account">
    <button className="lounge-player" onClick={onRegister} aria-label="내 캐릭터와 프로필"><span className="lounge-my-avatar"><CharacterAvatar avatar={profile?.avatar||playerAvatar||'🐱'} skin={profile?.skin}/></span><span className="lounge-player-info"><small>{signedIn?'내 캐릭터':'게스트 프로필'}</small><strong>{playerName||'게스트'}</strong>{self&&<><em>Lv.{self.level}</em><progress aria-label="레벨 경험치" value={self.current} max={self.required}/></>}</span><ArrowRight size={16}/></button>
    <div className="lounge-account-actions"><a href="/shop">콩알 옷장<ArrowRight size={15}/></a>{signedIn===false&&<button onClick={onRegister}>계정 연동<ArrowRight size={15}/></button>}{isAdmin&&<a href="/admin">운영<ArrowRight size={15}/></a>}</div>
   </section>
   <Companions snapshot={people} onRoom={onSelect} onRegister={onRegister}/>
  </aside></div>
 <RoomChat bundled snapshot={chat} onOpenChange={onChatOpen} lobby roomId="lobby" meId="me" isHost={false} onMessages={noBubbles}/>
 </section>;
}
