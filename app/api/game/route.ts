import {hashRoomPassword,verifyRoomPassword,validRoomPassword,allowRoomPasswordAttempt} from '@/lib/room-password';
import {invitationInbox} from '@/lib/room-invitations';
import {companions} from '@/lib/companions';
import {speedPlayingSQL,settleSpeed} from '@/lib/competition';
import {derivedCache,dataRevision} from '@/lib/derived-cache';
import {PRESENCE_INTERVAL,PRESENCE_OFFLINE} from '@/lib/sync-policy.mjs';
import {GET as lobbyChatGet} from '@/app/api/lobby-chat/route';
import {GET as announcementGet} from '@/app/api/announcements/route';
import {partyState,ensureLoadout,expirePlays,isSpectator,trackSpectator,memberOwner} from '@/lib/party';
import {inquiryCommand,inquiryOwner,createInquiry} from '@/lib/inquiries';
import {ROOM_ROUND_MS} from '@/lib/round-timer';
import {AVATARS,equippedAtLevel} from '@/lib/cosmetics';
import {accountId,findMember,accountProgressions,avatarAccess,isSiteAdmin,isAdminAccount} from '@/lib/account';
import {inputShape} from '@/lib/input';
import {acceptsGuess} from '@/lib/guess-dictionary';
import {all,one,run,database} from '@/lib/store';
import {splitWord,score,weekStart,rankPlayers,type Guess} from '@/lib/game';
import {randomWord,WORD_COUNTS} from '@/lib/words';
const avatars=AVATARS;
class UserError extends Error{constructor(message:string,public status=400){super(message)}}
function check(condition:any,message:string,status=400):asserts condition{if(!condition)throw new UserError(message,status);}
const uuid=()=>crypto.randomUUID(), key=()=>uuid().replaceAll('-','').slice(0,24);
function cookie(req:Request){return req.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith('bw_session='))?.slice(11)||'';}
async function hash(s:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function date(n=Date.now()){return new Date(n+9*3600000).toISOString().slice(0,10);}
function reply(data:any,status=200,token?:string,req?:Request){const headers:Record<string,string>={'Cache-Control':'no-store'};if(token)headers['Set-Cookie']=`bw_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${req?.url.startsWith('https:')?'; Secure':''}`;return Response.json(data,{status,headers});}
function failure(e:unknown){if(e instanceof UserError)return reply({error:e.message},e.status);console.error('game request failed',e);return reply({error:'잠시 연결이 원활하지 않아요. 입력은 그대로 두고 다시 시도해 주세요.'},503);}
function widthOf(value:any,fallback=5){const n=value===undefined?fallback:Number(value);check([5,6,7].includes(n),'5·6·7칸 중에서 선택해 주세요.');return n;}
async function auth(req:Request,roomId:string){check(typeof roomId==='string'&&/^[a-f0-9]{24}$/.test(roomId),'초대 링크를 확인해 주세요.');const m=await findMember(req,roomId);check(m,'이 방에 먼저 입장해 주세요.',401);check(!m.blocked||isSiteAdmin(req),'이 방에서 내보내졌어요.',403);return m;}
async function resolveRoom(req:Request,link:string){check(typeof link==='string'&&/^[a-f0-9]{24}$/.test(link),'초대 링크를 확인해 주세요.');let r=await one('SELECT * FROM rooms WHERE invite_code=? OR (id=? AND invite_code IS NULL)',link,link);if(!r){const existing=await one('SELECT * FROM rooms WHERE id=?',link);if(existing){await auth(req,link);r=existing;}}check(r,'사용할 수 없는 초대 링크예요. 방장에게 새 링크를 받아 주세요.',404);return r;}
async function choose(roomId:string,width:number,owner?:string){const recent=await all(`SELECT answer FROM rounds WHERE room_id=? AND (mode<>'practice' OR owner_id=?) ORDER BY starts_at DESC,id DESC LIMIT 30`,roomId,owner||'');return randomWord(undefined,width,recent.map(x=>x.answer));}
async function getRound(room:any,m:any,mode:string){
 if(mode==='live'){check(room.live_id,'아직 대기실이 없어요.',404);return one('SELECT * FROM rounds WHERE id=?',room.live_id);}
 if(mode==='practice'){check(m.practice_id,'연습을 시작해 주세요.',404);return one('SELECT * FROM rounds WHERE id=?',m.practice_id);}
 // Upgrade legacy rooms lazily without replacing their problem or submissions.
 if(!room.current_round_id){const previous=await one("SELECT * FROM rounds WHERE room_id=? AND mode='daily' ORDER BY starts_at DESC,id DESC LIMIT 1",room.id);const id=previous?.id||uuid();if(!previous)await run('INSERT INTO rounds(id,room_id,mode,answer,starts_at,dictionary_version) VALUES(?,?,?,?,?,1)',id,room.id,'daily',await choose(room.id,5),Date.now());await database().batch([database().prepare('UPDATE rooms SET current_round_id=?,round_no=1 WHERE id=? AND current_round_id IS NULL').bind(id,room.id),database().prepare('UPDATE rounds SET ends_at=NULL WHERE id=(SELECT current_round_id FROM rooms WHERE id=?)').bind(room.id)]);Object.assign(room,await one('SELECT current_round_id,round_no FROM rooms WHERE id=?',room.id));}
 return one('SELECT * FROM rounds WHERE id=?',room.current_round_id);
}
async function liveInfo(room:any,memberId:string,now:number){
 if(!room.live_id)return null;const r=await one('SELECT * FROM rounds WHERE id=?',room.live_id);if(!r)return null;
 const participants=await all(`SELECT m.id,m.name,m.avatar,m.skin_id AS skin,lp.ready,p.status FROM live_participants lp JOIN members m ON m.id=lp.member_id LEFT JOIN plays p ON p.round_id=lp.round_id AND p.member_id=lp.member_id WHERE lp.round_id=? AND m.blocked=0 ORDER BY m.name`,r.id);
 const allFinished=!!r.restricted&&participants.length>0&&participants.every(p=>p.status==='won'||p.status==='lost');
 const phase=r.phase==='cancelled'?'cancelled':r.phase==='lobby'?'lobby':r.ends_at&&now>=r.ends_at||allFinished?'finished':'running';
 return {id:r.id,phase,width:r.width,startsAt:r.starts_at,endsAt:r.ends_at,restricted:!!r.restricted,participants:participants.map(p=>({...p,ready:!!p.ready})),joined:!r.restricted||participants.some(p=>p.id===memberId),ready:!!participants.find(p=>p.id===memberId)?.ready};
}
async function state(req:Request,roomId:string,mode:string){
 const m=await auth(req,roomId),room=await one('SELECT * FROM rooms WHERE id=?',roomId);check(room,'방을 찾을 수 없어요.',404);
 if(room.active_speed_id)await settleSpeed(roomId);
 const r=await getRound(room,m,mode);check(r,'문제를 찾을 수 없어요.',404);const party=await partyState(r,m),personalEnd=party.loadout?.endsAt??r.ends_at;const now=Date.now(),active=new URL(req.url).searchParams.get('away')!=='1';if(!m.chat_seen||now-m.last_seen>=PRESENCE_INTERVAL||(active&&now-m.last_active>=PRESENCE_INTERVAL)){if(!m.chat_seen||now-m.last_seen>=90000)await presenceNotice(m,now);await run('UPDATE members SET last_seen=?,last_active=CASE WHEN ?=1 THEN ? ELSE last_active END WHERE id=? AND (last_seen<=? OR (?=1 AND last_active<=?))',now,active?1:0,now,m.id,now-PRESENCE_INTERVAL,active?1:0,now-PRESENCE_INTERVAL);}
 if(mode==='daily'&&r.ends_at)await expirePlays(r,now);
 const [p,live]=await Promise.all([one('SELECT * FROM plays WHERE round_id=? AND member_id=?',r.id,m.id),liveInfo(room,m.id,now)]);
 const expired=mode==='live'?live?.phase==='finished'||live?.phase==='cancelled':!!personalEnd&&now>=personalEnd;
 const phase=mode==='live'?live?.phase||'running':'running';const spectator=party.spectator||(mode==='live'&&!live?.joined);
 const status=spectator?'spectating':p?.status==='won'?'won':(p?.status==='lost'||p?.status==='forfeited')||expired?'lost':spectator?'spectating':'playing';
 const rows=await all(`SELECT m.id,m.name,m.avatar,m.skin_id AS skin,m.account_id,cs.skin_id AS cardSkin,c.name_color,c.avatar_frame,m.last_seen,m.last_active,m.spectator,p.guesses,p.status,p.finished_at,EXISTS(SELECT 1 FROM hint_views hv WHERE hv.round_id=? AND hv.member_id=m.id) AS hint_used,et.title AS title,COALESCE(il.ends_at,?) AS personal_end,EXISTS(SELECT 1 FROM spectators sp WHERE sp.round_id=? AND sp.member_id=m.id) AS watched FROM members m LEFT JOIN equipped_card_skins cs ON cs.account_id=m.account_id LEFT JOIN account_cosmetics c ON c.account_id=m.account_id LEFT JOIN equipped_titles et ON et.owner=CASE WHEN m.account_id IS NOT NULL THEN 'account:'||m.account_id ELSE 'guest:'||m.token_hash END LEFT JOIN item_loadouts il ON il.round_id=? AND il.member_id=m.id LEFT JOIN plays p ON p.member_id=m.id AND p.round_id=? WHERE m.room_id=? AND m.blocked=0 ORDER BY m.rowid ASC`,r.id,r.ends_at,r.id,r.id,r.id,roomId);
 const levels=await accountProgressions(rows.map(x=>x.account_id).filter(Boolean));
 const participants=(mode==='practice'?rows.filter(x=>x.id===m.id):rows).filter(x=>!x.spectator&&!x.watched);
 const players=participants.map(x=>{const g:Guess[]=JSON.parse(x.guesses||'[]');return {id:x.id,name:x.name,avatar:x.avatar,skin:x.skin,cardSkin:x.cardSkin,online:now-x.last_seen<PRESENCE_OFFLINE,colors:g.map(v=>v.colors),status:x.status==='won'?'won':(x.status==='lost'||x.status==='forfeited')||x.personal_end&&now>=x.personal_end&&g.length>0?'lost':g.length?'playing':'waiting',attempts:g.length,forfeited:x.status==='forfeited',hintUsed:!!r.hint_policy&&!!x.hint_used,finishedAt:x.finished_at};});
 const ranked=rankPlayers(players,mode);
 const activeCount=players.filter(p=>p.status==='playing').length;
 const revision=await dataRevision();
 const [reactions,history,weeklyRows]=await Promise.all([
 all('SELECT r.id,r.emoji,r.member_id AS memberId,r.created_at AS createdAt,m.name FROM reactions r JOIN members m ON m.id=r.member_id WHERE r.room_id=? AND r.created_at>? ORDER BY r.created_at DESC LIMIT 160',roomId,now-6500),
 mode==='daily'?derivedCache('history:'+roomId+':'+m.id+':'+room.current_round_id,revision,()=>all(`SELECT r.id,r.answer,r.width,r.starts_at AS startsAt,COUNT(p.id) AS participants,SUM(CASE WHEN p.status='won' THEN 1 ELSE 0 END) AS winners,(SELECT CASE WHEN status='playing' AND guesses<>'[]' AND r.phase='interrupted' THEN 'interrupted' ELSE status END FROM plays WHERE round_id=r.id AND member_id=?) AS myStatus,(SELECT json_array_length(guesses) FROM plays WHERE round_id=r.id AND member_id=?) AS myAttempts FROM rounds r LEFT JOIN plays p ON p.round_id=r.id AND p.guesses<>'[]' WHERE r.room_id=? AND r.mode='daily' AND r.retired_at IS NOT NULL AND r.id<>? GROUP BY r.id ORDER BY r.retired_at DESC,r.id DESC LIMIT 10`,m.id,m.id,roomId,room.current_round_id)):Promise.resolve([]),
 derivedCache('weekly:'+roomId+':'+r.variant+':'+weekStart(now),revision,()=>all(`SELECT m.id,m.name,m.avatar,m.skin_id AS skin,m.blocked,COUNT(*) AS wins,AVG(json_array_length(p.guesses)) AS average FROM plays p JOIN rounds r ON r.id=p.round_id JOIN members m ON m.id=p.member_id WHERE r.room_id=? AND r.mode<>'practice' AND p.status='won' AND COALESCE(r.variant,'normal')=? AND p.finished_at>=? AND p.finished_at<? GROUP BY m.id ORDER BY wins DESC,average ASC,m.name`,roomId,r.variant||'normal',weekStart(now),weekStart(now)+7*86400000))
 ]);
 const weekly=(weeklyRows as Array<{wins:number;average:number}>).map((x)=>({...x,rank:(weeklyRows as Array<{wins:number;average:number}>).findIndex(y=>y.wins===x.wins&&y.average===x.average)+1}));
 const reviews=!spectator&&(status==='won'||status==='lost')&&phase!=='lobby'?rows.filter(x=>x.status==='won'||(x.status==='lost'||x.status==='forfeited')||x.personal_end&&now>=x.personal_end&&x.guesses&&x.guesses!=='[]').map(x=>({id:x.id,name:x.name,avatar:x.avatar,skin:x.skin,cardSkin:x.cardSkin,status:x.status==='won'?'won':'lost',guesses:JSON.parse(x.guesses||'[]')})):[];
 const [chat,notice,invitations]=await Promise.all([chatState(roomId,m),announcementGet(req).then(r=>r.json() as Promise<{announcement?:unknown}>),invitationInbox(req)]);
 return {chat,invitations,announcement:notice.announcement,party,roster:rows.map(x=>({spectator:!!x.spectator||!!x.watched,title:x.title||'',id:x.id,name:x.name,avatar:x.avatar,skin:x.skin,cardSkin:x.cardSkin,...equippedAtLevel(x.account_id?x.name_color:null,x.account_id?x.avatar_frame:null,levels.get(x.account_id)?.level||1),linked:!!x.account_id,level:x.account_id?levels.get(x.account_id)?.level||1:null,presence:now-x.last_seen>=PRESENCE_OFFLINE?'offline':now-x.last_active>=20000?'away':'online'})),history,weekly,weekLabel:date(weekStart(now)),reviews,live,wordCounts:WORD_COUNTS,
 room:{activeSpeedId:room.active_speed_id||null,id:room.id,name:room.name,isHost:(room.host_id===m.id||isSiteAdmin(req)),isAdmin:isSiteAdmin(req),hostId:room.host_id,inviteKey:room.invite_code||room.id,liveId:room.live_id,roundNo:room.round_no,canReset:mode==='daily'&&(room.host_id===m.id||isSiteAdmin(req))&&activeCount===0,activeCount},
 me:{id:m.id,name:m.name,avatar:m.avatar},round:{id:r.id,mode:r.mode,width:r.width,dictionaryVersion:r.dictionary_version,phase,startsAt:r.starts_at,endsAt:personalEnd,expired:!!expired},play:{forfeited:p?.status==='forfeited',guesses:p?JSON.parse(p.guesses):[],status,...(!spectator&&(status==='won'||status==='lost')&&phase!=='lobby'?{answer:r.answer}:{})},players:ranked,reactions,serverNow:now,date:date()};
}
async function chatState(roomId:string,m:any){
 const current=await one('SELECT current_round_id FROM rooms WHERE id=?',roomId);const fresh=await one('SELECT * FROM members WHERE id=?',m.id);const channel=await isSpectator(fresh,current.current_round_id)?'spectator':'player';
 const messages=await all(`SELECT c.id,c.member_id AS memberId,m.name,m.avatar,m.skin_id AS skin,CASE WHEN c.deleted=1 THEN '' ELSE c.body END AS body,c.created_at AS createdAt,c.deleted,c.system FROM chat_messages c JOIN members m ON m.id=c.member_id WHERE c.room_id=? AND c.channel=? ORDER BY c.id DESC LIMIT 60`,roomId,channel);
 return {messages:messages.reverse(),serverNow:Date.now(),channel};
}
async function tryStart(roundId:string,now:number){return run(`UPDATE rounds SET phase='running',starts_at=?,ends_at=? WHERE id=? AND phase='lobby' AND (SELECT COUNT(*) FROM live_participants WHERE round_id=?)>=2 AND NOT EXISTS(SELECT 1 FROM live_participants WHERE round_id=? AND ready=0)`,now+5000,now+185000,roundId,roundId,roundId);}
async function presenceNotice(m:any,now:number){
 const condition='id=? AND blocked=0 AND (chat_seen=0 OR (last_seen<? AND chat_seen<?))';
 await database().batch([
 database().prepare(`INSERT INTO chat_messages(room_id,member_id,channel,request_id,body,created_at,system) SELECT room_id,id,CASE WHEN spectator=1 OR EXISTS(SELECT 1 FROM spectators sp JOIN rooms rr ON rr.current_round_id=sp.round_id WHERE sp.member_id=members.id AND rr.id=members.room_id) THEN 'spectator' ELSE 'player' END,?, '접속했습니다',?,1 FROM members WHERE ${condition} ON CONFLICT(member_id,request_id) DO NOTHING`).bind('presence:'+m.id+':'+m.last_seen,now,m.id,now-90000,now-120000),
 database().prepare(`UPDATE members SET chat_seen=? WHERE ${condition}`).bind(now,m.id,now-90000,now-120000),
 database().prepare('UPDATE members SET last_seen=? WHERE id=?').bind(now,m.id)
 ]);
}
async function publicProfile(req:Request,roomId:string,targetId:string){
 await auth(req,roomId);
 const target=await one('SELECT * FROM members WHERE id=? AND room_id=? AND blocked=0',targetId,roomId);
 check(target,'이 방의 참가자를 찾을 수 없어요.',404);
 const identity=target.account_id?'m.account_id=?':'m.account_id IS NULL AND m.token_hash=?';
 const identityValue=target.account_id||target.token_hash;
 const aggregate=async(inRoom:boolean)=>await one(`SELECT COUNT(*) completed,COALESCE(SUM(p.status='won'),0) wins,AVG(CASE WHEN p.status='won' THEN json_array_length(p.guesses)*1.0/CASE WHEN r.mode='speed' THEN 5 ELSE 1 END END) average FROM plays p JOIN members m ON m.id=p.member_id JOIN rounds r ON r.id=p.round_id WHERE ${identity} AND r.mode<>'practice' AND p.status IN('won','lost','forfeited') ${inRoom?'AND r.room_id=?':''}`,...(inRoom?[identityValue,roomId]:[identityValue]));
 const [overall,roomStats,levels,title]=await Promise.all([aggregate(false),aggregate(true),accountProgressions(target.account_id?[target.account_id]:[]),one('SELECT title FROM equipped_titles WHERE owner=?',memberOwner(target))]);
 return {name:target.name,avatar:target.avatar,skin:target.skin_id,linked:!!target.account_id,level:target.account_id?levels.get(target.account_id)?.level||1:null,title:title?.title||'',overall,room:roomStats};
}
export async function GET(req:Request){try{const url=new URL(req.url),room=url.searchParams.get('room')||'';if(url.searchParams.get('lobby')==='1'){
 const now=Date.now(),admin=isSiteAdmin(req),archived=url.searchParams.get('archived')==='1';
 check(!archived||admin,'관리자만 보관된 방을 볼 수 있어요.',403);
 const rooms=await all(`SELECT r.id,r.name,(r.password_hash IS NOT NULL) AS locked,r.round_no AS roundNo,h.name AS hostName,COALESCE(q.width,5) AS width,
 COUNT(m.id) AS memberCount,COALESCE(SUM(CASE WHEN m.last_seen>? THEN 1 ELSE 0 END),0) AS onlineCount,
 COALESCE(MAX(m.last_seen),r.created_at) AS lastActive
 FROM rooms r LEFT JOIN members h ON h.id=r.host_id LEFT JOIN rounds q ON q.id=r.current_round_id
 LEFT JOIN members m ON m.room_id=r.id AND m.blocked=0
 WHERE (r.archived_at IS NOT NULL)=?
 GROUP BY r.id ORDER BY onlineCount>0 DESC,lastActive DESC,r.id LIMIT 101`,now-PRESENCE_OFFLINE,archived?1:0);
 const shown=rooms.slice(0,100);
 const previews=shown.length?await all(`SELECT m.room_id,m.id,m.name,m.avatar,m.skin_id AS skin,m.last_seen,m.spectator,
 CASE WHEN r.active_speed_id IS NOT NULL THEN 'speed' ELSE COALESCE(q.variant,'normal') END AS variant,
 CASE WHEN r.active_speed_id IS NOT NULL THEN sr.ends_at ELSE q.ends_at END AS endsAt,
 COALESCE(p.status,'waiting') AS status,COALESCE(json_array_length(p.guesses),0) AS attempts,
 (SELECT COUNT(*) FROM json_each(COALESCE(sp.state,'{"puzzles":[]}'),'$.puzzles') j WHERE json_extract(j.value,'$.status')='won') AS solved
 FROM members m JOIN rooms r ON r.id=m.room_id LEFT JOIN rounds q ON q.id=r.current_round_id
 LEFT JOIN speed_rounds sr ON sr.id=r.active_speed_id
 LEFT JOIN plays p ON p.member_id=m.id AND p.round_id=COALESCE(r.active_speed_id,r.current_round_id)
 LEFT JOIN speed_plays sp ON sp.member_id=m.id AND sp.round_id=r.active_speed_id
 WHERE m.blocked=0 AND m.room_id IN (${shown.map(()=>'?').join(',')})
 ORDER BY m.last_seen>? DESC,m.rowid`,...shown.map(r=>r.id),now-PRESENCE_OFFLINE):[];
 for(const r of shown){const members=previews.filter(m=>m.room_id===r.id);r.preview=members.slice(0,6).map(m=>({id:m.id,name:m.name,avatar:m.avatar,skin:m.skin,online:m.last_seen>now-PRESENCE_OFFLINE,spectator:!!m.spectator,status:m.status==='playing'&&m.endsAt&&m.endsAt<=now?'lost':m.status,progress:m.variant==='speed'?m.solved:Math.min(5,m.attempts)}));r.variant=members[0]?.variant||'normal';r.playing=members.filter(m=>!m.spectator&&m.status==='playing'&&(!m.endsAt||m.endsAt>now)).length;r.won=members.filter(m=>!m.spectator&&m.status==='won').length;}
 const owner=accountId(req);const [chatResponse,notice,levels,people,invitations,profile]=await Promise.all([lobbyChatGet(req),announcementGet(req).then(r=>r.json() as Promise<{announcement?:unknown}>),accountProgressions(owner?[owner]:[]),companions(req),invitationInbox(req),owner?one('SELECT avatar,skin_id AS skin FROM profiles WHERE id=?',owner):Promise.resolve(null)]);const chat=await chatResponse.json();if(!chatResponse.ok)throw Error('chat unavailable');const response=reply({profile,rooms:rooms.slice(0,100),hasMore:rooms.length>100,serverNow:now,isAdmin:admin,chat,people,invitations,progression:owner?levels.get(owner)||null:null,announcement:notice.announcement});const guestCookie=chatResponse.headers.get('Set-Cookie');if(guestCookie)response.headers.set('Set-Cookie',guestCookie);return response;
 }if(url.searchParams.has('profile'))return reply(await publicProfile(req,room,url.searchParams.get('profile')||''));if(url.searchParams.get('chat')==='1'){const m=await auth(req,room);return reply(await chatState(room,m));}if(url.searchParams.get('info')){const r=url.searchParams.get('publicRoom')==='1'?await one('SELECT name,password_hash FROM rooms WHERE id=?',room):await resolveRoom(req,room);check(r,'방을 찾을 수 없어요.',404);return reply({name:r.name,locked:!!r.password_hash});}const mode=url.searchParams.get('mode')||'daily';check(['daily','practice','live'].includes(mode),'게임 모드를 확인해 주세요.');let id=room;try{await auth(req,id);}catch(e){if(!(e instanceof UserError)||e.status===403)throw e;const r=await resolveRoom(req,room);id=r.id;}return reply(await state(req,id,mode));}catch(e){return failure(e)}}
export async function POST(req:Request){try{
 const origin=req.headers.get('origin');check(!origin||origin===new URL(req.url).origin,'이 페이지에서 다시 시도해 주세요.',403);check(Number(req.headers.get('content-length')||0)<8192,'요청이 너무 길어요.');const b:any=await req.json();check(b&&typeof b==='object'&&!Array.isArray(b),'요청을 확인해 주세요.');const now=Date.now();
 if(b.action==='archive_room'||b.action==='restore_room'){
  check(isSiteAdmin(req),'관리자만 방을 정리할 수 있어요.',403);
  check(typeof b.room==='string'&&/^[a-f0-9]{24}$/.test(b.room),'방을 확인해 주세요.');
  const changed=await run('UPDATE rooms SET archived_at=? WHERE id=?',b.action==='archive_room'?now:null,b.room);
  check(changed.meta.changes,'방을 찾을 수 없어요.',404);
  return reply({ok:true});
 }
 if(b.action==='create'||b.action==='join'){
  const name=typeof b.name==='string'?b.name.trim().slice(0,16):'';check(name,'닉네임을 입력해 주세요.');const avatar=avatars.includes(b.avatar)?b.avatar:avatars[0];let token=cookie(req);if(!/^[a-f0-9]{64}$/.test(token))token=uuid().replaceAll('-','')+uuid().replaceAll('-','');const tokenHash=await hash(token),id=uuid(),owner=accountId(req);
  check((await avatarAccess(req)).includes(avatar),'아직 해금되지 않은 캐릭터예요. 필요한 레벨을 확인해 주세요.',403);
  if(b.action==='create'){check(b.password===undefined||b.password===''||validRoomPassword(b.password),'비밀번호는 4~32자로 입력해 주세요.');const passwordHash=b.password?await hashRoomPassword(b.password):null;const variant=b.variant??'normal';check(['normal','items'].includes(variant),'대전 방식을 확인해 주세요.');const recent=await one('SELECT COUNT(*) n FROM members m JOIN rooms r ON r.host_id=m.id WHERE m.token_hash=? AND r.created_at>?',tokenHash,now-3600000);check(recent.n<5,'한 시간에 최대 5개 방을 만들 수 있어요.',429);const roomId=key(),inviteKey=key(),roundId=uuid(),width=widthOf(b.width);const roomName=typeof b.roomName==='string'?b.roomName.trim().slice(0,24):'';check(roomName,'방 이름을 입력해 주세요.');await database().batch([database().prepare('INSERT INTO rooms(id,name,host_id,created_at,current_round_id,round_no,invite_code,password_hash) VALUES(?,?,?,?,?,1,?,?)').bind(roomId,roomName,id,now,roundId,inviteKey,passwordHash),database().prepare('INSERT INTO rounds(id,room_id,mode,answer,starts_at,ends_at,width,dictionary_version,variant,hint_policy) VALUES(?,?,?,?,?,?,?,1,?,1)').bind(roundId,roomId,'daily',randomWord(undefined,width),now,now+ROOM_ROUND_MS,width,variant),database().prepare('INSERT INTO members(id,room_id,token_hash,name,avatar,last_seen,account_id,last_active) VALUES(?,?,?,?,?,?,?,?)').bind(id,roomId,tokenHash,name,avatar,now,owner,now)]);return reply({roomId},200,token,req);}
  const room=b.lobby===true?await one('SELECT * FROM rooms WHERE id=?',typeof b.room==='string'?b.room:''):await resolveRoom(req,b.room);check(room,'방을 찾을 수 없어요.',404);const existing=await findMember(req,room.id);if(room.password_hash&&!existing&&!isSiteAdmin(req)){check(await allowRoomPasswordAttempt(room.id,req.headers.get('CF-Connecting-IP')||tokenHash),'시도가 많아요. 잠시 후 다시 입력해 주세요.',429);check(await verifyRoomPassword(b.password,room.password_hash),'방 비밀번호를 확인해 주세요.',403);}if(b.spectator===true&&existing)check(!await one("SELECT 1 FROM plays WHERE round_id=? AND member_id=? AND guesses<>'[]'",room.current_round_id,existing.id),'제출한 판에는 관전으로 전환할 수 없어요.');const occupied=await one('SELECT id,account_id FROM members WHERE room_id=? AND token_hash=?',room.id,tokenHash);if(!existing&&occupied){token=uuid().replaceAll('-','')+uuid().replaceAll('-','');}const joinHash=await hash(token);check(!existing?.blocked||isSiteAdmin(req),'이 방에서 내보내졌어요.',403);const duplicate=await one('SELECT id FROM members WHERE room_id=? AND name=?',room.id,name);check(!duplicate||duplicate.id===existing?.id,'이미 사용 중인 닉네임이에요.');if(existing){if(!existing.chat_seen||now-existing.last_seen>=90000)await presenceNotice(existing,now);await run('UPDATE members SET name=?,avatar=? WHERE id=?',name,avatar,existing.id);}else{const inserted=await run('INSERT INTO members(id,room_id,token_hash,name,avatar,last_seen,account_id,last_active) SELECT ?,?,?,?,?,?,?,? WHERE (?=1 OR (SELECT COUNT(*) FROM members WHERE room_id=? AND blocked=0)<40)',id,room.id,joinHash,name,avatar,now,owner,now,isSiteAdmin(req)?1:0,room.id);check(inserted.meta.changes,'이 방은 최대 40명까지 참여할 수 있어요.');}if(b.spectator===true){const changedRole=await run("UPDATE members SET spectator=1 WHERE id=? AND NOT EXISTS(SELECT 1 FROM plays WHERE round_id=? AND member_id=members.id AND guesses<>'[]')",existing?.id||id,room.current_round_id);check(changedRole.meta.changes,'이미 제출한 판에는 관전할 수 없어요.',409);await trackSpectator({...existing,id:existing?.id||id,spectator:1},room.current_round_id);}return reply({roomId:room.id},200,token,req);
 }
 const m=await auth(req,b.room),room=await one('SELECT * FROM rooms WHERE id=?',b.room);check(room,'방을 찾을 수 없어요.',404);const responseMode=['daily','practice','live'].includes(b.mode)?b.mode:'daily';
 if(b.action==='chat_send'){
  const channel=await isSpectator(m,room.current_round_id)?'spectator':'player';
  const body=typeof b.body==='string'?b.body.trim():'';
  check(body.length>0&&body.length<=300,'메시지는 1~300자로 입력해 주세요.');
  check(typeof b.requestId==='string'&&/^[a-f0-9-]{36}$/.test(b.requestId),'전송 정보를 확인해 주세요.');
  const inquiry=inquiryCommand(body);
  if(inquiry!==null){check(inquiry,'@문의 뒤에 내용을 적어 주세요.');const owner=await inquiryOwner(req);check(owner,'다시 로그인해 주세요.',401);let id:string;try{id=await createInquiry(owner,{requestId:b.requestId,name:m.name,category:'채팅 문의',title:inquiry.slice(0,80),body:inquiry})}catch(e){throw new UserError((e as Error).message)}return reply({...await chatState(room.id,m),inquiryId:id});}
  const existing=await one('SELECT id,body FROM chat_messages WHERE member_id=? AND request_id=?',m.id,b.requestId);
  if(existing){check(existing.body===body,'이미 처리된 전송입니다.',409);return reply(await chatState(room.id,m));}
  const inserted=await run(`INSERT INTO chat_messages(room_id,member_id,channel,request_id,body,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM members WHERE id=? AND room_id=? AND blocked=0 AND CASE WHEN spectator=1 OR EXISTS(SELECT 1 FROM spectators WHERE round_id=? AND member_id=members.id) THEN 'spectator' ELSE 'player' END=?) AND NOT EXISTS(SELECT 1 FROM chat_messages WHERE member_id=? AND system=0 AND created_at>?) ON CONFLICT(member_id,request_id) DO NOTHING`,room.id,m.id,channel,b.requestId,body,now,m.id,room.id,room.current_round_id,channel,m.id,now-1500);
  if(!inserted.meta.changes){const retry=await one('SELECT body FROM chat_messages WHERE member_id=? AND request_id=?',m.id,b.requestId);check(retry?.body===body,'잠깐만요. 메시지는 1.5초에 한 번 보낼 수 있어요.',429);}
  return reply(await chatState(room.id,m));
 }
 if(b.action==='chat_delete'){
  check(Number.isSafeInteger(b.messageId)&&b.messageId>0,'메시지를 확인해 주세요.');
  const changed=await run(`UPDATE chat_messages SET deleted=1 WHERE id=? AND room_id=? AND (member_id=? OR ?=1 OR EXISTS(SELECT 1 FROM rooms WHERE id=? AND host_id=?)) AND EXISTS(SELECT 1 FROM members WHERE id=? AND (blocked=0 OR ?=1))`,b.messageId,room.id,m.id,isSiteAdmin(req)?1:0,room.id,m.id,m.id,isSiteAdmin(req)?1:0);
  check(changed.meta.changes,'본인 메시지 또는 방장만 삭제할 수 있어요.',403);
  return reply(await chatState(room.id,m));
 }
 if(['check_word','guess','forfeit','practice','react'].includes(b.action))check(!await isSpectator(m,room.current_round_id),'관전 중에는 게임에 참여할 수 없어요.',403);
 if(b.action==='check_word'){
  check(['daily','practice'].includes(b.mode),'게임 모드를 확인해 주세요.');
  check(b.mode!=='daily'||!room.active_speed_id,'스피드전으로 전환됐어요.',409);const r=await getRound(room,m,b.mode);check(r&&r.id===b.roundId,'문제가 바뀌었어요. 다시 확인해 주세요.',409);
  check(typeof b.word==='string'&&b.word.length<=32,'입력을 확인해 주세요.');
  const shape=inputShape(b.word,r.width);
  return reply({roundId:r.id,word:shape.letters.join(''),valid:shape.valid&&acceptsGuess(shape.letters,r.dictionary_version)});
 }
 if(b.action==='rename'){const name=typeof b.name==='string'?b.name.trim().slice(0,16):'';check(name,'닉네임을 입력해 주세요.');const result=await run('UPDATE members SET name=? WHERE id=? AND NOT EXISTS(SELECT 1 FROM members WHERE room_id=? AND name=? AND id<>?)',name,m.id,room.id,name,m.id);check(result.meta.changes,'이미 사용 중인 닉네임이에요.');return reply(await state(req,room.id,responseMode));}
 if(['transfer','kick','rotate_invite'].includes(b.action)){
  check((room.host_id===m.id||isSiteAdmin(req)),'방장만 사용할 수 있어요.',403);
  if(b.action==='rotate_invite'){const changed=await run('UPDATE rooms SET invite_code=? WHERE id=? AND host_id=?',key(),room.id,room.host_id);check(changed.meta.changes,'방장이 변경됐어요.',409);return reply(await state(req,room.id,responseMode));}
  const target=await one('SELECT * FROM members WHERE id=? AND room_id=? AND blocked=0',b.memberId,room.id);check(target&&(target.id!==m.id||isSiteAdmin(req)&&b.action==='transfer'),'다른 참가자를 선택해 주세요.');
  if(b.action==='kick')check(!target.account_id||!(isAdminAccount(target.account_id)||await one('SELECT account_id FROM linked_game_accounts WHERE account_id=? AND is_admin=1',target.account_id)),'관리자는 내보낼 수 없어요.',403);
  if(b.action==='transfer'){const changed=await run('UPDATE rooms SET host_id=? WHERE id=? AND host_id=?',target.id,room.id,room.host_id);check(changed.meta.changes,'방장이 이미 변경됐어요.',409);}
  else{const changed=await run(`UPDATE members SET blocked=1 WHERE id=? AND room_id=? AND blocked=0 AND EXISTS(SELECT 1 FROM rooms WHERE id=? AND host_id=? AND host_id<>?)`,target.id,room.id,room.id,room.host_id,target.id);check(changed.meta.changes,'방장이 변경됐거나 이미 내보낸 참가자예요.',409);await run("DELETE FROM live_participants WHERE member_id=? AND round_id IN(SELECT id FROM rounds WHERE room_id=? AND phase='lobby')",target.id,room.id);}
  return reply(await state(req,room.id,responseMode));
 }
 if(b.action==='reset'||b.action==='force_reset'){
  const force=b.action==='force_reset';
  await settleSpeed(room.id,now);
  check(!await one(`SELECT 1 FROM rooms WHERE id=? AND EXISTS(${speedPlayingSQL})`,room.id,now,now),'스피드전이 진행 중이에요. 묶음 종료 후 모드를 바꿔 주세요.',409);
  check((room.host_id===m.id||isSiteAdmin(req)),'방장만 새 문제를 시작할 수 있어요.',403);const current=await getRound(room,m,'daily');check(current.id===b.roundId,'이미 새 문제로 넘어갔어요.',409);const id=uuid(),width=widthOf(b.width,current.width);const answer=await choose(room.id,width);if(current.ends_at)await expirePlays(current,now);const variant=b.variant??current.variant??'normal';check(['normal','items'].includes(variant),'대전 방식을 확인해 주세요.');
  const result=await database().batch([database().prepare('INSERT INTO rounds(id,room_id,mode,answer,starts_at,ends_at,width,dictionary_version,variant,hint_policy) VALUES(?,?,?,?,?,?,?,1,?,1)').bind(id,room.id,'daily',answer,now,now+ROOM_ROUND_MS,width,variant),database().prepare(`UPDATE rooms SET current_round_id=?,active_speed_id=NULL,round_no=round_no+1 WHERE id=? AND host_id=? AND current_round_id=? AND NOT EXISTS(${speedPlayingSQL}) AND (?=1 OR NOT EXISTS(SELECT 1 FROM plays p JOIN members m ON m.id=p.member_id WHERE p.round_id=? AND p.status='playing' AND p.guesses<>'[]' AND m.blocked=0))`).bind(id,room.id,room.host_id,current.id,now,now,force?1:0,current.id),database().prepare("UPDATE rounds SET retired_at=?,phase=CASE WHEN ?=1 THEN 'interrupted' ELSE phase END WHERE id=? AND EXISTS(SELECT 1 FROM rooms WHERE id=? AND current_round_id=?)").bind(now,force?1:0,current.id,room.id,id)]);
  if(!result[1].meta.changes){await run('DELETE FROM rounds WHERE id=?',id);throw new UserError('풀이 중인 사람이 있거나 문제가 바뀌었어요.',409);}return reply(await state(req,room.id,'daily'));
 }
 if(b.action==='lobby'||b.action==='rematch')throw new UserError('라이브 대전은 종료됐어요. 우리 방 문제를 이용해 주세요.',410);
 if(['join_lobby','ready','leave_lobby','start','cancel_lobby'].includes(b.action)){
  const r=await getRound(room,m,'live');check(r.id===b.roundId,'대기실이 바뀌었어요.',409);check(r.phase==='lobby','이미 대전이 시작되었거나 끝났어요.',409);
  if(b.action==='cancel_lobby'){check((room.host_id===m.id||isSiteAdmin(req)),'방장만 대기실을 닫을 수 있어요.',403);await run("UPDATE rounds SET phase='cancelled',ends_at=? WHERE id=? AND phase='lobby'",now,r.id);}
  else if(b.action==='start'){check((room.host_id===m.id||isSiteAdmin(req)),'방장만 시작할 수 있어요.',403);const changed=await tryStart(r.id,now);check(changed.meta.changes,'2명 이상 참여하고 모두 준비해야 시작할 수 있어요.');}
  else if(b.action==='leave_lobby'){await run("DELETE FROM live_participants WHERE round_id=? AND member_id=? AND EXISTS(SELECT 1 FROM rounds WHERE id=? AND phase='lobby')",r.id,m.id,r.id);await tryStart(r.id,now);}
  else{const ready=b.action==='ready'&&b.ready===true?1:0;const changed=await run(`INSERT INTO live_participants(round_id,member_id,ready) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM rounds WHERE id=? AND phase='lobby') ON CONFLICT(round_id,member_id) DO UPDATE SET ready=excluded.ready`,r.id,m.id,ready,r.id);check(changed.meta.changes,'이미 대전이 시작됐어요.',409);await tryStart(r.id,now);}
  return reply(await state(req,room.id,'live'));
 }
 if(b.action==='forfeit'){
  check(b.mode==='daily','우리 방 문제에서만 기권할 수 있어요.');
  check(b.roundId===room.current_round_id,'문제가 바뀌었어요. 다시 확인해 주세요.',409);
  const changed=await run(`UPDATE plays SET status='forfeited',finished_at=?,updated_at=? WHERE round_id=? AND member_id=? AND status='playing' AND guesses<>'[]' AND json_array_length(guesses)=? AND EXISTS(SELECT 1 FROM rooms WHERE id=? AND current_round_id=?) AND EXISTS(SELECT 1 FROM members WHERE id=? AND blocked=0)`,now,now,b.roundId,m.id,b.expected,room.id,b.roundId,m.id);
  check(changed.meta.changes,'이미 끝났거나 기록이 바뀌었어요. 다시 확인해 주세요.',409);
  return reply(await state(req,room.id,'daily'));
 }
 if(b.action==='practice'){if(m.practice_id&&!b.new)return reply(await state(req,room.id,'practice'));const id=uuid(),width=widthOf(b.width);await run('INSERT INTO rounds(id,room_id,mode,answer,starts_at,owner_id,width,dictionary_version) VALUES(?,?,?,?,?,?,?,1)',id,room.id,'practice',await choose(room.id,width,m.id),now,m.id,width);await run('UPDATE members SET practice_id=? WHERE id=?',id,m.id);return reply(await state(req,room.id,'practice'));}
 if(b.action==='react'){check(['👏','👀','🔥','☕'].includes(b.emoji),'사용할 수 없는 응원이에요.');const recent=await one('SELECT created_at FROM reactions WHERE member_id=? ORDER BY created_at DESC LIMIT 1',m.id);check(!recent||now-recent.created_at>=2000,'응원은 2초에 한 번씩 보낼 수 있어요.',429);const reaction={id:uuid(),memberId:m.id,name:m.name,emoji:b.emoji,createdAt:now};await run('INSERT INTO reactions(id,room_id,member_id,emoji,created_at) VALUES(?,?,?,?,?)',reaction.id,room.id,m.id,b.emoji,now);await run('DELETE FROM reactions WHERE room_id=? AND created_at<?',room.id,now-60000);return reply({ok:true,reaction});}
 check(b.action==='guess','요청을 확인해 주세요.');check(['daily','live','practice'].includes(b.mode),'게임 모드를 확인해 주세요.');check(b.mode!=='daily'||!room.active_speed_id,'스피드전으로 전환됐어요.',409);const r=await getRound(room,m,b.mode);check(r&&r.id===b.roundId,'문제가 바뀌었어요. 다시 확인해 주세요.',409);check(r.phase==='running','대전이 시작된 뒤 제출해 주세요.',409);check(now>=r.starts_at,'카운트다운이 끝나면 제출할 수 있어요.');const loadout=await ensureLoadout(r,m);const effectiveEnd=loadout?.ends_at??r.ends_at;check(!effectiveEnd||now<effectiveEnd,'이번 게임이 끝났어요.',409);check(!r.owner_id||r.owner_id===m.id,'본인의 연습 문제만 풀 수 있어요.',403);if(r.restricted)check(await one('SELECT member_id FROM live_participants WHERE round_id=? AND member_id=?',r.id,m.id),'관전 중에는 제출할 수 없어요.',403);
 const letters=typeof b.word==='string'?splitWord(b.word):[];check(letters.length===r.width&&letters.every(c=>'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎㅏㅑㅓㅕㅗㅛㅜㅠㅡㅣ'.includes(c)),`자음·모음 ${r.width}칸을 채워 주세요.`);
 check(acceptsGuess(letters,r.dictionary_version),'등록된 단어가 아니에요. 다른 단어로 시도해 주세요.');
 await run('INSERT INTO plays(id,round_id,member_id,updated_at) VALUES(?,?,?,?) ON CONFLICT(round_id,member_id) DO NOTHING',uuid(),r.id,m.id,0);const p=await one('SELECT * FROM plays WHERE round_id=? AND member_id=?',r.id,m.id);check(p.status==='playing','이미 마친 문제예요.',409);const guesses:Guess[]=JSON.parse(p.guesses);check(b.expected===guesses.length,'다른 창에서 기록이 바뀌었어요. 다시 확인해 주세요.',409);check(guesses.length<5,'다섯 번의 기회를 모두 사용했어요.');check(!guesses.some(g=>g.letters.join('')===letters.join('')),'이미 제출한 단어예요.');check(now-p.updated_at>=500,'잠깐만 기다렸다 다시 제출해 주세요.',429);const colors=score(letters,splitWord(r.answer));guesses.push({letters,colors});const status=colors.every(c=>c==='green')?'won':guesses.length===5?'lost':'playing';
 const updated=await run(`UPDATE plays SET guesses=?,status=?,finished_at=?,updated_at=? WHERE id=? AND guesses=? AND status='playing' AND EXISTS(SELECT 1 FROM members WHERE id=? AND blocked=0) AND (?<>? OR EXISTS(SELECT 1 FROM rooms WHERE id=? AND current_round_id=? AND active_speed_id IS NULL)) AND EXISTS(SELECT 1 FROM rounds r WHERE r.id=plays.round_id AND (COALESCE((SELECT ends_at FROM item_loadouts WHERE round_id=r.id AND member_id=plays.member_id),r.ends_at) IS NULL OR COALESCE((SELECT ends_at FROM item_loadouts WHERE round_id=r.id AND member_id=plays.member_id),r.ends_at)>?)) AND NOT EXISTS(SELECT 1 FROM spectators WHERE round_id=plays.round_id AND member_id=plays.member_id) AND EXISTS(SELECT 1 FROM members WHERE id=plays.member_id AND spectator=0)`,JSON.stringify(guesses),status,status==='playing'?null:now,now,p.id,p.guesses,m.id,b.mode,'daily',room.id,r.id,Date.now());check(updated.meta.changes,'기록 또는 참가 상태가 바뀌었어요. 다시 확인해 주세요.',409);
 if(b.fast===true)return reply({submitted:true,roomId:room.id,roundId:r.id,memberId:m.id,serverNow:Date.now(),finishedAt:status==='playing'?null:now,play:{guesses,status,...(status!=='playing'?{answer:r.answer}:{})}});
 return reply(await state(req,room.id,b.mode));
 }catch(e){return failure(e)}}
