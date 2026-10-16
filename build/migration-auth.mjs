import {SOURCE,TARGET,random,hash,open,cookie,secureCookie} from '../lib/migration-ticket.mjs';
const base={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
export async function authRoute(req,env){
 const url=new URL(req.url);
 if(!url.pathname.startsWith('/auth/'))return null;
 if(!env.MIGRATION_BRIDGE_KEY)return new Response('연결 준비 중입니다.',{status:503,headers:base});
 if(url.pathname==='/auth/start'&&req.method==='GET'){
  const state=random();return new Response(null,{status:303,headers:{...base,Location:SOURCE+'/api/migration-link?challenge='+await hash(state),'Set-Cookie':secureCookie('bw_bridge_state',state,600)}});
 }
 if(url.pathname==='/auth/complete'&&req.method==='GET'){
  try{
   const state=cookie(req,'bw_bridge_state');if(!/^[a-f0-9]{64}$/.test(state))throw Error('state');
   const p=await open(url.searchParams.get('ticket'),env.MIGRATION_BRIDGE_KEY);
   if(p.challenge!==await hash(state))throw Error('state');
   const token=random(),expires=Date.now()+30*86400000;
   const inserted=await env.DB.prepare('INSERT OR IGNORE INTO migration_sessions(ticket_id,token_hash,account_id,email,is_admin,expires_at) VALUES(?,?,?,?,?,?) RETURNING ticket_id').bind(p.jti,await hash(token),p.accountId||null,p.email||'',p.admin?1:0,expires).first();
   if(!inserted)throw Error('replay');
   const headers=new Headers({...base,Location:'/auth/status'});
   headers.append('Set-Cookie',secureCookie('bw_cf_session',token,30*86400));
   headers.append('Set-Cookie',secureCookie('bw_bridge_state','',0));
   if(/^[a-f0-9]{64}$/.test(p.guest))headers.append('Set-Cookie',secureCookie('bw_session',p.guest,365*86400));
   return new Response(null,{status:303,headers});
  }catch{return new Response('연결이 만료되었거나 이미 사용되었습니다. 새 주소에서 다시 연결해 주세요.',{status:400,headers:base});}
 }
 if(url.pathname==='/auth/status'&&req.method==='GET'){
  const token=cookie(req,'bw_cf_session');
  const s=/^[a-f0-9]{64}$/.test(token)?await env.DB.prepare('SELECT account_id FROM migration_sessions WHERE token_hash=? AND expires_at>?').bind(await hash(token),Date.now()).first():null;
  return new Response(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>계정 연결</title><h1>${s?'연결 완료':'계정 연결'}</h1><p>${s?(s.account_id?'회원 계정':'게스트 브라우저')+'이 연결되었습니다. 게임은 이전 검증이 끝난 뒤 열립니다.':'기존 사이트의 계정과 게스트 기록을 연결할 수 있습니다.'}</p><a href="${s?SOURCE:'/auth/start'}">${s?'기존 사이트에서 계속하기':'기존 기록 연결하기'}</a></html>`,{headers:{...base,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"}});
 }
 return new Response('Not found',{status:404,headers:base});
}
