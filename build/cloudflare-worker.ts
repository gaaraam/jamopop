import {measureRequest,measuredDatabase,measurePhase} from '../lib/operational-metrics.mjs';
import {cleanupExpiredTechnical} from '../lib/retention.mjs';
import {searchPolicy} from '../lib/search-policy.mjs';
import {safetyBefore,safetyEndpoint,safetyAfter} from './safety.mjs';
import handler from 'vinext/server/fetch-handler';
import {stripUntrustedIdentity,migrationResponse} from './cloudflare-boundary.mjs';
import {googleAuth} from './google-auth.mjs';
import {authenticatedRequest} from './session.mjs';
import {legacyLink,profileSwitch} from './legacy-link.mjs';
async function serve(request:Request,env:Cloudflare.Env,ctx:ExecutionContext){
 const sanitized=stripUntrustedIdentity(request),url=new URL(sanitized.url);
 if((env as any).MAINTENANCE_MODE==='on' && !['GET','HEAD','OPTIONS'].includes(request.method))return Response.json({error:'점검 중입니다. 입력을 보관하고 잠시 후 다시 시도해 주세요.'},{status:503,headers:{'Retry-After':'60','Cache-Control':'no-store'}});
 if(url.pathname==='/auth/complete'&&sanitized.method==='GET'){const ticket=url.searchParams.get('ticket')||'';return new Response(null,{status:303,headers:{Location:url.origin+'/transfer#ticket='+encodeURIComponent(ticket),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});}
 if(url.pathname==='/healthz')return Response.json({service:'jamopop',mode:(env as any).MIGRATION_LOCK==='open'?'open':'migration-locked',qa:(env as any).QA_ONLY==='1'},{headers:{'Cache-Control':'no-store'}});
 // The old names can exist in saved bookmarks, but never perform GET logout.
 if(url.pathname==='/signin-with-chatgpt')return Response.redirect(url.origin+'/auth/google/start?'+url.searchParams,303);
 if(url.pathname==='/signout-with-chatgpt')return Response.redirect(url.origin+'/?lobby=1',303);
 const transfer=await legacyLink(sanitized,env)||await profileSwitch(sanitized,env);if(transfer)return transfer;
 if(url.pathname==='/auth/google/start'){const gate=await safetyBefore(await authenticatedRequest(sanitized,env),env);if(gate.response)return gate.response;}
 const auth=await googleAuth(sanitized,env);if(auth)return auth;
 if((env as any).MIGRATION_LOCK!=='open')return migrationResponse(sanitized);
 // Cookie-authenticated writes must originate from this frontend.
 if(!['GET','HEAD','OPTIONS'].includes(sanitized.method)&&sanitized.headers.get('origin')!==url.origin)return Response.json({error:'이 페이지에서 다시 시도해 주세요.'},{status:403});
 const trusted=await measurePhase('session',()=>authenticatedRequest(sanitized,env));
 const safety=await measurePhase('safety',()=>safetyBefore(trusted,env));if(safety.response)return safety.response;
 const direct=await safetyEndpoint(trusted,env,safety);if(direct)return direct;
 let response;try{const baseResponse=await measurePhase('handler',()=>handler.fetch(trusted,env,ctx));response=await measurePhase('filter',()=>safetyAfter(trusted,env,baseResponse,safety))}catch{return Response.json({error:'안전 설정을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.'},{status:503})}
 const headers=new Headers(response.headers);
 headers.set('Cache-Control','private, no-store');headers.set('Referrer-Policy','strict-origin-when-cross-origin');headers.set('X-Content-Type-Options','nosniff');
 return new Response(response.body,{status:response.status,headers});
}
export default {async scheduled(_event:ScheduledController, env:Cloudflare.Env, ctx:ExecutionContext){ctx.waitUntil(cleanupExpiredTechnical(env.DB).then(counts=>{console.log(JSON.stringify({event:'technical_expiry_cleanup',counts}))}));}, async fetch(request:Request,env:Cloudflare.Env,ctx:ExecutionContext){
 if((env as any).QA_ONLY==='1' && (!(env as any).QA_ACCESS_TOKEN || request.headers.get('Authorization')!=='Bearer '+(env as any).QA_ACCESS_TOKEN))return new Response('Not found',{status:404});
 const scoped=new Proxy(env,{get(target,key){if(key==='DB')return measuredDatabase(target.DB);return Reflect.get(target,key)}});
 const response=await measureRequest(request,()=>serve(request,scoped,ctx));
 const headers=new Headers(response.headers);
 headers.set('X-Robots-Tag',searchPolicy(request.url,response.status));
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}};
