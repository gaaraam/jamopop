import {accountId} from '@/lib/account';
import {all,one,run} from '@/lib/store';
import {DEFAULT_HOME,FURNITURE,validLayout} from '@/lib/furniture';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
async function state(id:string){
 const [home,items,profile]=await Promise.all([one('SELECT layout,revision FROM kongal_homes WHERE account_id=?',id),all('SELECT skin_id FROM skin_purchases WHERE account_id=?',id),one('SELECT name,avatar,skin_id AS skin FROM profiles WHERE id=?',id)]);
 return {layout:home?JSON.parse(home.layout):DEFAULT_HOME,revision:home?.revision||0,owned:[...FURNITURE.filter(f=>f.price===0).map(f=>f.id),...items.map(i=>i.skin_id).filter(s=>FURNITURE.some(f=>f.id===s))],profile};
}
export async function GET(req:Request){try{const id=accountId(req);if(!id)return reply({error:'로그인하면 내 집을 꾸밀 수 있어요.'},401);return reply(await state(id))}catch{return reply({error:'집을 불러오지 못했어요.'},503)}}
export async function POST(req:Request){try{
 const id=accountId(req);if(!id)return reply({error:'로그인이 필요해요.'},401);
 if(req.headers.get('origin')!==new URL(req.url).origin)return reply({error:'현재 페이지에서 다시 시도해 주세요.'},403);
 const body=await req.json() as {revision:number;layout:unknown};const current=await state(id);
 if(!Number.isSafeInteger(body.revision)||body.revision<0||!validLayout(body.layout,current.owned))return reply({error:'보유한 가구와 배치 위치를 확인해 주세요.'},400);
 const result=await run(`INSERT INTO kongal_homes(account_id,layout,revision,updated_at) SELECT ?,?,1,? WHERE ?=0 ON CONFLICT(account_id) DO NOTHING`,id,JSON.stringify(body.layout),Date.now(),body.revision);
 let changed=result.meta.changes;
 if(body.revision>0){const update=await run('UPDATE kongal_homes SET layout=?,revision=revision+1,updated_at=? WHERE account_id=? AND revision=?',JSON.stringify(body.layout),Date.now(),id,body.revision);changed=update.meta.changes}
 if(!changed)return reply({error:'다른 창에서 집이 바뀌었어요. 새로 불러온 뒤 배치해 주세요.'},409);
 return reply(await state(id));
 }catch{return reply({error:'저장하지 못했어요. 배치는 화면에 남아 있어요.'},503)}}
