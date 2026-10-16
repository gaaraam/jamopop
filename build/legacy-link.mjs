import {legacyPreview} from '../lib/legacy-preview.mjs';
import {sessionAccount} from './session.mjs';
import {SOURCE,random,hash,cookie,secureCookie} from '../lib/migration-ticket.mjs';
export const LEGACY_TARGET='https://bubblecon-wordle-migration.bubblecon-garam.workers.dev';
const enc=new TextEncoder(),unb64=s=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
const reply=(data,status=200,extra={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer',...extra}});
export async function openLegacyTicket(value,secret,now=Date.now()){
 if(typeof value!=='string'||value.length>12000||!/^[a-f0-9]{64}$/.test(secret||''))throw Error('invalid');
 let ticket=value.trim();if(ticket.startsWith('https://')){const u=new URL(ticket);if(u.origin!==LEGACY_TARGET||u.pathname!=='/auth/complete')throw Error('origin');ticket=u.searchParams.get('ticket')||'';}
 const parts=ticket.split('.');if(parts.length!==2)throw Error('invalid');
 const key=await crypto.subtle.importKey('raw',Uint8Array.from(secret.match(/../g),x=>parseInt(x,16)),'AES-GCM',false,['decrypt']);
 const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(parts[0]),additionalData:enc.encode(LEGACY_TARGET)},key,unb64(parts[1]));
 const p=JSON.parse(new TextDecoder().decode(plain));
 if(p.iss!==SOURCE||p.aud!==LEGACY_TARGET||!Number.isFinite(p.exp)||p.exp<=now||p.exp>now+120000||!/^[a-f0-9]{64}$/.test(p.jti)||!/^[a-f0-9]{64}$/.test(p.challenge))throw Error('invalid');
 if(p.accountId!==null&&(typeof p.accountId!=='string'||!p.accountId||p.accountId.length>255))throw Error('identity');
 if(!p.accountId&&!/^[a-f0-9]{64}$/.test(p.guest||''))throw Error('identity');
 return p;
}
export async function legacyLink(req,env){
 const u=new URL(req.url);if(!u.pathname.startsWith('/auth/legacy/'))return null;
 if(req.method!=='POST'||req.headers.get('origin')!==u.origin)return reply({error:'이 페이지에서 다시 시도해 주세요.'},403);
 const a=await sessionAccount(req,env);if(!a)return reply({error:'먼저 Google로 로그인해 주세요.'},401);
 let stage='request';
 try{
 if(u.pathname==='/auth/legacy/start'){
  const state=random(),challenge=await hash(state),now=Date.now();
  await env.DB.batch([env.DB.prepare('DELETE FROM legacy_link_attempts WHERE expires_at<=?').bind(now),env.DB.prepare('INSERT INTO legacy_link_attempts VALUES(?,?,?,?)').bind(challenge,a.subject,await hash(state),now+600000)]);
  return reply({url:SOURCE+'/api/migration-link?challenge='+challenge,expiresAt:now+600000},200,{'Set-Cookie':secureCookie('__Host-jamopop_link',state,600)});
 }
 if(['/auth/legacy/complete','/auth/legacy/preview'].includes(u.pathname)){
  const raw=await req.text();if(raw.length>16000)return reply({error:'주소가 너무 길어요.'},400);
  stage='proof';
  const {ticket}=JSON.parse(raw),p=await openLegacyTicket(ticket,env.MIGRATION_BRIDGE_KEY);
  stage='browser';
  const state=cookie(req,'__Host-jamopop_link');if(!/^[a-f0-9]{64}$/.test(state)||p.challenge!==await hash(state))throw Error('state');
  if(u.pathname==='/auth/legacy/preview'){
   const attempt=await env.DB.prepare('SELECT challenge FROM legacy_link_attempts WHERE challenge=? AND subject=? AND browser_hash=? AND expires_at>?').bind(p.challenge,a.subject,await hash(state),Date.now()).first();if(!attempt)throw Error('state');
   const guestHash=p.accountId?'':await hash(p.guest),id=p.accountId||'legacy-guest:'+guestHash;
   const previous=await env.DB.prepare('SELECT subject FROM linked_game_accounts WHERE account_id=?').bind(id).first();
   if(previous&&previous.subject!==a.subject)return reply({error:'이미 다른 Google 계정에 연결된 기록입니다.'},409);
   const summary=await legacyPreview(env.DB,previous?id:p.accountId,guestHash);
   return reply({summary});
  }
  stage='attempt';
  const attempt=await env.DB.prepare('DELETE FROM legacy_link_attempts WHERE challenge=? AND subject=? AND browser_hash=? AND expires_at>? RETURNING challenge').bind(p.challenge,a.subject,await hash(state),Date.now()).first();
  if(!attempt)throw Error('state');
  stage='records';
  const guestHash=!p.accountId?await hash(p.guest):'',id=p.accountId||'legacy-guest:'+guestHash;
  const previous=await env.DB.prepare('SELECT subject FROM linked_game_accounts WHERE account_id=?').bind(id).first();
  if(previous&&previous.subject!==a.subject)return reply({error:'이미 다른 Google 계정에 연결된 기록입니다.'},409);
  const profile=await env.DB.prepare('SELECT name FROM profiles WHERE id=?').bind(id).first();
  const guestProfile=!p.accountId?await legacyPreview(env.DB,previous?id:null,guestHash):null;
  const now=Date.now(),queries=[
   env.DB.prepare('INSERT INTO legacy_link_receipts VALUES(?,?,?,?)').bind(p.jti,id,a.subject,now),
   env.DB.prepare('INSERT INTO linked_game_accounts(account_id,subject,label,is_admin,linked_at) VALUES(?,?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET is_admin=MAX(linked_game_accounts.is_admin,excluded.is_admin) WHERE linked_game_accounts.subject=excluded.subject').bind(id,a.subject,profile?.name||guestProfile?.name||'이전 기록',p.accountId&&p.admin===true?1:0,now),
   env.DB.prepare('UPDATE google_accounts SET game_account_id=? WHERE subject=? AND EXISTS(SELECT 1 FROM linked_game_accounts WHERE account_id=? AND subject=?)').bind(id,a.subject,id,a.subject)
  ];
  if(!p.accountId){
   queries.push(env.DB.prepare('INSERT OR IGNORE INTO profiles(id,name,avatar,created_at) VALUES(?,?,?,?)').bind(id,guestProfile.name,guestProfile.avatar,now));
   queries.push(env.DB.prepare('UPDATE members SET account_id=? WHERE account_id IS NULL AND token_hash=? AND EXISTS(SELECT 1 FROM linked_game_accounts WHERE account_id=? AND subject=?)').bind(id,guestHash,id,a.subject));
   queries.push(env.DB.prepare("INSERT OR IGNORE INTO solo_progress(owner,state,revision) SELECT ?,state,revision FROM solo_progress WHERE owner=? AND EXISTS(SELECT 1 FROM linked_game_accounts WHERE account_id=? AND subject=?)").bind('account:'+id,'guest:'+guestHash,id,a.subject));
   queries.push(env.DB.prepare('UPDATE solo_runs SET owner=? WHERE owner=? AND EXISTS(SELECT 1 FROM linked_game_accounts WHERE account_id=? AND subject=?)').bind('account:'+id,'guest:'+guestHash,id,a.subject));
   queries.push(env.DB.prepare('INSERT OR IGNORE INTO earned_titles(owner,title,earned_at) SELECT ?,title,earned_at FROM earned_titles WHERE owner=? AND EXISTS(SELECT 1 FROM linked_game_accounts WHERE account_id=? AND subject=?)').bind('account:'+id,'guest:'+guestHash,id,a.subject));
   queries.push(env.DB.prepare('INSERT OR IGNORE INTO equipped_titles(owner,title) SELECT ?,title FROM equipped_titles WHERE owner=? AND EXISTS(SELECT 1 FROM linked_game_accounts WHERE account_id=? AND subject=?)').bind('account:'+id,'guest:'+guestHash,id,a.subject));
  }
  await env.DB.batch(queries);
  const linked=await env.DB.prepare('SELECT game_account_id FROM google_accounts WHERE subject=?').bind(a.subject).first();
  if(linked?.game_account_id!==id)return reply({error:'다른 계정이 먼저 연결했습니다. 기록은 변경하지 않았습니다.'},409);
  return reply({ok:true},200,{'Set-Cookie':secureCookie('__Host-jamopop_link','',0)});
 }
 return reply({error:'없는 요청입니다.'},404);
 }catch(error){console.warn('legacy-link-failed',stage,error?.name, ['invalid','origin','identity','state'].includes(error?.message)?error.message:'validation');return reply({error:'연결 주소가 만료되었거나 올바르지 않습니다. 연결을 다시 시작해 주세요.'},400)}
}
export async function profileSwitch(req,env){
 const u=new URL(req.url);if(u.pathname!=='/auth/profiles')return null;
 const a=await sessionAccount(req,env);if(!a)return reply({error:'로그인이 필요해요.'},401);
 if(req.method==='GET')return reply({current:a.game_account_id,profiles:(await env.DB.prepare('SELECT account_id id,label FROM linked_game_accounts WHERE subject=? ORDER BY linked_at').bind(a.subject).all()).results});
 if(req.method!=='POST'||req.headers.get('origin')!==u.origin)return reply({error:'잘못된 요청이에요.'},403);
 try{const raw=await req.text();if(raw.length>512)throw Error();const {id}=JSON.parse(raw);if(typeof id!=='string')throw Error();
 const result=await env.DB.prepare('UPDATE google_accounts SET game_account_id=? WHERE subject=? AND EXISTS(SELECT 1 FROM linked_game_accounts WHERE account_id=? AND subject=?)').bind(id,a.subject,id,a.subject).run();
 return result.meta.changes?reply({ok:true}):reply({error:'내 프로필만 선택할 수 있어요.'},403);
 }catch{return reply({error:'프로필을 확인해 주세요.'},400)}
}
