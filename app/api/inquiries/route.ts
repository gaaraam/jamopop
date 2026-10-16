import {accountId,isSiteAdmin} from '@/lib/account';
import {inquiryOwner,createInquiry} from '@/lib/inquiries';
import {one,all,run} from '@/lib/store';
const reply=(d:unknown,status=200,cookie='')=>Response.json(d,{status,headers:{'Cache-Control':'private, no-store',...(cookie?{'Set-Cookie':cookie}:{})}});
const fields='id,name,category,title,body,status,answer,created_at AS createdAt,updated_at AS updatedAt,revision';
export async function GET(req:Request){try{
 const u=new URL(req.url),admin=u.searchParams.get('admin')==='1';if(admin&&!isSiteAdmin(req))return reply({error:'관리자만 확인할 수 있어요.'},403);
 const owner=await inquiryOwner(req);if(!owner&&!admin){const token=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');return reply({rows:[],signedIn:false,nextOffset:null},200,`bw_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${u.protocol==='https:'?'; Secure':''}`)}
 const offset=Number(u.searchParams.get('offset')||0),status=u.searchParams.get('status')||'';if(!Number.isSafeInteger(offset)||offset<0||offset>100000||!['','new','reviewing','answered','closed'].includes(status))return reply({error:'조회 조건을 확인해 주세요.'},400);
 const rows=await all(`SELECT ${fields} FROM inquiries WHERE (?=1 OR owner=?) AND (?='' OR status=?) ORDER BY updated_at DESC,id LIMIT 21 OFFSET ?`,admin?1:0,owner||'',status,status,offset);
 return reply({rows:rows.slice(0,20),nextOffset:rows.length>20?offset+20:null,signedIn:!!accountId(req)});
 }catch{return reply({error:'문의를 불러오지 못했어요.'},503)}}
export async function POST(req:Request){try{
 if(req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)return reply({error:'현재 페이지에서 다시 시도해 주세요.'},403);
 const raw=await req.text();if(raw.length>12000)return reply({error:'내용이 너무 길어요.'},400);let b:any;try{b=JSON.parse(raw)}catch{return reply({error:'요청을 확인해 주세요.'},400)}if(!b||typeof b!=='object')return reply({error:'요청을 확인해 주세요.'},400);
 if(b.action==='respond'){
 if(!isSiteAdmin(req))return reply({error:'관리자만 답변할 수 있어요.'},403);
 if(typeof b.id!=='string'||!Number.isSafeInteger(b.revision)||!['new','reviewing','answered','closed'].includes(b.status)||typeof b.answer!=='string'||b.answer.length>4000||(b.status==='answered'&&!b.answer.trim()))return reply({error:'처리 상태와 답변을 확인해 주세요.'},400);
 const saved=await run('UPDATE inquiries SET status=?,answer=?,updated_at=?,revision=revision+1 WHERE id=? AND revision=?',b.status,b.answer.trim(),Date.now(),b.id,b.revision);
 if(!saved.meta.changes)return reply({error:'다른 창에서 변경됐어요. 목록을 새로고침해 주세요.'},409);return reply({ok:true});
 }
 if(b.action!=='create')return reply({error:'요청을 확인해 주세요.'},400);const owner=await inquiryOwner(req);if(!owner)return reply({error:'페이지를 새로고침한 뒤 다시 시도해 주세요.'},401);
 if(['requestId','name','category','title','body'].some(k=>typeof b[k]!=='string'))return reply({error:'입력 내용을 확인해 주세요.'},400);
 try{return reply({id:await createInquiry(owner,b)})}catch(e){return reply({error:(e as Error).message},400)}
 }catch{return reply({error:'저장하지 못했어요. 입력을 유지하고 다시 시도해 주세요.'},503)}}
