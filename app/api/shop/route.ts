import {accountId,avatarAccess} from '@/lib/account';
import {database,one} from '@/lib/store';
import {ALL_SKINS} from '@/lib/skins';
import {BALANCE_SQL,shopState} from '@/lib/shop';
const send=(x:unknown,status=200)=>Response.json(x,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(req:Request){
 try{const id=accountId(req);if(!id)return send({error:'로그인 후 상점을 이용할 수 있어요.'},401);
 return send({...await shopState(id),allowed:await avatarAccess(req),skins:ALL_SKINS});
 }catch{return send({error:'상점을 불러오지 못했어요.'},503)}
}
export async function POST(req:Request){
 try{
 const id=accountId(req);if(!id)return send({error:'로그인이 필요해요.'},401);
 if(req.headers.get('origin')!==new URL(req.url).origin)return send({error:'현재 페이지에서 다시 시도해 주세요.'},403);
 const b=await req.json() as {action:string;skin?:string};
 if(!['buy','equip','unequip'].includes(b.action))return send({error:'요청을 확인해 주세요.'},400);
 const db=database();
 if(!await one('SELECT 1 FROM profiles WHERE id=?',id))return send({error:'마이페이지에서 프로필을 먼저 저장해 주세요.'},409);
 if(b.action==='unequip'){
 await db.batch([db.prepare('UPDATE profiles SET skin_id=NULL WHERE id=?').bind(id),db.prepare('UPDATE members SET skin_id=NULL WHERE account_id=?').bind(id)]);
 return GET(req);
 }
 const skin=ALL_SKINS.find(x=>x.id===b.skin);
 if(!skin)return send({error:'없는 스킨이에요.'},400);
 const earned=skin.reward&&(await shopState(id)).owned.includes(skin.id);
 if(skin.reward&&!earned)return send({error:'개인 도전에서 보상 조건을 달성해 주세요.'},403);
 if(skin.reward&&b.action==='buy')return send({error:'개인 도전 보상은 구매할 수 없어요.'},400);
 if(!earned&&!(await avatarAccess(req)).includes(skin.avatar))return send({error:'캐릭터를 먼저 해금해 주세요.'},403);
 if(b.action==='buy'){
 await db.prepare(`INSERT INTO skin_purchases(account_id,skin_id,price,purchased_at) SELECT ?,?,?,? WHERE (${BALANCE_SQL})>=? ON CONFLICT(account_id,skin_id) DO NOTHING`).bind(id,skin.id,skin.price,Date.now(),id,id,skin.price).run();
 if(!await one('SELECT 1 FROM skin_purchases WHERE account_id=? AND skin_id=?',id,skin.id))return send({error:'골드가 부족해요.'},409);
 }else{
 if(!(await shopState(id)).owned.includes(skin.id))return send({error:'먼저 획득해 주세요.'},403);
 await db.batch([
 db.prepare('UPDATE profiles SET avatar=?,skin_id=? WHERE id=?').bind(skin.avatar,skin.id,id),
 db.prepare('UPDATE members SET avatar=?,skin_id=? WHERE account_id=?').bind(skin.avatar,skin.id,id)
 ]);
 }
 return GET(req);
 }catch{return send({error:'처리하지 못했어요. 다시 시도해 주세요.'},503)}
}
