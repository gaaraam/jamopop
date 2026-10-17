import { accountProgressions } from '@/lib/account';
import { one } from '@/lib/store';
import { memberOwner } from '@/lib/party';
import { check } from '@/lib/game-api/http';
// Caller authenticates room membership before looking up another player.
export async function publicProfile(roomId: string, targetId: string) {
  const target = await one(
    'SELECT * FROM members WHERE id=? AND room_id=? AND blocked=0',
    targetId,
    roomId,
  );
  check(target, '이 방의 참가자를 찾을 수 없어요.', 404);
  const identity = target.account_id ? 'm.account_id=?' : 'm.account_id IS NULL AND m.token_hash=?';
  const identityValue = target.account_id || target.token_hash;
  const aggregate = async (inRoom: boolean) =>
    await one(
      `SELECT COUNT(*) completed,COALESCE(SUM(p.status='won'),0) wins,AVG(CASE WHEN p.status='won' THEN json_array_length(p.guesses)*1.0/CASE WHEN r.mode='speed' THEN 5 ELSE 1 END END) average FROM plays p JOIN members m ON m.id=p.member_id JOIN rounds r ON r.id=p.round_id WHERE ${identity} AND r.mode<>'practice' AND p.status IN('won','lost','forfeited') ${inRoom ? 'AND r.room_id=?' : ''}`,
      ...(inRoom ? [identityValue, roomId] : [identityValue]),
    );
  const [overall, roomStats, levels, title] = await Promise.all([
    aggregate(false),
    aggregate(true),
    accountProgressions(target.account_id ? [target.account_id] : []),
    one('SELECT title FROM equipped_titles WHERE owner=?', memberOwner(target)),
  ]);
  return {
    name: target.name,
    avatar: target.avatar,
    skin: target.skin_id,
    linked: !!target.account_id,
    level: target.account_id ? levels.get(target.account_id)?.level || 1 : null,
    title: title?.title || '',
    overall,
    room: roomStats,
  };
}
