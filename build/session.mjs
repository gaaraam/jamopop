import {cookie,hash} from '../lib/migration-ticket.mjs';
export const SESSION='__Host-jamopop_session';
export function safeReturn(value='/'){
 try{const u=new URL(value,'https://play.jamopop.workers.dev');return u.origin==='https://play.jamopop.workers.dev'&&!u.pathname.startsWith('/auth/')&&value.startsWith('/')&&!value.startsWith('//')?u.pathname+u.search+u.hash:'/?lobby=1'}catch{return '/?lobby=1'}
}
export async function sessionAccount(req,env){
 const token=cookie(req,SESSION);if(!/^[a-f0-9]{64}$/.test(token))return null;
 return env.DB.prepare(`SELECT a.subject,a.game_account_id,a.email,a.name,a.approval_status,COALESCE(l.is_admin,0) is_admin FROM google_sessions s JOIN google_accounts a ON a.subject=s.subject LEFT JOIN linked_game_accounts l ON l.account_id=a.game_account_id AND l.subject=a.subject WHERE s.token_hash=? AND s.expires_at>?`).bind(await hash(token),Date.now()).first();
}
export async function authenticatedRequest(req,env){
 const a=await sessionAccount(req,env);if(!a)return req;
 const h=new Headers(req.headers);
 h.set('oai-authenticated-user-id',a.game_account_id);h.set('oai-authenticated-user-email',a.email);
 h.set('oai-authenticated-user-full-name',encodeURIComponent(a.name));h.set('oai-authenticated-user-full-name-encoding','percent-encoded-utf-8');
 h.set('x-jamopop-approval',a.approval_status||'pending');
 if(a.is_admin)h.set('x-jamopop-admin','1');
 return new Request(req,{headers:h});
}
