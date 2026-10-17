import {run} from './store';
const enc=new TextEncoder();
const hex=(bytes:Uint8Array)=>Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
const bytes=(s:string)=>Uint8Array.from(s.match(/../g)||[],x=>parseInt(x,16));
export function validRoomPassword(value:unknown):value is string{return typeof value==='string'&&value.length>=4&&value.length<=32;}
async function derive(password:string,salt:Uint8Array){
 const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
 return hex(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:salt as BufferSource,iterations:100000},key,256)));
}
export async function hashRoomPassword(password:string){if(!validRoomPassword(password))throw Error('INVALID_PASSWORD');const salt=crypto.getRandomValues(new Uint8Array(16));return `v1:${hex(salt)}:${await derive(password,salt)}`;}
export async function verifyRoomPassword(password:unknown,stored:string){
 if(!validRoomPassword(password)||!/^v1:[a-f0-9]{32}:[a-f0-9]{64}$/.test(stored))return false;
 const [,salt,expected]=stored.split(':');const actual=await derive(password,bytes(salt));let diff=0;for(let i=0;i<actual.length;i++)diff|=actual.charCodeAt(i)^expected.charCodeAt(i);return diff===0;
}
/** Atomic attempt budget shared across isolates; clearing cookies does not reset an IP budget. */
export async function allowRoomPasswordAttempt(room:string,address:string,now=Date.now()){
 const fingerprint=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(room+':'+address))));
 const window=Math.floor(now/60000);
 const result=await run(`INSERT INTO room_join_attempts(room_id,fingerprint,window,attempts) VALUES(?,?,?,1)
 ON CONFLICT(room_id,fingerprint) DO UPDATE SET window=excluded.window,attempts=CASE WHEN room_join_attempts.window=excluded.window THEN room_join_attempts.attempts+1 ELSE 1 END
 WHERE room_join_attempts.window<>excluded.window OR room_join_attempts.attempts<10`,room,fingerprint,window);
 return result.meta.changes>0;
}
