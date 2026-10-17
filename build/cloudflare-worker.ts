import {safetyBefore,safetyEndpoint,safetyAfter} from './safety.mjs';
import handler from 'vinext/server/fetch-handler';
import {stripUntrustedIdentity,migrationResponse} from './cloudflare-boundary.mjs';
import {googleAuth} from './google-auth.mjs';
import {authenticatedRequest} from './session.mjs';
import {legacyLink,profileSwitch} from './legacy-link.mjs';
export default {async fetch(request:Request,env:Cloudflare.Env,ctx:ExecutionContext){
 const sanitized=stripUntrustedIdentity(request),url=new URL(sanitized.url);
 if(url.pathname==='/auth/complete'&&sanitized.method==='GET'){const ticket=url.searchParams.get('ticket')||'';return new Response(null,{status:303,headers:{Location:url.origin+'/transfer#ticket='+encodeURIComponent(ticket),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});}
 if(url.pathname==='/healthz')return Response.json({service:'jamopop',mode:(env as any).MIGRATION_LOCK==='open'?'open':'migration-locked'},{headers:{'Cache-Control':'no-store'}});
 // The old names can exist in saved bookmarks, but never perform GET logout.
 if(url.pathname==='/signin-with-chatgpt')return Response.redirect(url.origin+'/auth/google/start?'+url.searchParams,303);
 if(url.pathname==='/signout-with-chatgpt')return Response.redirect(url.origin+'/?lobby=1',303);
 const transfer=await legacyLink(sanitized,env)||await profileSwitch(sanitized,env);if(transfer)return transfer;
 if(url.pathname==='/auth/google/start'){const gate=await safetyBefore(await authenticatedRequest(sanitized,env),env);if(gate.response)return gate.response;}
 const auth=await googleAuth(sanitized,env);if(auth)return auth;
 if((env as any).MIGRATION_LOCK!=='open')return migrationResponse(sanitized);
 // Cookie-authenticated writes must originate from this frontend.
 if(!['GET','HEAD','OPTIONS'].includes(sanitized.method)&&sanitized.headers.get('origin')!==url.origin)return Response.json({error:'이 페이지에서 다시 시도해 주세요.'},{status:403});
 const trusted=await authenticatedRequest(sanitized,env);
 const safety=await safetyBefore(trusted,env);if(safety.response)return safety.response;
 const direct=await safetyEndpoint(trusted,env,safety);if(direct)return direct;
 let response;try{response=await safetyAfter(trusted,env,await handler.fetch(trusted,env,ctx),safety)}catch{return Response.json({error:'안전 설정을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.'},{status:503})}
 const headers=new Headers(response.headers);
 headers.set('Cache-Control','private, no-store');headers.set('Referrer-Policy','strict-origin-when-cross-origin');headers.set('X-Content-Type-Options','nosniff');
 return new Response(response.body,{status:response.status,headers});
}};
