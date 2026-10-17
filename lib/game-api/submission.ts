import { score, splitWord, type Guess } from '@/lib/game';
import { check, reply } from '@/lib/game-api/http';
import { getRound, uuid, type StateReader } from '@/lib/game-api/runtime';
import { acceptsGuess } from '@/lib/guess-dictionary';
import { ensureLoadout } from '@/lib/party';
import { one, run } from '@/lib/store';
export async function submitGuess(
  req: Request,
  b: any,
  m: any,
  room: any,
  now: number,
  readState: StateReader,
  context?: { round: any; play: any },
) {
  check(b.action === 'guess', '요청을 확인해 주세요.');
  check(['daily', 'live', 'practice'].includes(b.mode), '게임 모드를 확인해 주세요.');
  check(b.mode !== 'daily' || !room.active_speed_id, '스피드전으로 전환됐어요.', 409);
  const r = context?.round || (await getRound(room, m, b.mode));
  check(r && r.id === b.roundId, '문제가 바뀌었어요. 다시 확인해 주세요.', 409);
  check(r.phase === 'running', '대전이 시작된 뒤 제출해 주세요.', 409);
  check(now >= r.starts_at, '카운트다운이 끝나면 제출할 수 있어요.');
  const loadout = context ? null : await ensureLoadout(r, m);
  const effectiveEnd = loadout?.ends_at ?? r.ends_at;
  check(!effectiveEnd || now < effectiveEnd, '이번 게임이 끝났어요.', 409);
  check(!r.owner_id || r.owner_id === m.id, '본인의 연습 문제만 풀 수 있어요.', 403);
  if (r.restricted)
    check(
      await one(
        'SELECT member_id FROM live_participants WHERE round_id=? AND member_id=?',
        r.id,
        m.id,
      ),
      '관전 중에는 제출할 수 없어요.',
      403,
    );
  const letters = typeof b.word === 'string' ? splitWord(b.word) : [];
  check(
    letters.length === r.width &&
      letters.every((c) => 'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎㅏㅑㅓㅕㅗㅛㅜㅠㅡㅣ'.includes(c)),
    `자음·모음 ${r.width}칸을 채워 주세요.`,
  );
  check(
    acceptsGuess(letters, r.dictionary_version),
    '등록된 단어가 아니에요. 다른 단어로 시도해 주세요.',
  );
  const p = (context
    ? context.play
    : await one('SELECT * FROM plays WHERE round_id=? AND member_id=?', r.id, m.id)) || {
    id: uuid(),
    guesses: '[]',
    status: 'playing',
    updated_at: 0,
  };
  check(p.status === 'playing', '이미 마친 문제예요.', 409);
  const guesses: Guess[] = JSON.parse(p.guesses);
  check(b.expected === guesses.length, '다른 창에서 기록이 바뀌었어요. 다시 확인해 주세요.', 409);
  check(guesses.length < 5, '다섯 번의 기회를 모두 사용했어요.');
  check(!guesses.some((g) => g.letters.join('') === letters.join('')), '이미 제출한 단어예요.');
  check(now - p.updated_at >= 500, '잠깐만 기다렸다 다시 제출해 주세요.', 429);
  const colors = score(letters, splitWord(r.answer));
  guesses.push({ letters, colors });
  const status = colors.every((c) => c === 'green')
    ? 'won'
    : guesses.length === 5
      ? 'lost'
      : 'playing';
  const updated = await run(
    `INSERT INTO plays(id,round_id,member_id,guesses,status,finished_at,updated_at)
     SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM members WHERE id=? AND blocked=0 AND spectator=0)
     AND (?<>? OR EXISTS(SELECT 1 FROM rooms WHERE id=? AND current_round_id=? AND active_speed_id IS NULL))
     AND EXISTS(SELECT 1 FROM rounds r WHERE r.id=? AND (COALESCE((SELECT ends_at FROM item_loadouts WHERE round_id=r.id AND member_id=?),r.ends_at) IS NULL OR COALESCE((SELECT ends_at FROM item_loadouts WHERE round_id=r.id AND member_id=?),r.ends_at)>MAX(?,CAST((julianday('now')-2440587.5)*86400000 AS INTEGER))))
     AND NOT EXISTS(SELECT 1 FROM spectators WHERE round_id=? AND member_id=?)
     AND (?=0 OR EXISTS(SELECT 1 FROM plays WHERE round_id=? AND member_id=?))
     ON CONFLICT(round_id,member_id) DO UPDATE SET guesses=excluded.guesses,status=excluded.status,finished_at=excluded.finished_at,updated_at=excluded.updated_at
     WHERE plays.guesses=? AND plays.status='playing'`,
    p.id,
    r.id,
    m.id,
    JSON.stringify(guesses),
    status,
    status === 'playing' ? null : now,
    now,
    m.id,
    b.mode,
    'daily',
    room.id,
    r.id,
    r.id,
    m.id,
    m.id,
    Date.now(),
    r.id,
    m.id,
    b.expected,
    r.id,
    m.id,
    p.guesses,
  );
  check(updated.meta.changes, '기록 또는 참가 상태가 바뀌었어요. 다시 확인해 주세요.', 409);
  if (b.fast === true)
    return reply({
      submitted: true,
      roomId: room.id,
      roundId: r.id,
      memberId: m.id,
      serverNow: Date.now(),
      finishedAt: status === 'playing' ? null : now,
      play: { guesses, status, ...(status !== 'playing' ? { answer: r.answer } : {}) },
    });
  return reply(await readState(req, room.id, b.mode));
}
