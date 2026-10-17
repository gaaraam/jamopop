// Cloudflare entry boundary only. Strip client identity headers and authenticate the session before calling.
// Route handlers remain responsible for room membership, passwords and game-rule authorization.
import {cookie,hash} from '../lib/migration-ticket.mjs';
const REASONS=['욕설·괴롭힘','도배·광고','개인정보 노출','부적절한 그림·이름','기타'];
const json=(data,status=200,extra={})=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store',...extra}});
const one=(env,sql,...args)=>env.DB.prepare(sql).bind(...args).first();
const all=async(env,sql,...args)=>(await env.DB.prepare(sql).bind(...args).all()).results;
const run=(env,sql,...args)=>env.DB.prepare(sql).bind(...args).run();
class SafetyError extends Error{constructor(message,status=400){super(message);this.status=status}}
const check=(ok,message,status=400)=>{if(!ok)throw new SafetyError(message,status)};
export async function safetyIdentity(req,env){
 const account=req.headers.get('oai-authenticated-user-id'),token=cookie(req,'bw_session');
 const guest=/^[a-f0-9]{64}$/.test(token)?await hash(token):null;
 const subject=account?'account:'+account:guest?'guest:'+guest:null;
 const aliases=new Set(subject?[subject]:[]);if(guest)aliases.add('guest:'+guest);
 if(account)for(const m of await all(env,'SELECT DISTINCT token_hash FROM members WHERE account_id=?',account))aliases.add('guest:'+m.token_hash);
 return {subject,account,guest,aliases:[...aliases],admin:!!account&&(req.headers.get('x-jamopop-admin')==='1'||account===env.SITE_ADMIN_ACCOUNT_ID)};
}
function memberSubjects(m){return [m.account_id?'account:'+m.account_id:null,'guest:'+m.token_hash].filter(Boolean)}
async function accountSubjects(env,account){const members=await all(env,'SELECT DISTINCT token_hash FROM members WHERE account_id=?',account);return ['account:'+account,...members.map(m=>'guest:'+m.token_hash)]}
async function mine(env,actor,room){
 const m=actor.account?await one(env,'SELECT * FROM members WHERE room_id=? AND account_id=?',room,actor.account):null;
 const found=m||actor.guest&&await one(env,'SELECT * FROM members WHERE room_id=? AND token_hash=? AND account_id IS NULL',room,actor.guest);
 check(found&&!found.blocked,'이 방에 먼저 입장해 주세요.',403);return found;
}
export async function betweenBlocked(env,a,b){
 if(!a.length||!b.length)return false;
 return !!await one(env,`SELECT 1 FROM safety_blocks WHERE mode='block' AND ((owner IN (SELECT value FROM json_each(?)) AND (target IN (SELECT value FROM json_each(?)) OR target_alias IN (SELECT value FROM json_each(?)))) OR (owner IN (SELECT value FROM json_each(?)) AND (target IN (SELECT value FROM json_each(?)) OR target_alias IN (SELECT value FROM json_each(?)))))`,JSON.stringify(a),JSON.stringify(b),JSON.stringify(b),JSON.stringify(b),JSON.stringify(a),JSON.stringify(a));
}
export async function rateLimit(env,key,limit,ms,now=Date.now()){
 const slot=Math.floor(now/ms),expires=(slot+1)*ms;
 const grant=await one(env,`INSERT INTO safety_rate(key,hits,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN safety_rate.expires_at<=? THEN 1 ELSE safety_rate.hits+1 END,expires_at=excluded.expires_at WHERE safety_rate.expires_at<=? OR safety_rate.hits<? RETURNING hits`,key,expires,now,now,limit);
 return {allowed:!!grant,retryAfter:Math.max(1,Math.ceil((expires-now)/1000))};
}
function quota(path,b){
 if(path==='/auth/google/start')return ['login',10,300000,100];
 if(path==='/api/safety')return b.action==='report'?['report',5,3600000,100]:['safety',30,60000,300];
 if(path==='/api/game'&&b.action==='create')return ['create',5,3600000,150];
 if(path==='/api/game'&&b.action==='join')return ['join',30,60000,600];
 if((path==='/api/game'||path==='/api/lobby-chat')&&b.action==='chat_send')return ['chat',25,60000,1000];
 if(path==='/api/companions'&&b.action==='request')return ['friend',10,60000,300];
 if(path==='/api/invitations'&&b.action==='send')return ['invite',10,60000,300];
 if(path==='/api/inquiries'&&b.action==='create')return ['inquiry',10,3600000,200];
 if(path==='/api/party'&&b.action==='draw')return ['draw',10,60000,300];
 return ['write',180,60000,3000];
}
async function restriction(env,actor){
 if(!actor.aliases.length)return null;
 return one(env,`SELECT kind,reason,expires_at AS expiresAt FROM safety_restrictions WHERE subject IN (SELECT value FROM json_each(?)) AND expires_at>? ORDER BY CASE kind WHEN 'suspend' THEN 3 WHEN 'chat_mute' THEN 2 ELSE 1 END DESC LIMIT 1`,JSON.stringify(actor.aliases),Date.now());
}
export async function safetyBefore(req,env){
 const url=new URL(req.url),path=url.pathname;
 if(!path.startsWith('/api/')&&path!=='/auth/google/start')return {};
 try{
  const actor=await safetyIdentity(req,env);let body={};
  if(req.method==='POST'){
   const reader=req.clone().body?.getReader();let raw='',size=0;const decoder=new TextDecoder();
   if(reader){while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>2000000){void reader.cancel().catch(()=>{});return {response:json({error:'요청이 너무 길어요.'},413)}}raw+=decoder.decode(part.value,{stream:true})}raw+=decoder.decode();}
   try{body=JSON.parse(raw)}catch{return {response:json({error:'요청을 확인해 주세요.'},400)}}
   if(!body||typeof body!=='object'||Array.isArray(body))return {response:json({error:'요청을 확인해 주세요.'},400)};
  }
  const write=req.method==='POST',policy=quota(path,body);
  if(write||path==='/auth/google/start'){
   // Cloudflare supplies this header at its edge. Never persist the raw address.
   const ip=req.headers.get('CF-Connecting-IP');
   const fingerprint=ip?await hash(new Date().toISOString().slice(0,10)+':'+ip):null;
   const keys=[...(fingerprint?[[`ip:${fingerprint}`,policy[3]]]:[]),...(actor.subject?[[actor.subject,policy[1]]]:[])];
   for(const [key,limit] of keys){const q=await rateLimit(env,policy[0]+':'+key,limit,policy[2]);if(!q.allowed)return {response:json({error:'요청이 많아요. 잠시 후 다시 시도해 주세요.',retryAfter:q.retryAfter},429,{'Retry-After':String(q.retryAfter)})}}
   // Bound stale counters without adding a timer or retaining raw IP logs.
   await run(env,'DELETE FROM safety_rate WHERE key IN(SELECT key FROM safety_rate WHERE expires_at<? LIMIT 100)',Date.now()-86400000);
  }
  if(write&&path==='/api/game'&&body.action==='join'&&typeof body.room==='string'&&req.headers.get('CF-Connecting-IP')){const room=await one(env,'SELECT id FROM rooms WHERE (id=? OR invite_code=?) AND password_hash IS NOT NULL',body.room,body.room);if(room){const fingerprint=await hash(req.headers.get('CF-Connecting-IP'));const q=await rateLimit(env,'password-ip:'+room.id+':'+fingerprint,60,60000);if(!q.allowed)return {response:json({error:'비밀번호 시도가 많아요. 잠시 후 다시 입력해 주세요.'},429,{'Retry-After':String(q.retryAfter)})}}}
  const limited=await restriction(env,actor);
  const exempt=path==='/auth/google/start'||path==='/api/safety'&&!(req.method==='POST'&&body.action==='report')||path==='/api/inquiries'||(path==='/api/account'&&req.method==='GET');
  const inquiryCommand=body.action==='chat_send'&&typeof body.body==='string'&&/^@문의(?:\s|$)/.test(body.body.trim());
  const social=['chat_send','react','cheer','draw'].includes(body.action);
  if(!exempt&&!inquiryCommand&&limited&&(limited.kind==='suspend'||limited.kind==='chat_mute'&&social))return {response:json({error:`${limited.kind==='suspend'?'서비스 이용':'대화·그림 공유'}가 일시 제한됐어요. 사유: ${limited.reason}. 문의하기에서 이의를 신청할 수 있어요.`,restriction:limited.kind,until:limited.expiresAt},403)};
  if(path==='/api/home/life'&&actor.account&&(url.searchParams.get('friend')||body.friend)){const f=await one(env,'SELECT requester,recipient FROM friendships WHERE id=? AND (requester=? OR recipient=?)',url.searchParams.get('friend')||body.friend,actor.account,actor.account);const other=f&&(f.requester===actor.account?f.recipient:f.requester);if(other&&await betweenBlocked(env,actor.aliases,await accountSubjects(env,other)))return {response:json({error:'차단 관계에서는 집에 방문할 수 없어요.'},403)}}
  if(write&&actor.account&&((path==='/api/companions'&&['request','accept'].includes(body.action))||(path==='/api/invitations'&&['send','join'].includes(body.action)))){
   let other=null;
   if(path==='/api/companions'&&body.action==='request')other=(await one(env,'SELECT account_id FROM members WHERE id=?',typeof body.member==='string'?body.member:''))?.account_id;
   else if(path==='/api/companions'||body.action==='send'){
    const f=await one(env,'SELECT requester,recipient FROM friendships WHERE id=? AND (requester=? OR recipient=?)',typeof body.id==='string'?body.id:'',actor.account,actor.account);
    if(f)other=f.requester===actor.account?f.recipient:f.requester;
   }else other=(await one(env,'SELECT sender FROM room_invitations WHERE id=? AND recipient=?',typeof body.id==='string'?body.id:'',actor.account))?.sender;
   if(other&&await betweenBlocked(env,actor.aliases,await accountSubjects(env,other)))return {response:json({error:'차단 관계에서는 친구 요청이나 초대를 주고받을 수 없어요.'},403)};
  }
  return {actor,body};
 }catch(e){return {response:json({error:e instanceof SafetyError?e.message:'안전 설정을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.'},e.status||503)}}
}
async function resolveTarget(env,actor,b){
 const target=b.target;check(target&&typeof target==='object'&&typeof target.kind==='string','신고 대상을 확인해 주세요.');
 let member,evidence,ref;
 if(target.kind==='lobby_message'){
  check(Number.isSafeInteger(target.id),'메시지를 확인해 주세요.');
  const row=await one(env,'SELECT id,owner,name,body,created_at,deleted FROM lobby_messages WHERE id=?',target.id);check(row&&!row.deleted,'이 메시지를 확인할 수 없어요.',404);
  return {subject:row.owner,alias:null,name:row.name,kind:target.kind,reference:String(row.id),evidence:{body:row.body,createdAt:row.created_at}};
 }
 check(typeof target.room==='string'&&target.room.length<=80,'방을 확인해 주세요.');
 const room=await one(env,'SELECT * FROM rooms WHERE id=? AND archived_at IS NULL',target.room);check(room,'방을 확인할 수 없어요.',404);
 if(target.kind==='room'){
  if(room.password_hash)await mine(env,actor,room.id);
  member=await one(env,'SELECT * FROM members WHERE id=?',room.host_id);evidence={name:room.name};ref=room.id+':'+await hash(room.name);
 }else{
  const viewer=await mine(env,actor,room.id);
  if(target.kind==='member'){
   check(typeof target.id==='string','참가자를 확인해 주세요.');member=await one(env,'SELECT * FROM members WHERE id=? AND room_id=? AND blocked=0',target.id,room.id);evidence={name:member?.name};ref=String(target.id)+':'+await hash(member?.name||'');
  }else if(target.kind==='room_message'){
   check(Number.isSafeInteger(target.id),'메시지를 확인해 주세요.');
   const row=await one(env,'SELECT * FROM chat_messages WHERE id=? AND room_id=? AND system=0 AND deleted=0',target.id,room.id);check(row,'메시지를 확인할 수 없어요.',404);
   const watching=viewer.spectator||await one(env,'SELECT 1 FROM spectators WHERE round_id=? AND member_id=?',room.current_round_id,viewer.id);
   check(row.channel===(watching?'spectator':'player'),'이 채팅을 볼 수 없어요.',403);
   member=await one(env,'SELECT * FROM members WHERE id=?',row.member_id);evidence={body:row.body,createdAt:row.created_at};ref=String(row.id);
  }else if(target.kind==='hint'){
   check(typeof target.id==='string'&&typeof target.round==='string','그림을 확인해 주세요.');
   const row=await one(env,'SELECT h.* FROM drawing_hints h JOIN rounds r ON r.id=h.round_id WHERE h.member_id=? AND h.round_id=? AND r.room_id=?',target.id,target.round,room.id);check(row,'그림을 확인할 수 없어요.',404);
   const accessible=viewer.spectator||await one(env,'SELECT 1 FROM spectators WHERE round_id=? AND member_id=?',target.round,viewer.id)||await one(env,"SELECT 1 FROM plays WHERE round_id=? AND member_id=? AND status IN ('won','lost','forfeited')",target.round,viewer.id)||await one(env,'SELECT 1 FROM hint_views WHERE round_id=? AND member_id=?',target.round,viewer.id)||await one(env,'SELECT 1 FROM rounds WHERE id=? AND hint_policy=0',target.round);
   check(accessible,'먼저 힌트 보기를 눌러 주세요.',403);
   member=await one(env,'SELECT * FROM members WHERE id=?',row.member_id);evidence={strokes:JSON.parse(row.strokes),updatedAt:row.updated_at};ref=target.round+':'+target.id+':'+await hash(row.strokes);
  }else throw new SafetyError('신고 유형을 확인해 주세요.');
 }
 check(member,'대상을 확인할 수 없어요.',404);const subjects=memberSubjects(member);
 return {subject:subjects[0],alias:subjects[1]||null,name:member.name,kind:target.kind,reference:ref,evidence:{...evidence,roomName:room.name}};
}
export async function safetyEndpoint(req,env,context={}){
 if(new URL(req.url).pathname!=='/api/safety')return null;
 try{
  const actor=context.actor||await safetyIdentity(req,env),url=new URL(req.url);check(actor.subject,'대기실이나 채팅을 연 뒤 다시 시도해 주세요.',401);
  if(req.method==='GET'){
   if(url.searchParams.get('admin')==='1'){
    check(actor.admin,'관리자만 확인할 수 있어요.',403);const status=url.searchParams.get('status')||'',offset=Number(url.searchParams.get('offset')||0);
    check(['','new','reviewing','closed'].includes(status)&&Number.isSafeInteger(offset)&&offset>=0&&offset<=100000,'조회 조건을 확인해 주세요.');
    const rows=await all(env,'SELECT id,kind,name,reason,details,evidence,status,revision,created_at AS createdAt,updated_at AS updatedAt FROM safety_reports WHERE (?=\'\' OR status=?) ORDER BY updated_at DESC,id LIMIT 21 OFFSET ?',status,status,offset);
    const page=rows.slice(0,20),actions=page.length?await all(env,`SELECT a.report_id AS reportId,a.kind,a.reason,a.expires_at AS expiresAt,a.created_at AS createdAt,COALESCE(p.name,'운영자') AS operatorName FROM safety_actions a LEFT JOIN profiles p ON 'account:'||p.id=a.actor WHERE a.report_id IN (SELECT value FROM json_each(?)) ORDER BY a.created_at,a.id`,JSON.stringify(page.map(r=>r.id))):[];
    for(const row of page){row.evidence=JSON.parse(row.evidence);row.actions=actions.filter(a=>a.reportId===row.id).map(({reportId,...a})=>a)}
    return json({rows:page,nextOffset:rows.length>20?offset+20:null});
   }
   if(url.searchParams.get('notice')==='1')return json({restriction:await restriction(env,actor)});
   const blocks=await all(env,`SELECT id,name,mode,created_at AS createdAt FROM safety_blocks WHERE owner IN (SELECT value FROM json_each(?)) ORDER BY created_at DESC LIMIT 200`,JSON.stringify(actor.aliases));
   const reports=await all(env,`SELECT id,kind,name,reason,status,created_at AS createdAt FROM safety_reports WHERE reporter IN (SELECT value FROM json_each(?)) ORDER BY created_at DESC LIMIT 30`,JSON.stringify(actor.aliases));
   return json({blocks,reports,restriction:await restriction(env,actor)});
  }
  check(req.method==='POST','지원하지 않는 요청입니다.',405);check(req.headers.get('origin')===url.origin,'현재 페이지에서 다시 시도해 주세요.',403);
  const b=context.body||await req.json();
  if(b.action==='unblock'){
   check(typeof b.id==='string','차단 항목을 확인해 주세요.');await run(env,`DELETE FROM safety_blocks WHERE id=? AND owner IN (SELECT value FROM json_each(?))`,b.id,JSON.stringify(actor.aliases));return json({ok:true});
  }
  if(b.action==='review'){
   check(actor.admin,'관리자만 처리할 수 있어요.',403);
   check(typeof b.id==='string'&&Number.isSafeInteger(b.revision)&&['new','reviewing','closed'].includes(b.status)&&['none','warn','chat_mute','suspend','revoke'].includes(b.measure)&&typeof b.note==='string'&&b.note.trim().length>=2&&b.note.length<=500,'처리 상태와 사유를 확인해 주세요.');
   check(b.measure==='none'||b.measure==='revoke'||[1,24,168].includes(b.hours),'제한 기간을 선택해 주세요.');
   const report=await one(env,'SELECT subject,subject_alias FROM safety_reports WHERE id=?',b.id);check(report,'신고를 찾을 수 없어요.',404);
   const now=Date.now(),action=crypto.randomUUID(),expires=b.measure==='none'||b.measure==='revoke'?null:now+b.hours*3600000;
   const guard='EXISTS(SELECT 1 FROM safety_reports WHERE id=? AND last_action=?)';
   const statements=[env.DB.prepare('UPDATE safety_reports SET status=?,updated_at=?,revision=revision+1,last_action=? WHERE id=? AND revision=?').bind(b.status,now,action,b.id,b.revision)];
   for(const subject of [report.subject,report.subject_alias].filter(Boolean)){
    if(b.measure==='revoke')statements.push(env.DB.prepare(`DELETE FROM safety_restrictions WHERE subject=? AND ${guard}`).bind(subject,b.id,action));
    else if(b.measure!=='none')statements.push(env.DB.prepare(`INSERT INTO safety_restrictions(subject,kind,reason,expires_at,updated_at) SELECT ?,?,?,?,? WHERE ${guard} ON CONFLICT(subject) DO UPDATE SET kind=excluded.kind,reason=excluded.reason,expires_at=excluded.expires_at,updated_at=excluded.updated_at`).bind(subject,b.measure,b.note.trim(),expires,now,b.id,action));
   }
   statements.push(env.DB.prepare(`INSERT INTO safety_actions(id,report_id,actor,kind,reason,expires_at,created_at) SELECT ?,?,?,?,?,?,? WHERE ${guard}`).bind(action,b.id,actor.subject,b.measure,b.note.trim(),expires,now,b.id,action));
   const saved=await env.DB.batch(statements);check(saved[0].meta.changes,'다른 창에서 변경됐어요. 새로고침해 주세요.',409);return json({ok:true});
  }
  check(['block','mute','report'].includes(b.action),'요청을 확인해 주세요.');const target=await resolveTarget(env,actor,b);
  check(!actor.aliases.includes(target.subject)&&(!target.alias||!actor.aliases.includes(target.alias)),'본인은 신고하거나 차단할 수 없어요.');
  if(b.action==='block'||b.action==='mute'){
   const count=await one(env,`SELECT COUNT(*) n FROM safety_blocks WHERE owner IN (SELECT value FROM json_each(?))`,JSON.stringify(actor.aliases));check(count.n<200,'차단 목록은 최대 200개예요.',429);
   await run(env,"INSERT INTO safety_blocks(id,owner,target,target_alias,name,mode,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(owner,target) DO UPDATE SET mode=excluded.mode,name=excluded.name,target_alias=excluded.target_alias",crypto.randomUUID(),actor.subject,target.subject,target.alias,target.name,b.action,Date.now());return json({ok:true});
  }
  check(REASONS.includes(b.reason)&&typeof b.details==='string'&&b.details.length<=1000&&typeof b.requestId==='string'&&/^[a-f0-9-]{36}$/.test(b.requestId),'신고 사유와 내용을 확인해 주세요.');
  const existing=await one(env,'SELECT id,kind,reference,reason,details FROM safety_reports WHERE reporter=? AND request_id=?',actor.subject,b.requestId);
  if(existing){check(existing.kind===target.kind&&existing.reference===target.reference&&existing.reason===b.reason&&existing.details===b.details.trim(),'이미 사용된 전송 번호예요.',409);return json({id:existing.id})}
  const id=crypto.randomUUID(),now=Date.now();await run(env,'INSERT INTO safety_reports(id,reporter,request_id,kind,reference,subject,subject_alias,name,reason,details,evidence,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING',id,actor.subject,b.requestId,target.kind,target.reference,target.subject,target.alias,target.name,b.reason,b.details.trim(),JSON.stringify(target.evidence),now,now);
  const byRequest=await one(env,'SELECT id,kind,reference,reason,details FROM safety_reports WHERE reporter=? AND request_id=?',actor.subject,b.requestId);if(byRequest){check(byRequest.kind===target.kind&&byRequest.reference===target.reference&&byRequest.reason===b.reason&&byRequest.details===b.details.trim(),'이미 사용된 전송 번호예요.',409);return json({id:byRequest.id})}
  const saved=await one(env,'SELECT id FROM safety_reports WHERE reporter=? AND kind=? AND reference=?',actor.subject,target.kind,target.reference);return json({id:saved.id});
 }catch(e){return json({error:e instanceof SafetyError?e.message:'처리하지 못했어요. 입력을 유지하고 다시 시도해 주세요.'},e.status||503)}
}
export async function safetyAfter(req,env,response,context={}){
 const path=new URL(req.url).pathname;
 if(response.status!==200||!response.headers.get('content-type')?.includes('application/json')||!['/api/game','/api/speed','/api/lobby-chat','/api/party','/api/companions','/api/invitations','/api/home/life'].includes(path))return response;
 const actor=context.actor||await safetyIdentity(req,env),data=await response.json(),aliases=actor.aliases;
 let hidden=new Set(),blocked=new Set();
 if(aliases.length){
  const rows=await all(env,`SELECT owner,target,target_alias,mode FROM safety_blocks WHERE owner IN (SELECT value FROM json_each(?)) OR (mode='block' AND (target IN (SELECT value FROM json_each(?)) OR target_alias IN (SELECT value FROM json_each(?))))`,JSON.stringify(aliases),JSON.stringify(aliases),JSON.stringify(aliases));
  for(const b of rows){const values=aliases.includes(b.owner)?[b.target,b.target_alias]:[b.owner];for(const value of values.filter(Boolean)){hidden.add(value);if(b.mode==='block')blocked.add(value)}}
 }
 if(hidden.size){const guests=[...hidden].filter(x=>x.startsWith('guest:')).map(x=>x.slice(6));if(guests.length){const linked=await all(env,'SELECT DISTINCT token_hash,account_id FROM members WHERE account_id IS NOT NULL AND token_hash IN (SELECT value FROM json_each(?))',JSON.stringify(guests));for(const m of linked){hidden.add('account:'+m.account_id);if(blocked.has('guest:'+m.token_hash))blocked.add('account:'+m.account_id)}}}
 const isHidden=subjects=>subjects.some(s=>hidden.has(s)),isBlocked=subjects=>subjects.some(s=>blocked.has(s));
 const lobby=path==='/api/lobby-chat'||new URL(req.url).searchParams.get('lobby')==='1';
 const chat=data.chat||data,room=data.room?.id||new URL(req.url).searchParams.get('room')||context.body?.room;
 const memberIds=new Set([...(data.roster||[]).map(m=>m.id),...(lobby?[]:(chat.messages||[]).map(m=>m.memberId)),...(data.hints||[]).map(m=>m.memberId),...(data.reactions||[]).map(m=>m.memberId),...(data.party?.hints||[]).map(m=>m.memberId)]);
 const members=hidden.size&&memberIds.size?await all(env,`SELECT id,account_id,token_hash FROM members WHERE id IN (SELECT value FROM json_each(?))`,JSON.stringify([...memberIds])):[];
 const memberMap=new Map(members.map(m=>[m.id,memberSubjects(m)]));
 if(Array.isArray(chat.messages)){
  const messageOwners=lobby&&chat.messages.length?new Map((await all(env,`SELECT id,owner FROM lobby_messages WHERE id IN (SELECT value FROM json_each(?))`,JSON.stringify(chat.messages.map(m=>m.id)))).map(m=>[m.id,[m.owner]])):new Map();
  chat.messages=chat.messages.filter(m=>!isHidden(lobby?messageOwners.get(m.id)||[]:memberMap.get(m.memberId)||[])).map(m=>({...m,...(!m.system&&!m.deleted&&m.memberId!==(lobby?'me':data.me?.id)?{safetyTarget:{kind:lobby?'lobby_message':'room_message',id:m.id,...(!lobby?{room}:{})}}:{})}));
 }
 if(data.reactions)data.reactions=data.reactions.filter(m=>!isHidden(memberMap.get(m.memberId)||[]));
 if(data.hints)data.hints=data.hints.filter(m=>!isHidden(memberMap.get(m.memberId)||[]));
 if(data.party?.hints)data.party.hints=data.party.hints.filter(m=>!isHidden(memberMap.get(m.memberId)||[]));
 // Keep progress cards and competition results intact; only social content is hidden.
 async function filterPeople(container){
  if(!container)return;
  if(container.friends?.length){const ids=container.friends.map(x=>x.id);const links=await all(env,`SELECT id,requester,recipient FROM friendships WHERE id IN (SELECT value FROM json_each(?))`,JSON.stringify(ids));const map=new Map(links.map(f=>[f.id,['account:'+f.requester,'account:'+f.recipient].filter(x=>!aliases.includes(x))]));container.friends=container.friends.filter(f=>!isBlocked(map.get(f.id)||[]));}
  if(container.recent?.length){const ids=container.recent.map(x=>x.id);const rows=await all(env,`SELECT id,account_id,token_hash FROM members WHERE id IN (SELECT value FROM json_each(?))`,JSON.stringify(ids));const map=new Map(rows.map(m=>[m.id,memberSubjects(m)]));container.recent=container.recent.filter(m=>!isBlocked(map.get(m.id)||[]));}
 }
 await filterPeople(data.people);if(['/api/companions','/api/invitations','/api/home/life'].includes(path))await filterPeople(data);
 const inbox=data.invitations||data;if(Array.isArray(inbox.items)&&inbox.items.length){const rows=await all(env,`SELECT id,sender FROM room_invitations WHERE id IN (SELECT value FROM json_each(?))`,JSON.stringify(inbox.items.map(i=>i.id)));const map=new Map(rows.map(r=>[r.id,['account:'+r.sender]]));inbox.items=inbox.items.filter(i=>!isBlocked(map.get(i.id)||[]));}
 const headers=new Headers(response.headers);headers.delete('content-length');headers.set('Cache-Control','private, no-store');return new Response(JSON.stringify(data),{status:response.status,headers});
}
