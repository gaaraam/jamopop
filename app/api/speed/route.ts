import { normalPlayingSQL, speedPlayingSQL, settleSpeed } from '@/lib/competition';
import { findMember, isSiteAdmin, accountProgressions } from '@/lib/account';
import { equippedAtLevel } from '@/lib/cosmetics';
import { all, one, run } from '@/lib/store';
import { splitWord } from '@/lib/game';
import { acceptsGuess } from '@/lib/guess-dictionary';
import {
  SPEED_THEMES,
  emptySpeed,
  chooseSpeed,
  guessSpeed,
  advanceSpeed,
  speedRank,
  type SpeedState,
} from '@/lib/speed';
import { GET as gameGet } from '@/app/api/game/route';
const reply = (d: unknown, status = 200) =>
  Response.json(d, { status, headers: { 'Cache-Control': 'private, no-store' } });
class Failure extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const check = (ok: unknown, msg: string, status = 400) => {
  if (!ok) throw new Failure(msg, status);
};
async function context(req: Request, room: string) {
  check(/^[a-f0-9]{24}$/.test(room), '방을 확인해 주세요.');
  const m = await findMember(req, room);
  check(m && !m.blocked, '이 방에 먼저 입장해 주세요.', 403);
  const r = await one('SELECT * FROM rooms WHERE id=?', room);
  check(r && !r.archived_at, '열린 방을 선택해 주세요.', 404);
  return { m, room: r, host: r.host_id === m.id || isSiteAdmin(req) };
}
async function view(req: Request, ctx: any) {
  const now = Date.now(),
    { m, room, host } = ctx;
  if (now - m.last_seen >= 15000)
    await run(
      'UPDATE members SET last_seen=?,last_active=? WHERE id=? AND last_seen<=?',
      now,
      now,
      m.id,
      now - 15000,
    );
  await settleSpeed(room.id, now);
  const r = await one(
    'SELECT * FROM speed_rounds WHERE room_id=? ORDER BY starts_at DESC,id DESC LIMIT 1',
    room.id,
  );
  const normalBusy = !!(await one(
    `SELECT 1 FROM rooms WHERE id=? AND EXISTS(${normalPlayingSQL})`,
    room.id,
    now,
  ));
  const roomView = {
    hostId: room.host_id,
    inviteKey: room.invite_code || room.id,
    id: room.id,
    name: room.name,
    isHost: host,
    canStart: !normalBusy,
    normalRoundId: room.current_round_id,
    active: !!room.active_speed_id,
  };
  const members = await all(
    `SELECT m.id,m.name,m.avatar,m.skin_id AS skin,m.account_id,cs.skin_id AS cardSkin,m.last_seen,m.last_active,m.spectator,c.name_color,c.avatar_frame,et.title FROM members m LEFT JOIN equipped_card_skins cs ON cs.account_id=m.account_id LEFT JOIN account_cosmetics c ON c.account_id=m.account_id LEFT JOIN equipped_titles et ON et.owner=CASE WHEN m.account_id IS NOT NULL THEN 'account:'||m.account_id ELSE 'guest:'||m.token_hash END WHERE m.room_id=? AND m.blocked=0 ORDER BY m.rowid`,
    room.id,
  );
  const levels = await accountProgressions(members.map((x) => x.account_id).filter(Boolean));
  const roster = members.map((x) => ({
    id: x.id,
    name: x.name,
    avatar: x.avatar,
    skin: x.skin,
    cardSkin: x.cardSkin,
    spectator: !!x.spectator,
    title: x.title || '',
    linked: !!x.account_id,
    level: levels.get(x.account_id)?.level || 1,
    presence:
      now - x.last_seen >= 45000 ? 'offline' : now - x.last_active >= 90000 ? 'away' : 'online',
    ...equippedAtLevel(x.name_color, x.avatar_frame, levels.get(x.account_id)?.level || 1),
  }));
  const reactions = await all(
    'SELECT r.id,r.emoji,r.member_id AS memberId,r.created_at AS createdAt,m.name FROM reactions r JOIN members m ON m.id=r.member_id WHERE r.room_id=? AND r.created_at>? ORDER BY r.created_at DESC LIMIT 160',
    room.id,
    now - 6500,
  );
  const chatResponse = await gameGet(
    new Request(new URL('/api/game?room=' + room.id + '&chat=1', req.url), {
      headers: req.headers,
    }),
  );
  const chat = chatResponse.ok ? await chatResponse.json() : undefined;
  if (!r)
    return {
      room: roomView,
      roster,
      reactions,
      me: { id: m.id, spectator: !!m.spectator },
      themes: SPEED_THEMES.map(({ words, ...t }) => t),
      round: null,
      serverNow: now,
      chat,
    };
  if (
    room.active_speed_id === r.id &&
    !m.spectator &&
    now < r.ends_at &&
    !(await one('SELECT 1 FROM speed_plays WHERE round_id=? AND member_id=?', r.id, m.id))
  )
    await run(
      'INSERT OR IGNORE INTO speed_plays(round_id,member_id,state,updated_at) VALUES(?,?,?,?)',
      r.id,
      m.id,
      JSON.stringify(emptySpeed()),
      now,
    );
  const p = await one('SELECT * FROM speed_plays WHERE round_id=? AND member_id=?', r.id, m.id),
    state: SpeedState = p ? JSON.parse(p.state) : emptySpeed(),
    answers: string[] = JSON.parse(r.answers);
  const rows = await all(
    'SELECT m.id,m.name,m.avatar,m.skin_id AS skin,p.state FROM speed_plays p JOIN members m ON m.id=p.member_id WHERE p.round_id=? AND m.blocked=0 AND m.spectator=0 ORDER BY m.rowid',
    r.id,
  );
  const players = rows.map((x) => {
    const s: SpeedState = JSON.parse(x.state);
    return {
      id: x.id,
      name: x.name,
      avatar: x.avatar,
      skin: x.skin,
      cardSkin: x.cardSkin,
      current: s.current,
      statuses: s.puzzles.map((p) => p.status),
      solved: s.puzzles.filter((p) => p.status === 'won').length,
      lastSolvedAt: s.lastSolvedAt,
    };
  });
  const ended = now >= r.ends_at,
    finished = state.puzzles.every((p) => p.status !== 'open'),
    canStart =
      ended ||
      (players.length > 0 && players.every((p) => p.statuses.every((s: string) => s !== 'open')));
  return {
    room: roomView,
    roster,
    reactions,
    me: { id: m.id, spectator: !!m.spectator },
    themes: SPEED_THEMES.map(({ words, ...t }) => t),
    round: {
      id: r.id,
      theme: r.theme,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      widths: answers.map((a) => splitWord(a).length),
      ended,
      canStart,
    },
    play: {
      ...state,
      reward:
        finished || ended
          ? {
              wins: state.puzzles.every((p) => p.status === 'won') ? 1 : 0,
              xp: state.puzzles.every((p) => p.status === 'won')
                ? 90
                : state.puzzles.some((p) => p.guesses.length)
                  ? 10
                  : 0,
            }
          : null,
      revision: p?.revision ?? 0,
      finished,
      answers: ended ? answers : undefined,
    },
    players,
    ranking: speedRank(players),
    serverNow: now,
    chat,
  };
}
export async function GET(req: Request) {
  try {
    return reply(
      await view(req, await context(req, new URL(req.url).searchParams.get('room') || '')),
    );
  } catch (e) {
    return reply(
      { error: e instanceof Failure ? e.message : '스피드전을 불러오지 못했어요.' },
      e instanceof Failure ? e.status : 503,
    );
  }
}
export async function POST(req: Request) {
  try {
    check(req.headers.get('origin') === new URL(req.url).origin, '요청 출처를 확인해 주세요.', 403);
    const b = (await req.json()) as any;
    check(typeof b.room === 'string', '방을 확인해 주세요.');
    const ctx = await context(req, b.room),
      { m, room, host } = ctx,
      now = Date.now();
    if (b.action === 'start') {
      check(host, '방장만 시작할 수 있어요.', 403);
      const theme = SPEED_THEMES.find((t) => t.id === b.theme);
      check(theme, '주제를 선택해 주세요.');
      const old = await one(
        'SELECT * FROM speed_rounds WHERE room_id=? ORDER BY starts_at DESC,id DESC LIMIT 1',
        room.id,
      );
      if (old && now < old.ends_at) {
        const playing = await one(
          `SELECT 1 FROM speed_plays p JOIN members m ON m.id=p.member_id,json_each(p.state,'$.puzzles') j WHERE p.round_id=? AND m.blocked=0 AND m.spectator=0 AND json_extract(j.value,'$.status')='open' LIMIT 1`,
          old.id,
        );
        const participants = await one(
          'SELECT COUNT(*) n FROM speed_plays WHERE round_id=?',
          old.id,
        );
        check(
          !playing && participants.n > 0 && now >= old.starts_at,
          '아직 풀이 중인 참가자가 있어요.',
          409,
        );
      }
      await settleSpeed(room.id, now);
      check(
        !(await one(
          `SELECT 1 FROM rooms WHERE id=? AND EXISTS(${normalPlayingSQL})`,
          room.id,
          now,
        )),
        '일반전·아이템전을 풀이 중인 참가자가 있어요.',
        409,
      );
      const id = crypto.randomUUID(),
        answers = chooseSpeed(theme!.words, old ? JSON.parse(old.answers) : []);
      const inserted = await run(
        `INSERT INTO speed_rounds(id,room_id,theme,answers,starts_at,ends_at) SELECT ?,?,?,?,?,? WHERE COALESCE((SELECT id FROM speed_rounds WHERE room_id=? ORDER BY starts_at DESC,id DESC LIMIT 1),'')=? AND EXISTS(SELECT 1 FROM rooms WHERE id=? AND current_round_id IS ? AND NOT EXISTS(${normalPlayingSQL}) AND NOT EXISTS(${speedPlayingSQL}))`,
        id,
        room.id,
        theme!.id,
        JSON.stringify(answers),
        now + 3000,
        now + 183000,
        room.id,
        old?.id || '',
        room.id,
        room.current_round_id ?? null,
        Date.now(),
        Date.now(),
        Date.now(),
      );
      check(inserted.meta.changes, '다른 요청에서 이미 시작했어요.', 409);
      ctx.room.active_speed_id = id;
      return reply(await view(req, ctx));
    }
    check(['guess', 'skip', 'select'].includes(b.action), '동작을 확인해 주세요.');
    check(!m.spectator, '관전 중에는 제출할 수 없어요.', 403);
    const r = await one(
      'SELECT * FROM speed_rounds WHERE room_id=? ORDER BY starts_at DESC,id DESC LIMIT 1',
      room.id,
    );
    check(r && r.id === room.active_speed_id && r.id === b.roundId, '문제가 바뀌었어요.', 409);
    check(now >= r.starts_at, '카운트다운 후 시작해 주세요.');
    check(now < r.ends_at, '시간이 종료됐어요.', 409);
    const p = await one('SELECT * FROM speed_plays WHERE round_id=? AND member_id=?', r.id, m.id);
    check(p && p.revision === b.revision, '진행 상황이 바뀌었어요. 다시 확인해 주세요.', 409);
    let s: SpeedState = JSON.parse(p.state);
    check(
      s.puzzles.some((p) => p.status === 'open'),
      '묶음을 모두 완료했어요.',
    );
    if (b.action === 'guess') {
      check(typeof b.word === 'string' && b.word.length <= 32, '단어를 확인해 주세요.');
      check(acceptsGuess(splitWord(b.word), 1), '사전에 있는 단어를 입력해 주세요.');
      try {
        s = guessSpeed(s, JSON.parse(r.answers), b.word, now);
      } catch (e) {
        throw new Failure((e as Error).message);
      }
    }
    if (b.action === 'skip') advanceSpeed(s);
    if (b.action === 'select') {
      check(
        Number.isInteger(b.index) &&
          b.index >= 0 &&
          b.index < 5 &&
          s.puzzles[b.index].status === 'open',
        '다시 풀 수 있는 문제를 선택해 주세요.',
      );
      s.current = b.index;
    }
    const changed = await run(
      `UPDATE speed_plays SET state=?,revision=revision+1,updated_at=? WHERE round_id=? AND member_id=? AND revision=? AND EXISTS(SELECT 1 FROM members WHERE id=? AND blocked=0 AND spectator=0) AND EXISTS(SELECT 1 FROM rooms WHERE id=? AND active_speed_id=?) AND EXISTS(SELECT 1 FROM speed_rounds WHERE id=? AND ends_at>? AND id=(SELECT id FROM speed_rounds WHERE room_id=? ORDER BY starts_at DESC,id DESC LIMIT 1))`,
      JSON.stringify(s),
      now,
      r.id,
      m.id,
      b.revision,
      m.id,
      room.id,
      r.id,
      r.id,
      Date.now(),
      room.id,
    );
    check(changed.meta.changes, '시간 또는 진행 상황이 바뀌었어요.', 409);
    return reply(await view(req, ctx));
  } catch (e) {
    return reply(
      { error: e instanceof Failure ? e.message : '처리하지 못했어요. 다시 확인해 주세요.' },
      e instanceof Failure ? e.status : 503,
    );
  }
}
