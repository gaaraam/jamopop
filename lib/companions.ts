import { all, run } from '@/lib/store';
import { accountId, guestToken, tokenHash } from '@/lib/account';
export async function companions(req: Request) {
  const owner = accountId(req),
    token = guestToken(req),
    guest = !owner && /^[a-f0-9]{64}$/.test(token) ? await tokenHash(token) : '';
  if (!owner && !guest) return { signedIn: false, friends: [], recent: [] };
  const now = Date.now();
  if (owner)
    await run(
      'INSERT INTO account_presence(account_id,last_seen) VALUES(?,?) ON CONFLICT(account_id) DO UPDATE SET last_seen=excluded.last_seen WHERE account_presence.last_seen<?',
      owner,
      now,
      now - 30000,
    );
  const rows = await all(
    `SELECT m.id,m.account_id,m.name,m.avatar,m.skin_id AS skin,m.last_seen,MAX(m.last_seen,COALESCE(ap.last_seen,0)) onlineSeen,r.id roomId,r.name roomName
 FROM members mine JOIN members m ON m.room_id=mine.room_id AND m.id<>mine.id JOIN rooms r ON r.id=m.room_id LEFT JOIN account_presence ap ON ap.account_id=m.account_id
 WHERE ${owner ? 'mine.account_id=?' : 'mine.account_id IS NULL AND mine.token_hash=?'} AND mine.blocked=0 AND m.blocked=0 AND r.archived_at IS NULL
 AND (m.account_id IS NULL OR m.account_id<>?) ORDER BY m.last_seen DESC,m.id LIMIT 150`,
    owner || guest,
    owner || '',
  );
  const seen = new Set<string>();
  const recent = rows
    .filter((m) => {
      const key = m.account_id || m.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20)
    .map((m) => ({
      id: m.id,
      name: m.name,
      avatar: m.avatar,
      skin: m.skin,
      linked: !!m.account_id,
      online: m.onlineSeen > now - 45000,
      room: m.last_seen > now - 45000 ? { id: m.roomId, name: m.roomName } : null,
    }));
  const links = owner
    ? await all(
        `SELECT f.id,f.status,f.requester=? outgoing,COALESCE(p.name,m.name,'플레이어') name,COALESCE(p.avatar,m.avatar,'🐱') avatar,CASE WHEN p.id IS NOT NULL THEN p.skin_id ELSE m.skin_id END skin,m.id memberId,
 MAX(COALESCE(m.last_seen,0),COALESCE(ap.last_seen,0)) lastSeen,m.last_seen roomSeen,r.id roomId,r.name roomName
 FROM friendships f LEFT JOIN profiles p ON p.id=CASE WHEN f.requester=? THEN f.recipient ELSE f.requester END
 LEFT JOIN account_presence ap ON ap.account_id=CASE WHEN f.requester=? THEN f.recipient ELSE f.requester END
 LEFT JOIN members m ON m.id=(SELECT x.id FROM members x JOIN rooms xr ON xr.id=x.room_id WHERE x.account_id=CASE WHEN f.requester=? THEN f.recipient ELSE f.requester END AND x.blocked=0 AND xr.archived_at IS NULL ORDER BY x.last_seen DESC,x.id LIMIT 1)
 LEFT JOIN rooms r ON r.id=m.room_id WHERE (f.requester=? OR f.recipient=?) AND f.status<>'declined' ORDER BY f.status DESC,f.updated_at DESC LIMIT 100`,
        owner,
        owner,
        owner,
        owner,
        owner,
        owner,
      )
    : [];
  return {
    signedIn: !!owner,
    recent,
    friends: links.map((x) => ({
      id: x.id,
      status: x.status,
      outgoing: !!x.outgoing,
      name: x.name,
      avatar: x.avatar,
      skin: x.skin,
      memberId: x.memberId,
      online: x.status === 'accepted' && x.lastSeen > now - 45000,
      room:
        x.status === 'accepted' && x.roomSeen > now - 45000 && x.roomId
          ? { id: x.roomId, name: x.roomName }
          : null,
    })),
  };
}
