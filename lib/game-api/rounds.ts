import { isSiteAdmin } from '@/lib/account';
import { settleSpeed, speedPlayingSQL } from '@/lib/competition';
import { check, reply, UserError } from '@/lib/game-api/http';
import { choose, getRound, uuid, widthOf, type StateReader } from '@/lib/game-api/runtime';
import { expirePlays } from '@/lib/party';
import { ROOM_ROUND_MS } from '@/lib/round-timer';
import { database, one, run } from '@/lib/store';
export async function nextRound(
  req: Request,
  b: any,
  m: any,
  room: any,
  now: number,
  readState: StateReader,
) {
  check(b.action === 'reset' || b.action === 'force_reset', '요청을 확인해 주세요.');
  const force = b.action === 'force_reset';
  await settleSpeed(room.id, now);
  check(
    !(await one(
      `SELECT 1 FROM rooms WHERE id=? AND EXISTS(${speedPlayingSQL})`,
      room.id,
      now,
      now,
    )),
    '스피드전이 진행 중이에요. 묶음 종료 후 모드를 바꿔 주세요.',
    409,
  );
  check(room.host_id === m.id || isSiteAdmin(req), '방장만 새 문제를 시작할 수 있어요.', 403);
  const current = await getRound(room, m, 'daily');
  check(current.id === b.roundId, '이미 새 문제로 넘어갔어요.', 409);
  const id = uuid(),
    width = widthOf(b.width, current.width);
  const answer = await choose(room.id, width);
  if (current.ends_at) await expirePlays(current, now);
  const variant = b.variant ?? current.variant ?? 'normal';
  check(['normal', 'items'].includes(variant), '대전 방식을 확인해 주세요.');
  const result = await database().batch([
    database()
      .prepare(
        'INSERT INTO rounds(id,room_id,mode,answer,starts_at,ends_at,width,dictionary_version,variant,hint_policy) VALUES(?,?,?,?,?,?,?,1,?,1)',
      )
      .bind(id, room.id, 'daily', answer, now, now + ROOM_ROUND_MS, width, variant),
    database()
      .prepare(
        `UPDATE rooms SET current_round_id=?,active_speed_id=NULL,round_no=round_no+1 WHERE id=? AND host_id=? AND current_round_id=? AND NOT EXISTS(${speedPlayingSQL}) AND (?=1 OR NOT EXISTS(SELECT 1 FROM plays p JOIN members m ON m.id=p.member_id WHERE p.round_id=? AND p.status='playing' AND p.guesses<>'[]' AND m.blocked=0))`,
      )
      .bind(id, room.id, room.host_id, current.id, now, now, force ? 1 : 0, current.id),
    database()
      .prepare(
        "UPDATE rounds SET retired_at=?,phase=CASE WHEN ?=1 THEN 'interrupted' ELSE phase END WHERE id=? AND EXISTS(SELECT 1 FROM rooms WHERE id=? AND current_round_id=?)",
      )
      .bind(now, force ? 1 : 0, current.id, room.id, id),
  ]);
  if (!result[1].meta.changes) {
    await run('DELETE FROM rounds WHERE id=?', id);
    throw new UserError('풀이 중인 사람이 있거나 문제가 바뀌었어요.', 409);
  }
  return reply(await readState(req, room.id, 'daily'));
}
