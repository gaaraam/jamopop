import { accountId } from '@/lib/account';
import { all } from '@/lib/store';
export async function invitationInbox(req: Request) {
  const owner = accountId(req);
  if (!owner) return { signedIn: false, items: [] };
  const items = await all(
    `SELECT i.id,i.expires_at expiresAt,m.name,m.avatar,m.skin_id AS skin,r.name roomName FROM room_invitations i
 JOIN rooms r ON r.id=i.room_id AND r.archived_at IS NULL
 JOIN members m ON m.room_id=i.room_id AND m.account_id=i.sender AND m.blocked=0
 WHERE i.recipient=? AND i.status='pending' AND i.expires_at>?
 AND EXISTS(SELECT 1 FROM friendships f WHERE f.status='accepted' AND ((f.requester=i.sender AND f.recipient=i.recipient) OR (f.requester=i.recipient AND f.recipient=i.sender)))
 AND NOT EXISTS(SELECT 1 FROM members x WHERE x.room_id=i.room_id AND x.account_id=i.recipient AND x.blocked=1)
 ORDER BY i.created_at DESC LIMIT 30`,
    owner,
    Date.now(),
  );
  return { signedIn: true, items };
}
