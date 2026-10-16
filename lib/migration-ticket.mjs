export const SOURCE='https://word-office-garam.river2.chatgpt.site';
export const TARGET='https://play.jamopop.workers.dev';
const enc=new TextEncoder();
export const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
export const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
export const hash=async value=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value))));
const b64=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const unb64=value=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
async function key(secret){if(!/^[a-f0-9]{64}$/.test(secret||''))throw Error('disabled');return crypto.subtle.importKey('raw',Uint8Array.from(secret.match(/../g),x=>parseInt(x,16)),'AES-GCM',false,['encrypt','decrypt']);}
export async function seal(payload,secret){const iv=crypto.getRandomValues(new Uint8Array(12));const body=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(TARGET)},await key(secret),enc.encode(JSON.stringify(payload)));return b64(iv)+'.'+b64(new Uint8Array(body));}
export async function open(ticket,secret,now=Date.now()){
 if(typeof ticket!=='string'||ticket.length>8192)throw Error('invalid');
 const parts=ticket.split('.');if(parts.length!==2)throw Error('invalid');
 const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(parts[0]),additionalData:enc.encode(TARGET)},await key(secret),unb64(parts[1]));
 const p=JSON.parse(new TextDecoder().decode(plain));
 if(p.iss!==SOURCE||p.aud!==TARGET||!Number.isFinite(p.exp)||p.exp<=now||p.exp>now+120000||! /^[a-f0-9]{64}$/.test(p.jti)||! /^[a-f0-9]{64}$/.test(p.challenge))throw Error('expired or invalid');
 return p;
}
export function cookie(req,name){return req.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1)||'';}
export const secureCookie=(name,value,seconds)=>`${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;
