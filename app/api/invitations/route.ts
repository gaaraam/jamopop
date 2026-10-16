import {accountId} from '@/lib/account';
import {one,all,run} from '@/lib/store';
import {invitationInbox} from '@/lib/room-invitations';
const reply=(d:unknown,status=200)=>Response.json(d,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(req:Request){try{
 const inbox=await invitationInbox(req),owner=accountId(req),room=new URL(req.url).searchParams.get('room');
 if(!owner||!room)return reply(inbox);
 const mine=await one('SELECT m.id FROM members m JOIN rooms r ON r.id=m.room_id WHERE m.room_id=? AND m.account_id=? AND m.blocked=0 AND r.archived_at IS NULL',room,owner);
 if(!mine)return reply({...inbox,friends:[]});
 const friends=await all(`SELECT f.id,COALESCE(p.name,'친구') name,COALESCE(p.avatar,'🐱') avatar,
 EXISTS(SELECT 1 FROM room_invitations i WHERE i.sender=? AND i.recipient=CASE WHEN f.requester=? THEN f.recipient ELSE f.requester END AND i.room_id=? AND i.created_at>?) sent
 FROM friendships f LEFT JOIN profiles p ON p.id=CASE WHEN f.requester=? THEN f.recipient ELSE f.requester END
 WHERE f.status='accepted' AND (f.requester=? OR f.recipient=?) ORDER BY f.updated_at DESC LIMIT 100`,owner,owner,room,Date.now()-30000,owner,owner,owner);
 return reply({...inbox,friends});
 }catch{return reply({error:'초대를 불러오지 못했어요.'},503)}}
export async function POST(req:Request){try{
 const owner=accountId(req);if(!owner)return reply({error:'로그인 후 초대할 수 있어요.'},401);
 if(req.headers.get('origin')!==new URL(req.url).origin)return reply({error:'현재 사이트에서 다시 시도해 주세요.'},403);
 const raw=await req.text();if(raw.length>2048)return reply({error:'요청을 확인해 주세요.'},400);
 let b:any;try{b=JSON.parse(raw)}catch{return reply({error:'요청을 확인해 주세요.'},400)}
 if(!b||typeof b.id!=='string')return reply({error:'초대를 확인해 주세요.'},400);
 const now=Date.now();
 if(b.action==='send'){
  if(typeof b.room!=='string')return reply({error:'방을 확인해 주세요.'},400);
  const f=await one("SELECT * FROM friendships WHERE id=? AND status='accepted' AND (requester=? OR recipient=?)",b.id,owner,owner);
  if(!f)return reply({error:'친구에게만 초대할 수 있어요.'},403);
  const target=f.requester===owner?f.recipient:f.requester;
  const mine=await one('SELECT m.id FROM members m JOIN rooms r ON r.id=m.room_id WHERE m.room_id=? AND m.account_id=? AND m.blocked=0 AND r.archived_at IS NULL',b.room,owner);
  if(!mine)return reply({error:'참여 중인 방에서 초대해 주세요.'},403);
  if(await one('SELECT id FROM members WHERE room_id=? AND account_id=? AND blocked=1',b.room,target))return reply({error:'이 방에 초대할 수 없는 친구예요.'},403);
  const inserted=await run(`INSERT INTO room_invitations(id,sender,recipient,room_id,status,created_at,expires_at)
  SELECT ?,?,?,?,'pending',?,? WHERE (SELECT COUNT(*) FROM room_invitations WHERE sender=? AND created_at>?)<10
  ON CONFLICT(sender,recipient,room_id) DO UPDATE SET status='pending',created_at=excluded.created_at,expires_at=excluded.expires_at WHERE room_invitations.created_at<?`,crypto.randomUUID(),owner,target,b.room,now,now+600000,owner,now-60000,now-30000);
  if(!inserted.meta.changes)return reply({error:'초대를 보냈어요. 잠시 후 다시 보낼 수 있어요.'},429);
  return reply({ok:true});
 }
 if(b.action==='dismiss'){
  await run("UPDATE room_invitations SET status='dismissed' WHERE id=? AND recipient=?",b.id,owner);return reply(await invitationInbox(req));
 }
 if(b.action!=='join')return reply({error:'요청을 확인해 주세요.'},400);
 const i=await one(`SELECT i.*,r.name roomName,r.invite_code FROM room_invitations i JOIN rooms r ON r.id=i.room_id AND r.archived_at IS NULL
 WHERE i.id=? AND i.recipient=? AND i.status IN ('pending','accepted') AND i.expires_at>?
 AND EXISTS(SELECT 1 FROM friendships f WHERE f.status='accepted' AND ((f.requester=i.sender AND f.recipient=i.recipient) OR (f.requester=i.recipient AND f.recipient=i.sender)))
 AND EXISTS(SELECT 1 FROM members m WHERE m.room_id=i.room_id AND m.account_id=i.sender AND m.blocked=0)
 AND NOT EXISTS(SELECT 1 FROM members m WHERE m.room_id=i.room_id AND m.account_id=i.recipient AND m.blocked=1)`,b.id,owner,now);
 if(!i)return reply({error:'만료되었거나 사용할 수 없는 초대예요.'},410);
 const existing=await one('SELECT * FROM members WHERE room_id=? AND account_id=?',i.room_id,owner);
 let joined:Response|undefined;
 if(!existing){
  const profile=await one('SELECT name,avatar FROM profiles WHERE id=?',owner)||await one('SELECT name,avatar FROM members WHERE account_id=? ORDER BY last_seen DESC LIMIT 1',owner);
  if(!profile)return reply({error:'먼저 내 프로필에서 닉네임을 설정해 주세요.'},409);
  const {POST:join}=await import('@/app/api/game/route');
  const headers=new Headers(req.headers);headers.delete('content-length');headers.set('content-type','application/json');
  joined=await join(new Request(new URL('/api/game',req.url),{method:'POST',headers,body:JSON.stringify({action:'join',room:i.invite_code||i.room_id,name:profile.name,avatar:profile.avatar})}));
  if(!joined.ok)return joined;
 }
 await run("UPDATE room_invitations SET status='accepted' WHERE id=? AND recipient=?",i.id,owner);
 const response=reply({url:'/?r='+i.room_id});const cookie=joined?.headers.get('set-cookie');if(cookie)response.headers.set('set-cookie',cookie);return response;
 }catch{return reply({error:'초대를 처리하지 못했어요. 다시 시도해 주세요.'},503)}}
