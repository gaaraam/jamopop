import { date } from '@/lib/game-api/runtime';
import { GET as announcementGet } from '@/app/api/announcements/route';
import { accountProgressions, isSiteAdmin } from '@/lib/account';
import { settleSpeed } from '@/lib/competition';
import { equippedAtLevel } from '@/lib/cosmetics';
import { dataRevision, derivedCache } from '@/lib/derived-cache';
import { rankPlayers, weekStart, type Guess } from '@/lib/game';
import { check, failure, reply, UserError } from '@/lib/game-api/http';
import { lobbyResponse } from '@/lib/game-api/lobby';
import { publicProfile } from '@/lib/game-api/profile';
import { handleRoomEntry, handleRoomManagement } from '@/lib/game-api/rooms';
import { nextRound } from '@/lib/game-api/rounds';
import {
  auth,
  choose,
  getRound,
  presenceNotice,
  resolveRoom,
  uuid,
  widthOf,
} from '@/lib/game-api/runtime';
import { submitGuess } from '@/lib/game-api/submission';
import { acceptsGuess } from '@/lib/guess-dictionary';
import { inputShape } from '@/lib/input';
import { createInquiry, inquiryCommand, inquiryOwner } from '@/lib/inquiries';
import { expirePlays, isSpectator, partyState } from '@/lib/party';
import { invitationInbox } from '@/lib/room-invitations';
import { all, one, run } from '@/lib/store';
import { PRESENCE_INTERVAL, PRESENCE_OFFLINE } from '@/lib/sync-policy.mjs';
import { WORD_COUNTS } from '@/lib/words';
async function liveInfo(room: any, memberId: string, now: number) {
  if (!room.live_id) return null;
  const r = await one('SELECT * FROM rounds WHERE id=?', room.live_id);
  if (!r) return null;
  const participants = await all(
    `SELECT m.id,m.name,m.avatar,m.skin_id AS skin,lp.ready,p.status FROM live_participants lp JOIN members m ON m.id=lp.member_id LEFT JOIN plays p ON p.round_id=lp.round_id AND p.member_id=lp.member_id WHERE lp.round_id=? AND m.blocked=0 ORDER BY m.name`,
    r.id,
  );
  const allFinished =
    !!r.restricted &&
    participants.length > 0 &&
    participants.every((p) => p.status === 'won' || p.status === 'lost');
  const phase =
    r.phase === 'cancelled'
      ? 'cancelled'
      : r.phase === 'lobby'
        ? 'lobby'
        : (r.ends_at && now >= r.ends_at) || allFinished
          ? 'finished'
          : 'running';
  return {
    id: r.id,
    phase,
    width: r.width,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    restricted: !!r.restricted,
    participants: participants.map((p) => ({ ...p, ready: !!p.ready })),
    joined: !r.restricted || participants.some((p) => p.id === memberId),
    ready: !!participants.find((p) => p.id === memberId)?.ready,
  };
}
async function state(req: Request, roomId: string, mode: string) {
  const m = await auth(req, roomId),
    room = await one('SELECT * FROM rooms WHERE id=?', roomId);
  check(room, '방을 찾을 수 없어요.', 404);
  if (room.active_speed_id) await settleSpeed(roomId);
  const r = await getRound(room, m, mode);
  check(r, '문제를 찾을 수 없어요.', 404);
  const party = await partyState(r, m),
    personalEnd = party.loadout?.endsAt ?? r.ends_at;
  const now = Date.now(),
    active = new URL(req.url).searchParams.get('away') !== '1';
  if (
    !m.chat_seen ||
    now - m.last_seen >= PRESENCE_INTERVAL ||
    (active && now - m.last_active >= PRESENCE_INTERVAL)
  ) {
    if (!m.chat_seen || now - m.last_seen >= 90000) await presenceNotice(m, now);
    await run(
      'UPDATE members SET last_seen=?,last_active=CASE WHEN ?=1 THEN ? ELSE last_active END WHERE id=? AND (last_seen<=? OR (?=1 AND last_active<=?))',
      now,
      active ? 1 : 0,
      now,
      m.id,
      now - PRESENCE_INTERVAL,
      active ? 1 : 0,
      now - PRESENCE_INTERVAL,
    );
  }
  if (mode === 'daily' && r.ends_at) await expirePlays(r, now);
  const [p, live] = await Promise.all([
    one('SELECT * FROM plays WHERE round_id=? AND member_id=?', r.id, m.id),
    liveInfo(room, m.id, now),
  ]);
  const expired =
    mode === 'live'
      ? live?.phase === 'finished' || live?.phase === 'cancelled'
      : !!personalEnd && now >= personalEnd;
  const phase = mode === 'live' ? live?.phase || 'running' : 'running';
  const spectator = party.spectator || (mode === 'live' && !live?.joined);
  const status = spectator
    ? 'spectating'
    : p?.status === 'won'
      ? 'won'
      : p?.status === 'lost' || p?.status === 'forfeited' || expired
        ? 'lost'
        : spectator
          ? 'spectating'
          : 'playing';
  const rows = await all(
    `SELECT m.id,m.name,m.avatar,m.skin_id AS skin,m.account_id,cs.skin_id AS cardSkin,c.name_color,c.avatar_frame,m.last_seen,m.last_active,m.spectator,p.guesses,p.status,p.finished_at,EXISTS(SELECT 1 FROM hint_views hv WHERE hv.round_id=? AND hv.member_id=m.id) AS hint_used,et.title AS title,COALESCE(il.ends_at,?) AS personal_end,EXISTS(SELECT 1 FROM spectators sp WHERE sp.round_id=? AND sp.member_id=m.id) AS watched FROM members m LEFT JOIN equipped_card_skins cs ON cs.account_id=m.account_id LEFT JOIN account_cosmetics c ON c.account_id=m.account_id LEFT JOIN equipped_titles et ON et.owner=CASE WHEN m.account_id IS NOT NULL THEN 'account:'||m.account_id ELSE 'guest:'||m.token_hash END LEFT JOIN item_loadouts il ON il.round_id=? AND il.member_id=m.id LEFT JOIN plays p ON p.member_id=m.id AND p.round_id=? WHERE m.room_id=? AND m.blocked=0 ORDER BY m.rowid ASC`,
    r.id,
    r.ends_at,
    r.id,
    r.id,
    r.id,
    roomId,
  );
  const levels = await accountProgressions(rows.map((x) => x.account_id).filter(Boolean));
  const participants = (mode === 'practice' ? rows.filter((x) => x.id === m.id) : rows).filter(
    (x) => !x.spectator && !x.watched,
  );
  const players = participants.map((x) => {
    const g: Guess[] = JSON.parse(x.guesses || '[]');
    return {
      id: x.id,
      name: x.name,
      avatar: x.avatar,
      skin: x.skin,
      cardSkin: x.cardSkin,
      online: now - x.last_seen < PRESENCE_OFFLINE,
      colors: g.map((v) => v.colors),
      status:
        x.status === 'won'
          ? 'won'
          : x.status === 'lost' ||
              x.status === 'forfeited' ||
              (x.personal_end && now >= x.personal_end && g.length > 0)
            ? 'lost'
            : g.length
              ? 'playing'
              : 'waiting',
      attempts: g.length,
      forfeited: x.status === 'forfeited',
      hintUsed: !!r.hint_policy && !!x.hint_used,
      finishedAt: x.finished_at,
    };
  });
  const ranked = rankPlayers(players, mode);
  const activeCount = players.filter((p) => p.status === 'playing').length;
  const revision = await dataRevision();
  const [reactions, history, weeklyRows] = await Promise.all([
    all(
      'SELECT r.id,r.emoji,r.member_id AS memberId,r.created_at AS createdAt,m.name FROM reactions r JOIN members m ON m.id=r.member_id WHERE r.room_id=? AND r.created_at>? ORDER BY r.created_at DESC LIMIT 160',
      roomId,
      now - 6500,
    ),
    mode === 'daily'
      ? derivedCache('history:' + roomId + ':' + m.id + ':' + room.current_round_id, revision, () =>
          all(
            `SELECT r.id,r.answer,r.width,r.starts_at AS startsAt,COUNT(p.id) AS participants,SUM(CASE WHEN p.status='won' THEN 1 ELSE 0 END) AS winners,(SELECT CASE WHEN status='playing' AND guesses<>'[]' AND r.phase='interrupted' THEN 'interrupted' ELSE status END FROM plays WHERE round_id=r.id AND member_id=?) AS myStatus,(SELECT json_array_length(guesses) FROM plays WHERE round_id=r.id AND member_id=?) AS myAttempts FROM rounds r LEFT JOIN plays p ON p.round_id=r.id AND p.guesses<>'[]' WHERE r.room_id=? AND r.mode='daily' AND r.retired_at IS NOT NULL AND r.id<>? GROUP BY r.id ORDER BY r.retired_at DESC,r.id DESC LIMIT 10`,
            m.id,
            m.id,
            roomId,
            room.current_round_id,
          ),
        )
      : Promise.resolve([]),
    derivedCache('weekly:' + roomId + ':' + r.variant + ':' + weekStart(now), revision, () =>
      all(
        `SELECT m.id,m.name,m.avatar,m.skin_id AS skin,m.blocked,COUNT(*) AS wins,AVG(json_array_length(p.guesses)) AS average FROM plays p JOIN rounds r ON r.id=p.round_id JOIN members m ON m.id=p.member_id WHERE r.room_id=? AND r.mode<>'practice' AND p.status='won' AND COALESCE(r.variant,'normal')=? AND p.finished_at>=? AND p.finished_at<? GROUP BY m.id ORDER BY wins DESC,average ASC,m.name`,
        roomId,
        r.variant || 'normal',
        weekStart(now),
        weekStart(now) + 7 * 86400000,
      ),
    ),
  ]);
  const weekly = (weeklyRows as Array<{ wins: number; average: number }>).map((x) => ({
    ...x,
    rank:
      (weeklyRows as Array<{ wins: number; average: number }>).findIndex(
        (y) => y.wins === x.wins && y.average === x.average,
      ) + 1,
  }));
  const reviews =
    !spectator && (status === 'won' || status === 'lost') && phase !== 'lobby'
      ? rows
          .filter(
            (x) =>
              x.status === 'won' ||
              x.status === 'lost' ||
              x.status === 'forfeited' ||
              (x.personal_end && now >= x.personal_end && x.guesses && x.guesses !== '[]'),
          )
          .map((x) => ({
            id: x.id,
            name: x.name,
            avatar: x.avatar,
            skin: x.skin,
            cardSkin: x.cardSkin,
            status: x.status === 'won' ? 'won' : 'lost',
            guesses: JSON.parse(x.guesses || '[]'),
          }))
      : [];
  const [chat, notice, invitations] = await Promise.all([
    chatState(roomId, m),
    announcementGet(req).then((r) => r.json() as Promise<{ announcement?: unknown }>),
    invitationInbox(req),
  ]);
  return {
    chat,
    invitations,
    announcement: notice.announcement,
    party,
    roster: rows.map((x) => ({
      spectator: !!x.spectator || !!x.watched,
      title: x.title || '',
      id: x.id,
      name: x.name,
      avatar: x.avatar,
      skin: x.skin,
      cardSkin: x.cardSkin,
      ...equippedAtLevel(
        x.account_id ? x.name_color : null,
        x.account_id ? x.avatar_frame : null,
        levels.get(x.account_id)?.level || 1,
      ),
      linked: !!x.account_id,
      level: x.account_id ? levels.get(x.account_id)?.level || 1 : null,
      presence:
        now - x.last_seen >= PRESENCE_OFFLINE
          ? 'offline'
          : now - x.last_active >= 20000
            ? 'away'
            : 'online',
    })),
    history,
    weekly,
    weekLabel: date(weekStart(now)),
    reviews,
    live,
    wordCounts: WORD_COUNTS,
    room: {
      activeSpeedId: room.active_speed_id || null,
      id: room.id,
      name: room.name,
      isHost: room.host_id === m.id || isSiteAdmin(req),
      isAdmin: isSiteAdmin(req),
      hostId: room.host_id,
      inviteKey: room.invite_code || room.id,
      liveId: room.live_id,
      roundNo: room.round_no,
      canReset:
        mode === 'daily' && (room.host_id === m.id || isSiteAdmin(req)) && activeCount === 0,
      activeCount,
    },
    me: { id: m.id, name: m.name, avatar: m.avatar },
    round: {
      id: r.id,
      mode: r.mode,
      width: r.width,
      dictionaryVersion: r.dictionary_version,
      phase,
      startsAt: r.starts_at,
      endsAt: personalEnd,
      expired: !!expired,
    },
    play: {
      forfeited: p?.status === 'forfeited',
      guesses: p ? JSON.parse(p.guesses) : [],
      status,
      ...(!spectator && (status === 'won' || status === 'lost') && phase !== 'lobby'
        ? { answer: r.answer }
        : {}),
    },
    players: ranked,
    reactions,
    serverNow: now,
    date: date(),
  };
}
async function chatState(roomId: string, m: any) {
  const current = await one('SELECT current_round_id FROM rooms WHERE id=?', roomId);
  const fresh = await one('SELECT * FROM members WHERE id=?', m.id);
  const channel = (await isSpectator(fresh, current.current_round_id)) ? 'spectator' : 'player';
  const messages = await all(
    `SELECT c.id,c.member_id AS memberId,m.name,m.avatar,m.skin_id AS skin,CASE WHEN c.deleted=1 THEN '' ELSE c.body END AS body,c.created_at AS createdAt,c.deleted,c.system FROM chat_messages c JOIN members m ON m.id=c.member_id WHERE c.room_id=? AND c.channel=? ORDER BY c.id DESC LIMIT 60`,
    roomId,
    channel,
  );
  return { messages: messages.reverse(), serverNow: Date.now(), channel };
}
async function tryStart(roundId: string, now: number) {
  return run(
    `UPDATE rounds SET phase='running',starts_at=?,ends_at=? WHERE id=? AND phase='lobby' AND (SELECT COUNT(*) FROM live_participants WHERE round_id=?)>=2 AND NOT EXISTS(SELECT 1 FROM live_participants WHERE round_id=? AND ready=0)`,
    now + 5000,
    now + 185000,
    roundId,
    roundId,
    roundId,
  );
}
export async function GET(req: Request) {
  try {
    const url = new URL(req.url),
      room = url.searchParams.get('room') || '';
    if (url.searchParams.get('lobby') === '1') return await lobbyResponse(req, url);
    if (url.searchParams.has('profile')) {
      await auth(req, room);
      return reply(await publicProfile(room, url.searchParams.get('profile') || ''));
    }
    if (url.searchParams.get('chat') === '1') {
      const m = await auth(req, room);
      return reply(await chatState(room, m));
    }
    if (url.searchParams.get('info')) {
      const r =
        url.searchParams.get('publicRoom') === '1'
          ? await one('SELECT name,password_hash FROM rooms WHERE id=?', room)
          : await resolveRoom(req, room);
      check(r, '방을 찾을 수 없어요.', 404);
      return reply({ name: r.name, locked: !!r.password_hash });
    }
    const mode = url.searchParams.get('mode') || 'daily';
    check(['daily', 'practice', 'live'].includes(mode), '게임 모드를 확인해 주세요.');
    let id = room;
    try {
      await auth(req, id);
    } catch (e) {
      if (!(e instanceof UserError) || e.status === 403) throw e;
      const r = await resolveRoom(req, room);
      id = r.id;
    }
    return reply(await state(req, id, mode));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    const origin = req.headers.get('origin');
    check(!origin || origin === new URL(req.url).origin, '이 페이지에서 다시 시도해 주세요.', 403);
    check(Number(req.headers.get('content-length') || 0) < 8192, '요청이 너무 길어요.');
    const b: any = await req.json();
    check(b && typeof b === 'object' && !Array.isArray(b), '요청을 확인해 주세요.');
    const now = Date.now();
    const entry = await handleRoomEntry(req, b, now);
    if (entry) return entry;
    const m = await auth(req, b.room),
      room = await one('SELECT * FROM rooms WHERE id=?', b.room);
    check(room, '방을 찾을 수 없어요.', 404);
    const responseMode = ['daily', 'practice', 'live'].includes(b.mode) ? b.mode : 'daily';
    if (b.action === 'chat_send') {
      const channel = (await isSpectator(m, room.current_round_id)) ? 'spectator' : 'player';
      const body = typeof b.body === 'string' ? b.body.trim() : '';
      check(body.length > 0 && body.length <= 300, '메시지는 1~300자로 입력해 주세요.');
      check(
        typeof b.requestId === 'string' && /^[a-f0-9-]{36}$/.test(b.requestId),
        '전송 정보를 확인해 주세요.',
      );
      const inquiry = inquiryCommand(body);
      if (inquiry !== null) {
        check(inquiry, '@문의 뒤에 내용을 적어 주세요.');
        const owner = await inquiryOwner(req);
        check(owner, '다시 로그인해 주세요.', 401);
        let id: string;
        try {
          id = await createInquiry(owner, {
            requestId: b.requestId,
            name: m.name,
            category: '채팅 문의',
            title: inquiry.slice(0, 80),
            body: inquiry,
          });
        } catch (e) {
          throw new UserError((e as Error).message);
        }
        return reply({ ...(await chatState(room.id, m)), inquiryId: id });
      }
      const existing = await one(
        'SELECT id,body FROM chat_messages WHERE member_id=? AND request_id=?',
        m.id,
        b.requestId,
      );
      if (existing) {
        check(existing.body === body, '이미 처리된 전송입니다.', 409);
        return reply(await chatState(room.id, m));
      }
      const inserted = await run(
        `INSERT INTO chat_messages(room_id,member_id,channel,request_id,body,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM members WHERE id=? AND room_id=? AND blocked=0 AND CASE WHEN spectator=1 OR EXISTS(SELECT 1 FROM spectators WHERE round_id=? AND member_id=members.id) THEN 'spectator' ELSE 'player' END=?) AND NOT EXISTS(SELECT 1 FROM chat_messages WHERE member_id=? AND system=0 AND created_at>?) ON CONFLICT(member_id,request_id) DO NOTHING`,
        room.id,
        m.id,
        channel,
        b.requestId,
        body,
        now,
        m.id,
        room.id,
        room.current_round_id,
        channel,
        m.id,
        now - 1500,
      );
      if (!inserted.meta.changes) {
        const retry = await one(
          'SELECT body FROM chat_messages WHERE member_id=? AND request_id=?',
          m.id,
          b.requestId,
        );
        check(retry?.body === body, '잠깐만요. 메시지는 1.5초에 한 번 보낼 수 있어요.', 429);
      }
      return reply(await chatState(room.id, m));
    }
    if (b.action === 'chat_delete') {
      check(Number.isSafeInteger(b.messageId) && b.messageId > 0, '메시지를 확인해 주세요.');
      const changed = await run(
        `UPDATE chat_messages SET deleted=1 WHERE id=? AND room_id=? AND (member_id=? OR ?=1 OR EXISTS(SELECT 1 FROM rooms WHERE id=? AND host_id=?)) AND EXISTS(SELECT 1 FROM members WHERE id=? AND (blocked=0 OR ?=1))`,
        b.messageId,
        room.id,
        m.id,
        isSiteAdmin(req) ? 1 : 0,
        room.id,
        m.id,
        m.id,
        isSiteAdmin(req) ? 1 : 0,
      );
      check(changed.meta.changes, '본인 메시지 또는 방장만 삭제할 수 있어요.', 403);
      return reply(await chatState(room.id, m));
    }
    if (['check_word', 'guess', 'forfeit', 'practice', 'react'].includes(b.action))
      check(
        !(await isSpectator(m, room.current_round_id)),
        '관전 중에는 게임에 참여할 수 없어요.',
        403,
      );
    if (b.action === 'check_word') {
      check(['daily', 'practice'].includes(b.mode), '게임 모드를 확인해 주세요.');
      check(b.mode !== 'daily' || !room.active_speed_id, '스피드전으로 전환됐어요.', 409);
      const r = await getRound(room, m, b.mode);
      check(r && r.id === b.roundId, '문제가 바뀌었어요. 다시 확인해 주세요.', 409);
      check(typeof b.word === 'string' && b.word.length <= 32, '입력을 확인해 주세요.');
      const shape = inputShape(b.word, r.width);
      return reply({
        roundId: r.id,
        word: shape.letters.join(''),
        valid: shape.valid && acceptsGuess(shape.letters, r.dictionary_version),
      });
    }
    const management = await handleRoomManagement(req, b, m, room, responseMode, state);
    if (management) return management;
    if (b.action === 'reset' || b.action === 'force_reset')
      return await nextRound(req, b, m, room, now, state);
    if (b.action === 'lobby' || b.action === 'rematch')
      throw new UserError('라이브 대전은 종료됐어요. 우리 방 문제를 이용해 주세요.', 410);
    if (['join_lobby', 'ready', 'leave_lobby', 'start', 'cancel_lobby'].includes(b.action)) {
      const r = await getRound(room, m, 'live');
      check(r.id === b.roundId, '대기실이 바뀌었어요.', 409);
      check(r.phase === 'lobby', '이미 대전이 시작되었거나 끝났어요.', 409);
      if (b.action === 'cancel_lobby') {
        check(room.host_id === m.id || isSiteAdmin(req), '방장만 대기실을 닫을 수 있어요.', 403);
        await run(
          "UPDATE rounds SET phase='cancelled',ends_at=? WHERE id=? AND phase='lobby'",
          now,
          r.id,
        );
      } else if (b.action === 'start') {
        check(room.host_id === m.id || isSiteAdmin(req), '방장만 시작할 수 있어요.', 403);
        const changed = await tryStart(r.id, now);
        check(changed.meta.changes, '2명 이상 참여하고 모두 준비해야 시작할 수 있어요.');
      } else if (b.action === 'leave_lobby') {
        await run(
          "DELETE FROM live_participants WHERE round_id=? AND member_id=? AND EXISTS(SELECT 1 FROM rounds WHERE id=? AND phase='lobby')",
          r.id,
          m.id,
          r.id,
        );
        await tryStart(r.id, now);
      } else {
        const ready = b.action === 'ready' && b.ready === true ? 1 : 0;
        const changed = await run(
          `INSERT INTO live_participants(round_id,member_id,ready) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM rounds WHERE id=? AND phase='lobby') ON CONFLICT(round_id,member_id) DO UPDATE SET ready=excluded.ready`,
          r.id,
          m.id,
          ready,
          r.id,
        );
        check(changed.meta.changes, '이미 대전이 시작됐어요.', 409);
        await tryStart(r.id, now);
      }
      return reply(await state(req, room.id, 'live'));
    }
    if (b.action === 'forfeit') {
      check(b.mode === 'daily', '우리 방 문제에서만 기권할 수 있어요.');
      check(b.roundId === room.current_round_id, '문제가 바뀌었어요. 다시 확인해 주세요.', 409);
      const changed = await run(
        `UPDATE plays SET status='forfeited',finished_at=?,updated_at=? WHERE round_id=? AND member_id=? AND status='playing' AND guesses<>'[]' AND json_array_length(guesses)=? AND EXISTS(SELECT 1 FROM rooms WHERE id=? AND current_round_id=?) AND EXISTS(SELECT 1 FROM members WHERE id=? AND blocked=0)`,
        now,
        now,
        b.roundId,
        m.id,
        b.expected,
        room.id,
        b.roundId,
        m.id,
      );
      check(changed.meta.changes, '이미 끝났거나 기록이 바뀌었어요. 다시 확인해 주세요.', 409);
      return reply(await state(req, room.id, 'daily'));
    }
    if (b.action === 'practice') {
      if (m.practice_id && !b.new) return reply(await state(req, room.id, 'practice'));
      const id = uuid(),
        width = widthOf(b.width);
      await run(
        'INSERT INTO rounds(id,room_id,mode,answer,starts_at,owner_id,width,dictionary_version) VALUES(?,?,?,?,?,?,?,1)',
        id,
        room.id,
        'practice',
        await choose(room.id, width, m.id),
        now,
        m.id,
        width,
      );
      await run('UPDATE members SET practice_id=? WHERE id=?', id, m.id);
      return reply(await state(req, room.id, 'practice'));
    }
    if (b.action === 'react') {
      check(['👏', '👀', '🔥', '☕'].includes(b.emoji), '사용할 수 없는 응원이에요.');
      const recent = await one(
        'SELECT created_at FROM reactions WHERE member_id=? ORDER BY created_at DESC LIMIT 1',
        m.id,
      );
      check(
        !recent || now - recent.created_at >= 2000,
        '응원은 2초에 한 번씩 보낼 수 있어요.',
        429,
      );
      const reaction = { id: uuid(), memberId: m.id, name: m.name, emoji: b.emoji, createdAt: now };
      await run(
        'INSERT INTO reactions(id,room_id,member_id,emoji,created_at) VALUES(?,?,?,?,?)',
        reaction.id,
        room.id,
        m.id,
        b.emoji,
        now,
      );
      await run('DELETE FROM reactions WHERE room_id=? AND created_at<?', room.id, now - 60000);
      return reply({ ok: true, reaction });
    }
    return await submitGuess(req, b, m, room, now, state);
  } catch (e) {
    return failure(e);
  }
}
