'use client';
import {SafetyActions,type SafetyTarget} from '@/components/safety/actions';
import {isChatToggleKey} from '@/lib/chat-shortcut.mjs';
import {CharacterAvatar} from '@/components/game/character-avatar';

import {useCallback,useEffect,useRef,useState,type CSSProperties} from 'react';
import type {BubbleMessage} from '@/lib/chat-bubbles';
import {MessageCircle,ChevronDown,Send,Trash2,Smile} from 'lucide-react';
export type Message={id:number;memberId:string;name:string;avatar:string;skin?:string|null;body:string;createdAt:number;deleted:number;system?:number;canDelete?:boolean;safetyTarget?:SafetyTarget};
export type ChatSnapshot={messages:Message[];serverNow:number;name?:string};
export function RoomChat({bundled=false,snapshot,onOpenChange,roomId,meId,isHost,onMessages,openRequest=0,lobby=false,spectator=false}:{bundled?:boolean;snapshot?:ChatSnapshot;onOpenChange?:(open:boolean)=>void;spectator?:boolean;lobby?:boolean;roomId:string;meId:string;isHost:boolean;openRequest?:number;onMessages:(roomId:string,messages:BubbleMessage[],serverNow:number)=>void}){
 const [open,setOpen]=useState(false),[messages,setMessages]=useState<Message[]>([]),[draft,setDraft]=useState(''),[sending,setSending]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[read,setRead]=useState(0),[inquirySent,setInquirySent]=useState(false);
 const acceptedAt=useRef(0);
 const root=useRef<HTMLElement>(null);
 const [clock,setClock]=useState(Date.now()),[serverOffset,setServerOffset]=useState(0),[keyboardBottom,setKeyboardBottom]=useState(0),[viewportHeight,setViewportHeight]=useState(0);
 const [emojiOpen,setEmojiOpen]=useState(false);
 const [chatName,setChatName]=useState('');
 const endpoint=lobby?'/api/lobby-chat':'/api/game';
 useEffect(()=>{if(lobby){try{setChatName(localStorage.getItem('bw_lobby_chat_name')||'');}catch{}}},[lobby]);
 const list=useRef<HTMLDivElement>(null),input=useRef<HTMLTextAreaElement>(null),follow=useRef(true),busy=useRef(false),epoch=useRef(0),alive=useRef(true),composing=useRef(false),compositionEnd=useRef(0),pending=useRef<{body:string;id:string}|null>(null),initialized=useRef(false);
 useEffect(()=>{if(openRequest){follow.current=true;setOpen(true);}},[openRequest]);
 const readKey=`bw_chat_read:${roomId}:${meId}:${spectator}`,draftKey=`bw_chat_draft:${roomId}:${meId}:${spectator}`;
 const markRead=useCallback((id:number)=>{setRead(previous=>Math.max(previous,id));try{localStorage.setItem(readKey,String(id));}catch{}},[readKey]);
 const accept=useCallback((items:Message[],serverNow:number)=>{
  if(serverNow<acceptedAt.current)return;acceptedAt.current=serverNow;
  onMessages(roomId,items.filter(m=>!m.system),serverNow);
  setMessages(items);setServerOffset(serverNow-Date.now());setClock(Date.now());
  if(!initialized.current){initialized.current=true;let saved:string|null=null;try{saved=localStorage.getItem(readKey);}catch{}const parsed=Number(saved);const initial=saved!==null&&Number.isFinite(parsed)?parsed:items.at(-1)?.id||0;setRead(initial);try{localStorage.setItem(readKey,String(initial));}catch{}}
 },[readKey,roomId,onMessages]);
 const load=useCallback(async()=>{
  if(busy.current)return;const revision=epoch.current;
  try{const response=await fetch(lobby?endpoint:`${endpoint}?room=${roomId}&chat=1`,{signal:AbortSignal.timeout(10000)});const result=await response.json() as {messages:Message[];serverNow:number;error?:string;name?:string};if(!response.ok)throw new Error(result.error||'채팅 연결을 확인해 주세요.');if(alive.current&&revision===epoch.current){accept(result.messages,result.serverNow);if(lobby&&result.name)setChatName(n=>n||result.name||'');setError('');}}
  catch(e){if(alive.current&&revision===epoch.current)setError((e as Error).name==='TimeoutError'?'채팅 연결이 지연되고 있어요.':(e as Error).message);}
  finally{if(alive.current)setLoading(false);}
 },[roomId,accept,lobby,endpoint]);
 useEffect(()=>{if(snapshot&&!busy.current){accept(snapshot.messages,snapshot.serverNow);setLoading(false);if(lobby&&snapshot.name)setChatName(n=>n||snapshot.name||'')}},[snapshot,accept,lobby]);
 useEffect(()=>{const update=()=>{epoch.current++;void load()};window.addEventListener('jamopop-safety-change',update);return()=>window.removeEventListener('jamopop-safety-change',update)},[load]);
 useEffect(()=>{onOpenChange?.(open);return()=>onOpenChange?.(false)},[open,onOpenChange]);
 useEffect(()=>{alive.current=true;try{setDraft(sessionStorage.getItem(draftKey)||'');}catch{}if(bundled)return()=>{alive.current=false;epoch.current++};void load();let inflight=false;const tick=async()=>{if(document.hidden||inflight)return;inflight=true;await load();inflight=false;};const timer=setInterval(()=>void tick(),3000);const visible=()=>{if(!document.hidden)void tick();};document.addEventListener('visibilitychange',visible);return()=>{alive.current=false;epoch.current++;clearInterval(timer);document.removeEventListener('visibilitychange',visible);};},[load,draftKey,bundled]);
 useEffect(()=>{if(open&&follow.current){const frame=requestAnimationFrame(()=>{if(list.current)list.current.scrollTop=list.current.scrollHeight;markRead(messages.at(-1)?.id||0);});return()=>cancelAnimationFrame(frame);}},[open,messages,markRead]);

 useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),1000);return()=>clearInterval(timer)},[]);
 useEffect(()=>{if(!open)return;const outside=(e:PointerEvent)=>{if((e.target as Element)?.closest?.('[role=dialog],[role=menu]'))return;if(root.current&&!root.current.contains(e.target as Node))setOpen(false)};const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!e.isComposing&&!document.querySelector('[role=dialog]')){setOpen(false);input.current?.blur()}};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)}},[open]);
 useEffect(()=>{if(!open||!window.matchMedia('(pointer:coarse)').matches)return;const viewport=window.visualViewport;if(!viewport)return;const startX=window.scrollX,startY=window.scrollY;const body=document.body,previous={position:body.style.position,top:body.style.top,left:body.style.left,width:body.style.width};Object.assign(body.style,{position:'fixed',top:`-${startY}px`,left:`-${startX}px`,width:'100%'});const update=()=>{const focused=root.current?.contains(document.activeElement);const inset=Math.max(0,window.innerHeight-viewport.height-viewport.offsetTop);setKeyboardBottom(focused?inset:0);setViewportHeight(viewport.height);};viewport.addEventListener('resize',update);viewport.addEventListener('scroll',update);root.current?.addEventListener('focusin',update);update();return()=>{viewport.removeEventListener('resize',update);viewport.removeEventListener('scroll',update);root.current?.removeEventListener('focusin',update);setKeyboardBottom(0);setViewportHeight(0);Object.assign(body.style,previous);window.scrollTo(startX,startY)}},[open]);
 const shortcutFocus=useRef(false);
 const shortcutReturn=useRef<HTMLElement|null>(null);
 useEffect(()=>{

  const toggle=(e:KeyboardEvent)=>{
   if(!isChatToggleKey(e)||composing.current||Date.now()-compositionEnd.current<80||document.querySelector('[role="dialog"],[role="alertdialog"]'))return;
   e.preventDefault();e.stopImmediatePropagation();
   if(open){
    setOpen(false);setEmojiOpen(false);input.current?.blur();
    const previous=shortcutReturn.current;
    if(previous?.isConnected&&!root.current?.contains(previous))previous.focus({preventScroll:true});
   }else{
    shortcutReturn.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
    follow.current=true;setOpen(true);
    shortcutFocus.current=true;
   }
  };
  document.addEventListener('keydown',toggle,true);
  return()=>{document.removeEventListener('keydown',toggle,true)};
 },[open]);
 useEffect(()=>{if(open&&shortcutFocus.current){shortcutFocus.current=false;input.current?.focus({preventScroll:true})}},[open]);
 const recent=messages.filter(m=>!m.deleted&&clock+serverOffset-m.createdAt<10000&&clock+serverOffset>=m.createdAt).slice(-2);
 function updateDraft(value:string){setDraft(value);try{sessionStorage.setItem(draftKey,value);}catch{}}
 async function mutate(body:Record<string,unknown>){
  busy.current=true;setSending(true);epoch.current++;setError('');
  try{const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room:roomId,name:chatName,...body}),signal:AbortSignal.timeout(10000)});const result=await response.json() as {messages:Message[];serverNow:number;error?:string;inquiryId?:string};if(!response.ok)throw new Error(result.error||'전송하지 못했어요. 다시 시도해 주세요.');if(alive.current){accept(result.messages,result.serverNow);setInquirySent(!!result.inquiryId);}return true;}
  catch(e){if(alive.current)setError((e as Error).name==='TimeoutError'?'전송 확인이 늦어지고 있어요. 다시 눌러도 중복 전송되지 않습니다.':(e as Error).message);return false;}
  finally{busy.current=false;if(alive.current)setSending(false);}
 }
 async function send(){const body=draft.trim();if(busy.current||!body||(lobby&&!chatName.trim())||composing.current||Date.now()-compositionEnd.current<80)return;if(pending.current?.body!==body)pending.current={body,id:crypto.randomUUID()};follow.current=true;input.current?.focus();if(await mutate({action:'chat_send',body,requestId:pending.current.id})){updateDraft('');setEmojiOpen(false);pending.current=null;input.current?.focus();}}
 const isInquiry=/^@문의(?:\s|$)/.test(draft.trim());
 const unread=messages.filter(m=>m.id>read&&m.memberId!==meId&&!m.deleted).length;
 return <section ref={root} style={{'--chat-keyboard-bottom':`${keyboardBottom}px`,...(viewportHeight?{'--chat-viewport-height':`${viewportHeight}px`}:{})} as CSSProperties} data-idle={!open&&!recent.length} className={`room-chat game-chat ${lobby?'lobby-chat':''}`} data-open={open} aria-label={lobby?'대기실 채팅':spectator?'관전자 채팅':'방 채팅'} onKeyDown={e=>e.stopPropagation()}>
  <button className="chat-toggle" title="채팅 열기/닫기 (백틱)" aria-keyshortcuts="`" aria-label={open?'채팅 접기':lobby?'대기실 채팅 열기':spectator?'관전자 채팅 열기':'방 채팅 열기'} aria-expanded={open} aria-controls="room-chat-panel" onClick={()=>{follow.current=true;setOpen(v=>!v);}}><MessageCircle size={19}/><strong><span className="chat-normal-label">{lobby?'대기실 채팅':spectator?'관전자 채팅':'방 채팅'}</span><span className="chat-sheet-label">대화</span></strong>{unread>0&&<span className="chat-badge">{unread>=60?'60+':unread}</span>}{open?<ChevronDown size={19}/>:<span className="chat-toggle-hint">열기</span>}</button>
  {!open&&recent.length>0&&<button className="chat-peek" aria-label="최근 대화 보기 및 채팅 열기" onClick={()=>{follow.current=true;setOpen(true);}}>{recent.map(m=><span key={m.id} style={{opacity:Math.min(1,Math.max(0,(10000-(clock+serverOffset-m.createdAt))/1500)),transition:'opacity 1s linear'}}><b><CharacterAvatar avatar={m.avatar} skin={m.skin}/> {m.name}</b><span>{m.body}</span></span>)}{!messages.some(m=>!m.deleted)&&<span>새 대화 시작하기</span>}</button>}
  {open&&<div id="room-chat-panel" className="chat-panel">
   <div className="chat-sheet-head" aria-hidden="true"><span>시간</span><span>이름</span><span>내용</span><span/></div><p className="chat-note">{lobby?'전체 대화':'방 전체 대화 · 정답 스포일러는 자제해 주세요'}</p>
   <div className="chat-messages" ref={list} tabIndex={0} aria-label="최근 채팅 메시지" onScroll={()=>{const el=list.current;if(!el)return;follow.current=el.scrollHeight-el.scrollTop-el.clientHeight<40;if(follow.current)markRead(messages.at(-1)?.id||0);}}>
    {loading&&!messages.length?<p className="chat-empty">대화 불러오는 중…</p>:!messages.length?<p className="chat-empty">아직 대화가 없어요.</p>:messages.map(m=>m.system?<div key={m.id} className="chat-system"><span>↪ {m.name}님이 접속했습니다</span><time>{new Date(m.createdAt).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Seoul'})}</time></div>:<article className={m.memberId===meId?'chat-message own':'chat-message'} key={m.id}><span className="chat-portrait" aria-hidden="true"><CharacterAvatar avatar={m.avatar} skin={m.skin}/></span><div className="chat-meta"><span className="chat-author"><span className="chat-avatar"><CharacterAvatar avatar={m.avatar} skin={m.skin}/> </span>{m.name}</span><time dateTime={new Date(m.createdAt).toISOString()}>{new Intl.DateTimeFormat('ko-KR',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Seoul'}).format(m.createdAt)}</time>{!m.deleted&&m.memberId!==meId&&m.safetyTarget&&<SafetyActions name={m.name} target={m.safetyTarget}/>} {!m.deleted&&(m.canDelete||isHost||m.memberId===meId)&&<button aria-label={`${m.name} 메시지 삭제`} disabled={sending} onClick={()=>void mutate({action:'chat_delete',messageId:m.id})}><Trash2 size={12}/></button>}</div><p className={m.deleted?'chat-deleted':/^(?:[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D\p{Emoji_Modifier}\s]){1,18}$/u.test(m.body)?'chat-sticker':''}>{m.deleted?'삭제된 메시지입니다.':m.body}</p></article>)}
   </div>
   {unread>0&&<button className="chat-new" onClick={()=>{follow.current=true;if(list.current)list.current.scrollTop=list.current.scrollHeight;markRead(messages.at(-1)?.id||0);}}>새 메시지 {unread}개 ↓</button>}
   {error&&<p className="chat-error" role="status">{error}<button onClick={()=>void load()} disabled={sending}>다시 연결</button></p>}
   {inquirySent&&<p className="chat-inquiry-notice" role="status">문의가 접수됐어요. 관리자에게만 전달됩니다. <a href="/support" target="_blank" rel="noopener noreferrer">내 문의 보기 ↗</a></p>}
   <div className="chat-fun-bar">{lobby&&<label className="lobby-chat-name">닉네임<input value={chatName} maxLength={16} aria-label="채팅 닉네임" placeholder="닉네임을 입력하세요" onChange={e=>{setChatName(e.target.value);try{localStorage.setItem('bw_lobby_chat_name',e.target.value)}catch{}}}/></label>}<button type="button" className={emojiOpen?'selected':''} aria-label="이모지 선택" aria-expanded={emojiOpen} onClick={()=>setEmojiOpen(v=>!v)}><Smile size={19}/></button>{['👋 안녕하세요!','🔥 한 판 더?','👏 대박!','😂 ㅋㅋㅋㅋ'].map(text=><button key={text} type="button" disabled={sending} onClick={()=>{updateDraft(text);input.current?.focus();}}>{text}</button>)}</div>
   {emojiOpen&&<div className="chat-emoji-tray" aria-label="이모지 목록">{['👋','😂','🤣','🥹','😍','😎','🤔','😱','😭','😤','🎉','👏','🔥','💪','❤️','🍀','🏆','✨','🫠','🙌','🐱','🦊','🐼','🐥'].map(emoji=><button key={emoji} type="button" aria-label={`${emoji} 입력`} disabled={sending} onClick={()=>{updateDraft((draft+emoji).slice(0,300));input.current?.focus();}}>{emoji}</button>)}</div>}

   <form className={`chat-compose ${isInquiry?'is-inquiry':''}`} onSubmit={e=>{e.preventDefault();void send();}}>
    <textarea ref={input} aria-label="채팅 메시지" placeholder="메시지 입력" value={draft} maxLength={300} rows={2} readOnly={sending} aria-busy={sending} onChange={e=>{if(!busy.current)updateDraft(e.target.value);}} onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;compositionEnd.current=Date.now();}} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){if(e.nativeEvent.isComposing||e.nativeEvent.keyCode===229||composing.current)return;e.preventDefault();if(!e.repeat&&Date.now()-compositionEnd.current>=80)void send();}}}/>
    <button className="primary" type="submit" aria-label={isInquiry?'문의 보내기':'메시지 전송'} disabled={sending||loading||(lobby&&!chatName.trim())||!draft.trim()||(isInquiry&&!draft.trim().slice(3).trim())}><Send size={17}/><span className={isInquiry?'chat-inquiry-label':'chat-sheet-label'}>{isInquiry?'문의 보내기':'입력'}</span></button>
    <span>{isInquiry?'관리자에게만 문의 전송':`${draft.length}/300 · Enter 전송 · Shift+Enter 줄바꿈`}</span>
   </form>
  </div>}
 </section>;
}
