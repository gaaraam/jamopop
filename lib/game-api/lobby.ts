import { accountId, accountProgressions, isSiteAdmin } from '@/lib/account';
import { all, one } from '@/lib/store';
import { PRESENCE_OFFLINE } from '@/lib/sync-policy.mjs';
import { companions } from '@/lib/companions';
import { invitationInbox } from '@/lib/room-invitations';
import { GET as lobbyChatGet } from '@/app/api/lobby-chat/route';
import { GET as announcementGet } from '@/app/api/announcements/route';
import { check, reply } from '@/lib/game-api/http';
export async function lobbyResponse(req: Request, url: URL) {
  const now = Date.now(),
    admin = isSiteAdmin(req),
    archived = url.searchParams.get('archived') === '1';
  check(!archived || admin, '관리자만 보관된 방을 볼 수 있어요.', 403);
  const rooms = await all(
    `SELECT r.id,r.name,(r.password_hash IS NOT NULL) AS locked,r.round_no AS roundNo,h.name AS hostName,COALESCE(q.width,5) AS width,
 COUNT(m.id) AS memberCount,COALESCE(SUM(CASE WHEN m.last_seen>? THEN 1 ELSE 0 END),0) AS onlineCount,
 COALESCE(MAX(m.last_seen),r.created_at) AS lastActive
 FROM rooms r LEFT JOIN members h ON h.id=r.host_id LEFT JOIN rounds q ON q.id=r.current_round_id
 LEFT JOIN members m ON m.room_id=r.id AND m.blocked=0
 WHERE (r.archived_at IS NOT NULL)=?
 GROUP BY r.id ORDER BY onlineCount>0 DESC,lastActive DESC,r.id LIMIT 101`,
    now - PRESENCE_OFFLINE,
    archived ? 1 : 0,
  );
  const shown = rooms.slice(0, 100);
  const previews = shown.length
    ? await all(
        `SELECT m.room_id,m.id,m.name,m.avatar,m.skin_id AS skin,m.last_seen,m.spectator,
 CASE WHEN r.active_speed_id IS NOT NULL THEN 'speed' ELSE COALESCE(q.variant,'normal') END AS variant,
 CASE WHEN r.active_speed_id IS NOT NULL THEN sr.ends_at ELSE q.ends_at END AS endsAt,
 COALESCE(p.status,'waiting') AS status,COALESCE(json_array_length(p.guesses),0) AS attempts,
 (SELECT COUNT(*) FROM json_each(COALESCE(sp.state,'{"puzzles":[]}'),'$.puzzles') j WHERE json_extract(j.value,'$.status')='won') AS solved
 FROM members m JOIN rooms r ON r.id=m.room_id LEFT JOIN rounds q ON q.id=r.current_round_id
 LEFT JOIN speed_rounds sr ON sr.id=r.active_speed_id
 LEFT JOIN plays p ON p.member_id=m.id AND p.round_id=COALESCE(r.active_speed_id,r.current_round_id)
 LEFT JOIN speed_plays sp ON sp.member_id=m.id AND sp.round_id=r.active_speed_id
 WHERE m.blocked=0 AND m.room_id IN (${shown.map(() => '?').join(',')})
 ORDER BY m.last_seen>? DESC,m.rowid`,
        ...shown.map((r) => r.id),
        now - PRESENCE_OFFLINE,
      )
    : [];
  for (const r of shown) {
    const members = previews.filter((m) => m.room_id === r.id);
    r.preview = members.slice(0, 6).map((m) => ({
      id: m.id,
      name: m.name,
      avatar: m.avatar,
      skin: m.skin,
      online: m.last_seen > now - PRESENCE_OFFLINE,
      spectator: !!m.spectator,
      status: m.status === 'playing' && m.endsAt && m.endsAt <= now ? 'lost' : m.status,
      progress: m.variant === 'speed' ? m.solved : Math.min(5, m.attempts),
    }));
    r.variant = members[0]?.variant || 'normal';
    r.playing = members.filter(
      (m) => !m.spectator && m.status === 'playing' && (!m.endsAt || m.endsAt > now),
    ).length;
    r.won = members.filter((m) => !m.spectator && m.status === 'won').length;
  }
  const owner = accountId(req);
  const [chatResponse, notice, levels, people, invitations, profile] = await Promise.all([
    lobbyChatGet(req),
    announcementGet(req).then((r) => r.json() as Promise<{ announcement?: unknown }>),
    accountProgressions(owner ? [owner] : []),
    companions(req),
    invitationInbox(req),
    owner
      ? one('SELECT avatar,skin_id AS skin FROM profiles WHERE id=?', owner)
      : Promise.resolve(null),
  ]);
  const chat = await chatResponse.json();
  if (!chatResponse.ok) throw Error('chat unavailable');
  const response = reply({
    profile,
    rooms: rooms.slice(0, 100),
    hasMore: rooms.length > 100,
    serverNow: now,
    isAdmin: admin,
    chat,
    people,
    invitations,
    progression: owner ? levels.get(owner) || null : null,
    announcement: notice.announcement,
  });
  const guestCookie = chatResponse.headers.get('Set-Cookie');
  if (guestCookie) response.headers.set('Set-Cookie', guestCookie);
  return response;
}
