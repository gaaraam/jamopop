import {one} from '@/lib/store';
import {findMember,accountProgressions,progressionFromXp} from '@/lib/account';
import {NAME_COLORS,AVATAR_FRAMES,AVATARS,avatarLevel} from '@/lib/cosmetics';
import {roundXp} from '@/lib/rewards.mjs';
export async function GET(req:Request){
 const send=(x:unknown,status=200)=>Response.json(x,{status,headers:{'Cache-Control':'no-store'}});
 try{const url=new URL(req.url),room=url.searchParams.get('room')||'',round=url.searchParams.get('round')||'',m=await findMember(req,room);
 if(!m||m.blocked)return send({error:'방 참가 기록을 확인해 주세요.'},403);
 const p=await one(`SELECT p.id,p.status,p.guesses,r.mode FROM plays p JOIN rounds r ON r.id=p.round_id WHERE p.member_id=? AND r.id=? AND r.room_id=?`,m.id,round,room);
 if(!p||!['won','lost','forfeited'].includes(p.status))return send({error:'결과를 확인하는 중이에요.'},409);
 const attempts=JSON.parse(p.guesses).length,xp=roundXp(p.mode,p.status,attempts),after=m.account_id?(await accountProgressions([m.account_id])).get(m.account_id):null,before=after?progressionFromXp(after.xp-xp):null;
 const unlocked=before&&after?[
 ...NAME_COLORS.filter(x=>x.level>before.level&&x.level<=after.level).map(x=>({icon:'●',name:x.name+' 닉네임',color:x.hex})),
 ...AVATAR_FRAMES.filter(x=>x.level>before.level&&x.level<=after.level).map(x=>({icon:x.icon,name:x.name+' 장식'})),
 ...AVATARS.filter(x=>avatarLevel(x)>before.level&&avatarLevel(x)<=after.level).map(x=>({icon:x,name:'캐릭터'}))]:[];
 const reward=await one(`SELECT g.amount + CASE WHEN g.won=1 AND NOT EXISTS(SELECT 1 FROM gold_rewards earlier JOIN members em ON em.id=earlier.member_id WHERE earlier.won=1 AND earlier.day=g.day AND earlier.rowid<g.rowid AND (CASE WHEN ? IS NOT NULL THEN em.account_id=? ELSE em.id=? END)) THEN 30 ELSE 0 END amount FROM gold_rewards g WHERE g.play_id=?`,m.account_id,m.account_id,m.id,p.id);
 return send({gold:reward?.amount||0,skin:m.skin_id,status:p.status,avatar:m.avatar,name:m.name,xp,before,after,unlocked,linked:!!m.account_id,mode:p.mode,attempts});
 }catch{return send({error:'결과를 불러오지 못했어요.'},503)}
}
