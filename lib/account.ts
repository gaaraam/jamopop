import {derivedCache,dataRevision} from './derived-cache';
import {unlockedAvatars} from '@/lib/cosmetics';
import {one,all,adminAccountId} from '@/lib/store';

export {AVATARS} from '@/lib/cosmetics';
// Identity headers are stripped at the Worker boundary and rebuilt only from verified Google sessions.
export function accountId(req:Request){return req.headers.get('oai-authenticated-user-id')||null;}
export function guestToken(req:Request){return req.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith('bw_session='))?.slice(11)||'';}
export async function tokenHash(token:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function findMember(req:Request,roomId:string){
 const id=accountId(req);
 if(id){const linked=await one('SELECT * FROM members WHERE room_id=? AND account_id=?',roomId,id);if(linked)return linked;}
 const token=guestToken(req);if(!/^[a-f0-9]{64}$/.test(token))return null;
 // A linked member requires their signed-in account, even on the original browser.
 return one('SELECT * FROM members WHERE room_id=? AND token_hash=? AND account_id IS NULL',roomId,await tokenHash(token));
}

export function progressionFromXp(value:number){
 const xp=Math.max(0,Math.floor(Number.isFinite(value)?value:0));
 const level=Math.floor((1+Math.sqrt(1+xp/12.5))/2);
 const floor=50*(level-1)*level,next=50*level*(level+1);
 return {level,xp,current:xp-floor,required:next-floor,remaining:next-xp};
}
// Derived from saved plays: no client-awarded XP and no double grants on retries.
export async function accountProgressions(ids:string[]){
 const owners=[...new Set(ids.filter(Boolean))].sort();
 if(!owners.length)return new Map<string,ReturnType<typeof progressionFromXp>>();
 return derivedCache('levels:'+JSON.stringify(owners),await dataRevision(),async()=>{
 const rows=await all(`SELECT m.account_id AS owner,COALESCE(SUM(CASE
 WHEN r.mode='speed' AND p.status='won' THEN 90
 WHEN r.mode='speed' AND p.status='lost' THEN 10
 WHEN p.status='won' AND json_array_length(p.guesses)>0 THEN 30
 WHEN p.status='lost' AND json_array_length(p.guesses)=5 THEN 10 ELSE 0 END),0) AS xp
 FROM members m LEFT JOIN plays p ON p.member_id=m.id
 LEFT JOIN rounds r ON r.id=p.round_id
 WHERE m.account_id IN (${owners.map(()=>'?').join(',')}) AND r.mode IN('daily','speed')
 GROUP BY m.account_id`,...owners);
 const result=new Map(owners.map(id=>[id,progressionFromXp(0)]));
 for(const row of rows)result.set(row.owner,progressionFromXp(Number(row.xp)));
 const solo=await all(`SELECT owner,json_extract(state,'$.xp') AS xp FROM solo_progress WHERE owner IN (${owners.map(()=>'?').join(',')})`,...owners.map(id=>'account:'+id));
 for(const row of solo){const id=row.owner.slice(8);result.set(id,progressionFromXp((result.get(id)?.xp||0)+Number(row.xp||0)));}
 return result;
 });
}

export async function avatarAccess(req:Request,level?:number){
 const owner=accountId(req),token=guestToken(req);
 const guest=/^[a-f0-9]{64}$/.test(token)?await tokenHash(token):'';
 // Only trusted persisted choices can retain a character selected before gating.
 const rows=await all('SELECT avatar FROM members WHERE account_id=? OR (account_id IS NULL AND token_hash=?)',owner,guest);
 const profile=owner?await one('SELECT avatar FROM profiles WHERE id=?',owner):null;
 const actualLevel=level??(owner?(await accountProgressions([owner])).get(owner)?.level||1:1);
 return unlockedAvatars(actualLevel,[...rows.map(r=>r.avatar),...(profile?[profile.avatar]:[])]);
}

export function isAdminAccount(id:string|null){const admin=adminAccountId();return !!id&&!!admin&&id===admin}
export function isSiteAdmin(req:Request){return !!accountId(req)&&(req.headers.get('x-jamopop-admin')==='1'||isAdminAccount(accountId(req)))}
