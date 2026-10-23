import { guestSoloStatus, linkGuestSolo } from '@/lib/guest-solo';
import { canEquip, equippedAtLevel } from '@/lib/cosmetics';
import { all, one, run, database } from '@/lib/store';
import {
  accountId,
  guestToken,
  tokenHash,
  AVATARS,
  accountProgressions,
  avatarAccess,
  isSiteAdmin,
  canUseCommunity,
} from '@/lib/account';
const reply = (data: any, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
async function guestHash(req: Request) {
  const token = guestToken(req);
  return /^[a-f0-9]{64}$/.test(token) ? tokenHash(token) : null;
}
export async function GET(req: Request) {
  try {
    const id = accountId(req),
      guest = await guestHash(req);
    if (!id) return reply({ signedIn: false, avatarAccess: await avatarAccess(req, 1) });
    await run(
      `UPDATE plays SET status='lost',finished_at=COALESCE((SELECT ends_at FROM item_loadouts WHERE round_id=plays.round_id AND member_id=plays.member_id),(SELECT ends_at FROM rounds WHERE id=plays.round_id)),updated_at=? WHERE status='playing' AND guesses<>'[]' AND member_id IN(SELECT id FROM members WHERE account_id=?) AND EXISTS(SELECT 1 FROM rounds r WHERE r.id=plays.round_id AND r.mode IN('daily','speed') AND r.phase='running' AND COALESCE((SELECT ends_at FROM item_loadouts WHERE round_id=r.id AND member_id=plays.member_id),r.ends_at)<=?)`,
      Date.now(),
      id,
      Date.now(),
    );
    const progressionPromise = accountProgressions([id]);
    const equippedPromise = one(
      'SELECT name_color,avatar_frame FROM account_cosmetics WHERE account_id=?',
      id,
    );
    const profilePromise = one('SELECT name,avatar,skin_id AS skin FROM profiles WHERE id=?', id);
    const guestSoloPromise = guestSoloStatus(guest, id);
    const pendingPromise = guest
      ? one(`SELECT COUNT(*) n FROM members WHERE token_hash=? AND account_id IS NULL`, guest)
      : { n: 0 };
    const conflictsPromise = guest
      ? one(
          `SELECT COUNT(*) n FROM members g WHERE g.token_hash=? AND g.account_id IS NULL AND EXISTS(SELECT 1 FROM members a WHERE a.room_id=g.room_id AND a.account_id=?)`,
          guest,
          id,
        )
      : { n: 0 };
    const statsPromise = one(
      `SELECT COUNT(*) completed,COALESCE(SUM(p.status='won'),0) wins,AVG(CASE WHEN p.status='won' THEN json_array_length(p.guesses)*1.0/CASE WHEN r.mode='speed' THEN 5 ELSE 1 END END) average FROM plays p JOIN members m ON m.id=p.member_id JOIN rounds r ON r.id=p.round_id WHERE m.account_id=? AND r.mode<>'practice' AND p.status IN('won','lost','forfeited')`,
      id,
    );
    const roomsPromise = all(
      `SELECT r.id,r.name,m.name AS nickname,m.avatar,m.skin_id AS skin,m.blocked,m.last_seen AS lastSeen FROM members m JOIN rooms r ON r.id=m.room_id WHERE m.account_id=? ORDER BY m.last_seen DESC,r.id LIMIT 100`,
      id,
    );
    const rawOffset = Number(new URL(req.url).searchParams.get('offset') || 0),
      offset = Number.isSafeInteger(rawOffset) && rawOffset >= 0 ? Math.min(rawOffset, 100000) : 0;
    const rowsPromise = all(
      `SELECT p.id,r.room_id AS roomId,rm.name AS roomName,r.mode,r.width,p.status,p.guesses,p.updated_at AS updatedAt,r.phase,CASE WHEN p.status IN('won','lost','forfeited') OR r.retired_at IS NOT NULL THEN r.answer ELSE NULL END AS answer FROM plays p JOIN members m ON m.id=p.member_id JOIN rounds r ON r.id=p.round_id JOIN rooms rm ON rm.id=r.room_id WHERE m.account_id=? AND p.guesses<>'[]' ORDER BY p.updated_at DESC,p.id LIMIT 21 OFFSET ?`,
      id,
      offset,
    );
    const [levels, equipped, profile, guestSolo, pending, conflicts, stats, rooms, rows] =
      await Promise.all([
        progressionPromise,
        equippedPromise,
        profilePromise,
        guestSoloPromise,
        pendingPromise,
        conflictsPromise,
        statsPromise,
        roomsPromise,
        rowsPromise,
      ]);
    const progression = levels.get(id);
    const cosmetics = equippedAtLevel(
      equipped?.name_color,
      equipped?.avatar_frame,
      progression?.level || 1,
    );
    return reply({
      signedIn: true,
      accountKey: id,
      isAdmin: isSiteAdmin(req),
      email: req.headers.get('oai-authenticated-user-email') || '',
      profile,
      progression,
      cosmetics,
      avatarAccess: await avatarAccess(req, progression?.level || 1),
      guestSolo,
      pending: pending.n,
      conflicts: conflicts.n,
      stats,
      rooms: canUseCommunity(req) ? rooms : [],
      records: (canUseCommunity(req) ? rows : []).slice(0, 20).map((r) => ({
        ...r,
        guesses: JSON.parse(r.guesses),
        status: r.status === 'playing' && r.phase === 'interrupted' ? 'interrupted' : r.status,
      })),
      nextOffset: canUseCommunity(req) && rows.length > 20 ? offset + 20 : null,
    });
  } catch (e) {
    console.error('account read failed');
    return reply({ error: '내 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' }, 503);
  }
}
export async function POST(req: Request) {
  try {
    const origin = req.headers.get('origin');
    if (origin && origin !== new URL(req.url).origin)
      return reply({ error: '이 페이지에서 다시 시도해 주세요.' }, 403);
    const id = accountId(req);
    if (!id) return reply({ error: 'Google 로그인이 필요해요.' }, 401);
    if (Number(req.headers.get('content-length') || 0) > 4096)
      return reply({ error: '요청이 너무 길어요.' }, 400);
    const b: any = await req.json();
    if (!['link', 'profile', 'cosmetics'].includes(b?.action))
      return reply({ error: '요청을 확인해 주세요.' }, 400);
    if (b.action === 'cosmetics') {
      const level = (await accountProgressions([id])).get(id)?.level || 1;
      if (!canEquip(b.nameColor, b.avatarFrame, level))
        return reply({ error: '아직 해금되지 않았거나 사용할 수 없는 보상이에요.' }, 403);
      if (b.avatar !== undefined && !(await avatarAccess(req)).includes(b.avatar))
        return reply({ error: '아직 해금되지 않은 캐릭터예요.' }, 403);
      const db = database();
      await db.batch([
        db
          .prepare(
            'INSERT INTO account_cosmetics(account_id,name_color,avatar_frame) VALUES(?,?,?) ON CONFLICT(account_id) DO UPDATE SET name_color=excluded.name_color,avatar_frame=excluded.avatar_frame',
          )
          .bind(id, b.nameColor, b.avatarFrame),
        ...(b.avatar !== undefined
          ? [
              db
                .prepare(
                  'UPDATE profiles SET skin_id=CASE WHEN avatar=? THEN skin_id ELSE NULL END,avatar=? WHERE id=?',
                )
                .bind(b.avatar, b.avatar, id),
              db.prepare('UPDATE members SET avatar=? WHERE account_id=?').bind(b.avatar, id),
            ]
          : []),
      ]);
      return GET(req);
    }
    const name = typeof b.name === 'string' ? b.name.trim() : '',
      avatar = b.avatar;
    if (!name || name.length > 16 || !AVATARS.includes(avatar))
      return reply({ error: '닉네임(1~16자)과 캐릭터를 선택해 주세요.' }, 400);
    if (!(await avatarAccess(req)).includes(avatar))
      return reply({ error: '아직 해금되지 않은 캐릭터예요. 필요한 레벨을 확인해 주세요.' }, 403);
    if (b.action === 'profile') {
      const db = database();
      await db.batch([
        db
          .prepare(
            `INSERT INTO profiles(id,name,avatar,created_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,skin_id=CASE WHEN profiles.avatar=excluded.avatar THEN profiles.skin_id ELSE NULL END,avatar=excluded.avatar`,
          )
          .bind(id, name, avatar, Date.now()),
        db.prepare('UPDATE members SET avatar=? WHERE account_id=?').bind(avatar, id),
      ]);
    } else {
      const guest = await guestHash(req);
      await linkGuestSolo(guest, id);
      // D1 batch is transactional. Uniqueness and the owner-null guard prevent concurrent claims.
      await database().batch([
        database()
          .prepare(
            `INSERT INTO profiles(id,name,avatar,created_at) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING`,
          )
          .bind(id, name, avatar, Date.now()),
        database()
          .prepare(
            `INSERT INTO earned_titles(owner,title,earned_at) SELECT ?,title,earned_at FROM earned_titles WHERE owner=? AND EXISTS(SELECT 1 FROM members WHERE token_hash=? AND account_id IS NULL) ON CONFLICT(owner,title) DO NOTHING`,
          )
          .bind('account:' + id, 'guest:' + (guest || ''), guest || ''),
        database()
          .prepare(
            `UPDATE OR IGNORE members SET account_id=? WHERE token_hash=? AND account_id IS NULL AND NOT EXISTS(SELECT 1 FROM members a WHERE a.room_id=members.room_id AND a.account_id=?)`,
          )
          .bind(id, guest || '', id),
      ]);
    }
    return GET(req);
  } catch (e) {
    console.error('account update failed');
    return reply({ error: '저장하지 못했어요. 다시 시도해 주세요.' }, 503);
  }
}
