import { findMember, isSiteAdmin } from '@/lib/account';
import { AVATARS } from '@/lib/cosmetics';
import { check } from '@/lib/game-api/http';
import { all, database, one, run } from '@/lib/store';
import { randomWord } from '@/lib/words';
export const avatars = AVATARS;
export const uuid = () => crypto.randomUUID(),
  key = () => uuid().replaceAll('-', '').slice(0, 24);
export function cookie(req: Request) {
  return (
    req.headers
      .get('cookie')
      ?.split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith('bw_session='))
      ?.slice(11) || ''
  );
}
export async function hash(s: string) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}
export function date(n = Date.now()) {
  return new Date(n + 9 * 3600000).toISOString().slice(0, 10);
}
export function widthOf(value: any, fallback = 5) {
  const n = value === undefined ? fallback : Number(value);
  check([5, 6, 7].includes(n), '5·6·7칸 중에서 선택해 주세요.');
  return n;
}
export async function auth(req: Request, roomId: string) {
  check(typeof roomId === 'string' && /^[a-f0-9]{24}$/.test(roomId), '초대 링크를 확인해 주세요.');
  const m = await findMember(req, roomId);
  check(m, '이 방에 먼저 입장해 주세요.', 401);
  check(!m.blocked || isSiteAdmin(req), '이 방에서 내보내졌어요.', 403);
  return m;
}
// Modern normal rounds can authenticate and read the submission context in one
// indexed read. No context is cached across requests; the final write still CASes
// the live round, membership, spectator state and deadline inside SQLite.
export async function normalSubmissionContext(req: Request, body: any) {
  if (body.mode !== 'daily' || typeof body.room !== 'string' || !/^[a-f0-9]{24}$/.test(body.room))
    return null;
  const account = req.headers.get('oai-authenticated-user-id');
  const token = cookie(req);
  const guest = /^[a-f0-9]{64}$/.test(token) ? await hash(token) : null;
  if (!account && !guest) return null;
  const row = await one(
    `SELECT m.*,r.current_round_id,r.active_speed_id,
    q.id q_id,q.mode q_mode,q.answer q_answer,q.starts_at q_starts_at,q.ends_at q_ends_at,q.owner_id q_owner_id,q.width q_width,q.phase q_phase,q.variant q_variant,q.dictionary_version q_dictionary_version,q.restricted q_restricted,
    p.id p_id,p.guesses p_guesses,p.status p_status,p.updated_at p_updated_at,
    EXISTS(SELECT 1 FROM spectators s WHERE s.round_id=q.id AND s.member_id=m.id) watched
    FROM members m JOIN rooms r ON r.id=m.room_id LEFT JOIN rounds q ON q.id=r.current_round_id
    LEFT JOIN plays p ON p.round_id=q.id AND p.member_id=m.id
    WHERE r.id=? AND ((? IS NOT NULL AND m.account_id=?) OR (? IS NOT NULL AND m.account_id IS NULL AND m.token_hash=?))
    ORDER BY m.account_id IS NOT NULL DESC LIMIT 1`,
    body.room,
    account,
    account,
    guest,
    guest,
  );
  if (!row || !row.q_id || row.q_variant !== 'normal') return null;
  check(!row.blocked || isSiteAdmin(req), '이 방에서 내보내졌어요.', 403);
  check(!row.spectator && !row.watched, '관전 중에는 게임에 참여할 수 없어요.', 403);
  return {
    member: row,
    room: {
      id: body.room,
      current_round_id: row.current_round_id,
      active_speed_id: row.active_speed_id,
    },
    round: {
      id: row.q_id,
      mode: row.q_mode,
      answer: row.q_answer,
      starts_at: row.q_starts_at,
      ends_at: row.q_ends_at,
      owner_id: row.q_owner_id,
      width: row.q_width,
      phase: row.q_phase,
      variant: row.q_variant,
      dictionary_version: row.q_dictionary_version,
      restricted: row.q_restricted,
    },
    play: row.p_id
      ? { id: row.p_id, guesses: row.p_guesses, status: row.p_status, updated_at: row.p_updated_at }
      : null,
  };
}
export async function resolveRoom(req: Request, link: string) {
  check(typeof link === 'string' && /^[a-f0-9]{24}$/.test(link), '초대 링크를 확인해 주세요.');
  let r = await one(
    'SELECT * FROM rooms WHERE invite_code=? OR (id=? AND invite_code IS NULL)',
    link,
    link,
  );
  if (!r) {
    const existing = await one('SELECT * FROM rooms WHERE id=?', link);
    if (existing) {
      await auth(req, link);
      r = existing;
    }
  }
  check(r, '사용할 수 없는 초대 링크예요. 방장에게 새 링크를 받아 주세요.', 404);
  return r;
}
export async function choose(roomId: string, width: number, owner?: string) {
  const recent = await all(
    `SELECT answer FROM rounds WHERE room_id=? AND (mode<>'practice' OR owner_id=?) ORDER BY starts_at DESC,id DESC LIMIT 30`,
    roomId,
    owner || '',
  );
  return randomWord(
    undefined,
    width,
    recent.map((x) => x.answer),
  );
}
export async function getRound(room: any, m: any, mode: string) {
  if (mode === 'live') {
    check(room.live_id, '아직 대기실이 없어요.', 404);
    return one('SELECT * FROM rounds WHERE id=?', room.live_id);
  }
  if (mode === 'practice') {
    check(m.practice_id, '연습을 시작해 주세요.', 404);
    return one('SELECT * FROM rounds WHERE id=?', m.practice_id);
  }
  // Upgrade legacy rooms lazily without replacing their problem or submissions.
  if (!room.current_round_id) {
    const previous = await one(
      "SELECT * FROM rounds WHERE room_id=? AND mode='daily' ORDER BY starts_at DESC,id DESC LIMIT 1",
      room.id,
    );
    const id = previous?.id || uuid();
    if (!previous)
      await run(
        'INSERT INTO rounds(id,room_id,mode,answer,starts_at,dictionary_version) VALUES(?,?,?,?,?,1)',
        id,
        room.id,
        'daily',
        await choose(room.id, 5),
        Date.now(),
      );
    await database().batch([
      database()
        .prepare(
          'UPDATE rooms SET current_round_id=?,round_no=1 WHERE id=? AND current_round_id IS NULL',
        )
        .bind(id, room.id),
      database()
        .prepare(
          'UPDATE rounds SET ends_at=NULL WHERE id=(SELECT current_round_id FROM rooms WHERE id=?)',
        )
        .bind(room.id),
    ]);
    Object.assign(
      room,
      await one('SELECT current_round_id,round_no FROM rooms WHERE id=?', room.id),
    );
  }
  return one('SELECT * FROM rounds WHERE id=?', room.current_round_id);
}
export async function presenceNotice(m: any, now: number) {
  const condition = 'id=? AND blocked=0 AND (chat_seen=0 OR (last_seen<? AND chat_seen<?))';
  await database().batch([
    database()
      .prepare(
        `INSERT INTO chat_messages(room_id,member_id,channel,request_id,body,created_at,system) SELECT room_id,id,CASE WHEN spectator=1 OR EXISTS(SELECT 1 FROM spectators sp JOIN rooms rr ON rr.current_round_id=sp.round_id WHERE sp.member_id=members.id AND rr.id=members.room_id) THEN 'spectator' ELSE 'player' END,?, '접속했습니다',?,1 FROM members WHERE ${condition} ON CONFLICT(member_id,request_id) DO NOTHING`,
      )
      .bind('presence:' + m.id + ':' + m.last_seen, now, m.id, now - 90000, now - 120000),
    database()
      .prepare(`UPDATE members SET chat_seen=? WHERE ${condition}`)
      .bind(now, m.id, now - 90000, now - 120000),
    database().prepare('UPDATE members SET last_seen=? WHERE id=?').bind(now, m.id),
  ]);
}

export type StateReader = (req: Request, roomId: string, mode: string) => Promise<unknown>;
