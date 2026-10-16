import {accountId,findMember} from '@/lib/account';
import {one,run} from '@/lib/store';
import {companions} from '@/lib/companions';
const reply=(d:unknown,status=200)=>Response.json(d,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(req:Request){try{return reply(await companions(req))}catch{return reply({error:'함께한 사람을 불러오지 못했어요.'},503)}}
export async function POST(req:Request){try{
 const owner=accountId(req);if(!owner)return reply({error:'친구 등록은 로그인 후 사용할 수 있어요.'},401);
 if(req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)return reply({error:'현재 사이트에서 다시 시도해 주세요.'},403);
 if(Number(req.headers.get('content-length')||0)>2048)return reply({error:'요청이 너무 길어요.'},400);
 const b:any=await req.json(),now=Date.now();
 if(b.action==='request'){
 if(typeof b.member!=='string')return reply({error:'상대를 확인해 주세요.'},400);
 const target=await one('SELECT * FROM members WHERE id=? AND blocked=0',b.member);
 if(!target?.account_id||target.account_id===owner)return reply({error:'연동 회원에게만 요청할 수 있어요.'},400);
 const mine=await findMember(req,target.room_id);if(!mine||mine.blocked)return reply({error:'함께한 방에서만 요청할 수 있어요.'},403);
 const count=await one("SELECT COUNT(*) n FROM friendships WHERE (requester=? OR recipient=?) AND status<>'declined'",owner,owner);if(count.n>=100)return reply({error:'친구와 대기 중 요청은 최대 100개까지 보관할 수 있어요.'},429);
 const existing=await one('SELECT * FROM friendships WHERE (requester=? AND recipient=?) OR (requester=? AND recipient=?)',owner,target.account_id,target.account_id,owner);
 if(existing){return reply({error:existing.status==='accepted'?'이미 친구예요.':'이미 요청한 상대예요.'},409)}
 await run("INSERT OR IGNORE INTO friendships(id,requester,recipient,status,created_at,updated_at) VALUES(?,?,?,'pending',?,?)",crypto.randomUUID(),owner,target.account_id,now,now);
 }else if(['accept','decline','remove'].includes(b.action)&&typeof b.id==='string'){
 if(b.action==='remove')await run('DELETE FROM friendships WHERE id=? AND (requester=? OR recipient=?)',b.id,owner,owner);
 else {const r=await run("UPDATE friendships SET status=?,updated_at=? WHERE id=? AND recipient=? AND status='pending'",b.action==='accept'?'accepted':'declined',now,b.id,owner);if(!r.meta.changes)return reply({error:'처리할 요청이 없어요.'},409);}
 }else return reply({error:'요청을 확인해 주세요.'},400);
 return reply(await companions(req));
 }catch{return reply({error:'친구 요청을 처리하지 못했어요.'},503)}
}
