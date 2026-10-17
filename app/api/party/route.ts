import { findMember, isSiteAdmin } from '@/lib/account';
import { all, one, run } from '@/lib/store';
import {
  isSpectator,
  trackSpectator,
  memberOwner,
  validateStrokes,
  useItem,
  TITLE_NAMES,
} from '@/lib/party';
const reply = (d: unknown, status = 200) =>
  Response.json(d, { status, headers: { 'Cache-Control': 'private, no-store' } });
async function context(req: Request, roomId: any, roundId: any) {
  if (typeof roomId !== 'string' || typeof roundId !== 'string')
    throw Error('방과 문제를 확인해 주세요.');
  const m = await findMember(req, roomId);
  if (!m || m.blocked) throw Error('이 방에 먼저 입장해 주세요.');
  const room = await one('SELECT * FROM rooms WHERE id=?', roomId);
  if (!room || room.current_round_id !== roundId)
    throw Error('문제가 바뀌었어요. 다시 확인해 주세요.');
  const r = await one('SELECT * FROM rounds WHERE id=?', roundId);
  await trackSpectator(m, r.id);
  return { m, r, room };
}
async function readParty(req: Request, consented = false) {
  try {
    const u = new URL(req.url),
      { m, r } = await context(req, u.searchParams.get('room'), u.searchParams.get('roundId'));
    if (u.searchParams.has('watch')) {
      if (!(await isSpectator(m, r.id)))
        return reply({ error: '관전자만 제출 단어를 볼 수 있어요.' }, 403);
      const target = await one(
        'SELECT id,name,spectator FROM members WHERE id=? AND room_id=? AND blocked=0',
        u.searchParams.get('watch'),
        r.room_id,
      );
      if (!target || (await isSpectator(target, r.id)))
        return reply({ error: '참가자를 선택해 주세요.' }, 400);
      const p = await one(
        'SELECT guesses,status FROM plays WHERE round_id=? AND member_id=?',
        r.id,
        target.id,
      );
      return reply({
        name: target.name,
        guesses: JSON.parse(p?.guesses || '[]'),
        status: p?.status || 'waiting',
      });
    }
    const rows = await all(
      'SELECT h.member_id AS memberId,m.name,h.strokes,h.updated_at AS updatedAt FROM drawing_hints h JOIN members m ON m.id=h.member_id WHERE h.round_id=? AND m.blocked=0',
      r.id,
    ); // Record only a non-empty disclosure to a still-active competitor. Finished players and observers are exempt.
    if (rows.length && r.hint_policy && !(await isSpectator(m, r.id))) {
      const play = await one(
        'SELECT status FROM plays WHERE round_id=? AND member_id=?',
        r.id,
        m.id,
      );
      const end =
        (
          await one(
            'SELECT ends_at FROM item_loadouts WHERE round_id=? AND member_id=?',
            r.id,
            m.id,
          )
        )?.ends_at ?? r.ends_at;
      if (
        !consented &&
        (!play || play.status === 'playing') &&
        end > Date.now() &&
        !(await one('SELECT 1 FROM hint_views WHERE round_id=? AND member_id=?', r.id, m.id))
      )
        return reply({ error: '힌트 보기 버튼으로 순위 안내를 확인해 주세요.' }, 409);
      await run(
        `INSERT INTO hint_views(round_id,member_id,viewed_at) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM rooms WHERE id=? AND current_round_id=?) AND EXISTS(SELECT 1 FROM members WHERE id=? AND blocked=0 AND spectator=0) AND NOT EXISTS(SELECT 1 FROM spectators WHERE round_id=? AND member_id=?) AND NOT EXISTS(SELECT 1 FROM plays WHERE round_id=? AND member_id=? AND status<>'playing') AND COALESCE((SELECT ends_at FROM item_loadouts WHERE round_id=? AND member_id=?),?)>? ON CONFLICT DO NOTHING`,
        r.id,
        m.id,
        Date.now(),
        r.room_id,
        r.id,
        m.id,
        r.id,
        m.id,
        r.id,
        m.id,
        r.id,
        m.id,
        r.ends_at,
        Date.now(),
      );
    }
    return reply({ hints: rows.map((h) => ({ ...h, strokes: JSON.parse(h.strokes) })) });
  } catch (e) {
    return reply({ error: (e as Error).message }, 400);
  }
}
export async function GET(req: Request) {
  return readParty(req);
}
export async function POST(req: Request) {
  try {
    if (req.headers.get('origin') && req.headers.get('origin') !== new URL(req.url).origin)
      return reply({ error: '현재 페이지에서 다시 시도해 주세요.' }, 403);
    const raw = await req.text();
    if (raw.length > 150000)
      return reply({ error: '그림이 너무 복잡해요. 조금 줄여 주세요.' }, 400);
    const b = JSON.parse(raw),
      { m, r } = await context(req, b.room, b.roundId);
    if (b.action === 'view_hints')
      return readParty(
        new Request(
          new URL(
            `/api/party?room=${encodeURIComponent(r.room_id)}&roundId=${encodeURIComponent(r.id)}`,
            req.url,
          ),
          { headers: req.headers },
        ),
        true,
      );
    if (b.action === 'item') {
      await useItem(r, m, b);
      return reply({ ok: true });
    }
    if (b.action === 'title') {
      if (typeof b.title !== 'string' || (b.title && !TITLE_NAMES[b.title]))
        throw Error('칭호를 확인해 주세요.');
      if (
        b.title &&
        !(await one(
          'SELECT 1 FROM earned_titles WHERE owner=? AND title=?',
          memberOwner(m),
          b.title,
        ))
      )
        return reply({ error: '아직 획득하지 않은 칭호예요.' }, 403);
      await run(
        'INSERT INTO equipped_titles(owner,title) VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET title=excluded.title',
        memberOwner(m),
        b.title,
      );
      return reply({ ok: true });
    }
    if (b.action === 'spectate') {
      const result = await run(
        `UPDATE members SET spectator=1 WHERE id=? AND blocked=0 AND EXISTS(SELECT 1 FROM rooms WHERE id=? AND current_round_id=?) AND NOT EXISTS(SELECT 1 FROM plays WHERE round_id=? AND member_id=? AND guesses<>'[]')`,
        m.id,
        r.room_id,
        r.id,
        r.id,
        m.id,
      );
      if (!result.meta.changes) throw Error('이미 제출한 판에는 관전으로 전환할 수 없어요.');
      await trackSpectator({ ...m, spectator: 1 }, r.id);
      return reply({ ok: true });
    }
    if (b.action === 'participate') {
      await trackSpectator(m, r.id);
      await run('UPDATE members SET spectator=0 WHERE id=?', m.id);
      return reply({ ok: true });
    }
    if (b.action === 'draw') {
      if (!validateStrokes(b.strokes) || !b.strokes.length) throw Error('그림을 그려 주세요.');
      if (await isSpectator(m, r.id))
        return reply({ error: '성공한 참가자만 그림을 공유할 수 있어요.' }, 403);
      const result = await run(
        `INSERT INTO drawing_hints(round_id,member_id,strokes,updated_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM plays WHERE round_id=? AND member_id=? AND status='won') AND EXISTS(SELECT 1 FROM rooms WHERE id=? AND current_round_id=?) AND EXISTS(SELECT 1 FROM members WHERE id=? AND blocked=0 AND spectator=0) ON CONFLICT(round_id,member_id) DO UPDATE SET strokes=excluded.strokes,updated_at=excluded.updated_at`,
        r.id,
        m.id,
        JSON.stringify(b.strokes),
        Date.now(),
        r.id,
        m.id,
        r.room_id,
        r.id,
        m.id,
      );
      if (!result.meta.changes)
        return reply({ error: '정답을 맞힌 뒤에 그림을 공유할 수 있어요.' }, 403);
      return reply({ ok: true });
    }
    if (b.action === 'delete_hint') {
      if (b.memberId !== m.id && !isSiteAdmin(req))
        return reply({ error: '본인 그림만 내릴 수 있어요.' }, 403);
      await run('DELETE FROM drawing_hints WHERE round_id=? AND member_id=?', r.id, b.memberId);
      return reply({ ok: true });
    }
    return reply({ error: '요청을 확인해 주세요.' }, 400);
  } catch (e) {
    return reply(
      { error: e instanceof SyntaxError ? '요청을 확인해 주세요.' : (e as Error).message },
      400,
    );
  }
}
