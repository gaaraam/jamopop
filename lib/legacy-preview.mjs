export async function legacyPreview(db,id,guestHash=''){
 const where=id?'m.account_id=?':'m.account_id IS NULL AND m.token_hash=?',key=id||guestHash;
 const members=(await db.prepare(`SELECT m.name,m.avatar FROM members m WHERE ${where} ORDER BY m.last_seen DESC`).bind(key).all()).results;
 const profile=id?await db.prepare('SELECT name,avatar FROM profiles WHERE id=?').bind(id).first():null;
 const owner=id?'account:'+id:'guest:'+guestHash;
 const solo=await db.prepare('SELECT state FROM solo_progress WHERE owner=?').bind(owner).first();
 const stats=await db.prepare(`SELECT COALESCE(SUM(p.status='won'),0) wins,COALESCE(SUM(CASE WHEN r.mode='daily' AND p.status='won' AND json_array_length(p.guesses)>0 THEN 30 WHEN r.mode='daily' AND p.status='lost' AND json_array_length(p.guesses)=5 THEN 10 ELSE 0 END),0) xp FROM plays p JOIN members m ON m.id=p.member_id JOIN rounds r ON r.id=p.round_id WHERE ${where} AND r.mode<>'practice'`).bind(key).first();
 const xp=Number(stats?.xp||0)+Number(solo?JSON.parse(solo.state).xp||0:0);
 return {found:!!profile||members.length>0||!!solo,name:profile?.name||members[0]?.name||'내 기록',avatar:profile?.avatar||members[0]?.avatar||'🐱',rooms:members.length,wins:Number(stats?.wins||0),xp,level:Math.floor((1+Math.sqrt(1+xp/12.5))/2)};
}
