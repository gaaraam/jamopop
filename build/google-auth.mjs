import {createRemoteJWKSet,jwtVerify} from 'jose';
import {random,hash,cookie,secureCookie} from '../lib/migration-ticket.mjs';
export const ORIGIN='https://play.jamopop.workers.dev';
export const CALLBACK=ORIGIN+'/auth/google/callback';
const JWKS=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const base={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",'X-Robots-Tag':'noindex'};
import {SESSION,sessionAccount,safeReturn} from './session.mjs';
const BROWSER='__Host-jamopop_oauth';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function page(title,body,status=200){return new Response(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · 자음모음팝</title><style>body{font:16px system-ui;background:#f5f5fa;color:#232438;margin:10vh auto;padding:24px;max-width:480px}main{padding:32px;background:white;border-radius:24px;box-shadow:0 20px 60px #20204012}h1{font-size:26px}p{line-height:1.7}a,button{display:inline-block;padding:12px 18px;margin:8px 8px 0 0;border:0;border-radius:12px;background:#f5d76b;color:#252535;font:inherit;text-decoration:none}</style><main><h1>${esc(title)}</h1>${body}</main></html>`,{status,headers:{...base,'Content-Type':'text/html; charset=utf-8'}});}
function redirect(path,cookies=[]){const headers=new Headers({...base,Location:path});for(const c of cookies)headers.append('Set-Cookie',c);return new Response(null,{status:303,headers});}
export async function verifyGoogleToken(token,clientId,nonce,keys=JWKS){
 const {payload:p}=await jwtVerify(token,keys,{issuer:['https://accounts.google.com','accounts.google.com'],audience:clientId,algorithms:['RS256'],requiredClaims:['sub','exp','iat','nonce']});
 if(p.nonce!==nonce||(p.azp&&p.azp!==clientId)||typeof p.sub!=='string'||!p.sub||p.sub.length>255||p.email_verified!==true||typeof p.email!=='string')throw Error('Invalid identity');
 return {subject:p.sub,email:p.email,name:typeof p.name==='string'?p.name:''};
}
export async function googleAuth(req,env){
 const url=new URL(req.url);if(!url.pathname.startsWith('/auth/'))return null;
 if(url.origin!==ORIGIN)return page('사용할 수 없는 주소','<a href="'+ORIGIN+'">새 주소로 이동</a>',400);
 if(!env.GOOGLE_CLIENT_ID||!env.GOOGLE_CLIENT_SECRET)return page('로그인 준비 중','<a href="/">돌아가기</a>',503);
 let returnPath='/?lobby=1';
 const retry=()=>'/auth/google/start?return_to='+encodeURIComponent(returnPath);
 try{
 if(url.pathname==='/auth/google/start'&&req.method==='GET'){
  const state=random(),verifier=random(),nonce=random(),now=Date.now();
  const digest=await hash(verifier),challenge=btoa(String.fromCharCode(...Uint8Array.from(digest.match(/../g),x=>parseInt(x,16)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
  await env.DB.batch([env.DB.prepare('DELETE FROM google_oauth_attempts WHERE expires_at<=?').bind(now),env.DB.prepare('INSERT INTO google_oauth_attempts(state_hash,browser_hash,nonce,expires_at,return_path) VALUES(?,?,?,?,?)').bind(await hash(state),digest,nonce,now+600000,safeReturn(url.searchParams.get('return_to')||'/?lobby=1'))]);
  const target=new URL('https://accounts.google.com/o/oauth2/v2/auth');target.search=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:CALLBACK,response_type:'code',scope:'openid email profile',state,nonce,code_challenge:challenge,code_challenge_method:'S256',prompt:'select_account'}).toString();
  return redirect(target.href,[secureCookie(BROWSER,verifier,600)]);
 }
 if(url.pathname==='/auth/google/callback'&&req.method==='GET'){
  const state=url.searchParams.get('state')||'',verifier=cookie(req,BROWSER);
  if(!/^[a-f0-9]{64}$/.test(state)||!/^[a-f0-9]{64}$/.test(verifier))return page('다시 로그인해 주세요','<a href="/auth/google/start">Google 로그인</a>',400);
  const attempt=await env.DB.prepare('DELETE FROM google_oauth_attempts WHERE state_hash=? AND browser_hash=? AND expires_at>? RETURNING nonce,return_path').bind(await hash(state),await hash(verifier),Date.now()).first();
  if(attempt)returnPath=safeReturn(attempt.return_path);
  if(!attempt)return page('로그인이 만료되었습니다','<a href="/auth/google/start">다시 로그인</a>',400);
  if(url.searchParams.has('error'))return redirect(returnPath,[secureCookie(BROWSER,'',0)]);
  const code=url.searchParams.get('code');if(!code||code.length>4096)throw Error('Invalid callback');
  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,redirect_uri:CALLBACK,grant_type:'authorization_code',code_verifier:verifier}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('Token exchange failed');const tokens=await response.json();
  const p=await verifyGoogleToken(tokens.id_token,env.GOOGLE_CLIENT_ID,attempt.nonce);
  const session=random(),now=Date.now();
  await env.DB.batch([
   env.DB.prepare('INSERT INTO google_accounts(subject,game_account_id,email,name,created_at,last_login_at) VALUES(?,?,?,?,?,?) ON CONFLICT(subject) DO UPDATE SET email=excluded.email,name=excluded.name,last_login_at=excluded.last_login_at').bind(p.subject,'google:'+p.subject,p.email,p.name,now,now),
   env.DB.prepare("INSERT OR IGNORE INTO linked_game_accounts(account_id,subject,label,linked_at) SELECT game_account_id,subject,'Google 프로필',created_at FROM google_accounts WHERE subject=?").bind(p.subject),
   env.DB.prepare('DELETE FROM google_sessions WHERE expires_at<=?').bind(now),
   env.DB.prepare('INSERT INTO google_sessions VALUES(?,?,?)').bind(await hash(session),p.subject,now+30*86400000)
  ]);
  return redirect(safeReturn(attempt.return_path||'/?lobby=1'),[secureCookie(SESSION,session,30*86400),secureCookie(BROWSER,'',0)]);
 }
 if(url.pathname==='/auth/logout'&&req.method==='POST'){
  if(req.headers.get('origin')!==ORIGIN)return page('잘못된 요청','',403);
  const token=cookie(req,SESSION);if(/^[a-f0-9]{64}$/.test(token))await env.DB.prepare('DELETE FROM google_sessions WHERE token_hash=?').bind(await hash(token)).run();
  return redirect('/',[secureCookie(SESSION,'',0)]);
 }
 if(url.pathname==='/auth/account'&&req.method==='GET'){
  const s=await sessionAccount(req,env);if(!s)return redirect('/auth/google/start');
  return redirect('/?lobby=1');
 }
 return page('페이지를 찾을 수 없습니다','<a href="/">돌아가기</a>',404);
 }catch{return page('로그인을 완료하지 못했어요','<p>잠시 후 다시 시도해 주세요.</p><a href="'+esc(retry())+'">다시 로그인</a><a href="'+esc(returnPath)+'">게임으로 돌아가기</a>',503);}
}
