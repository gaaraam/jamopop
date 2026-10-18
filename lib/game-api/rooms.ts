import { accountId, avatarAccess, findMember, isAdminAccount, isSiteAdmin } from '@/lib/account';
import { check, reply } from '@/lib/game-api/http';
import {
  avatars,
  cookie,
  hash,
  key,
  presenceNotice,
  resolveRoom,
  uuid,
  widthOf,
  type StateReader,
} from '@/lib/game-api/runtime';
import { trackSpectator } from '@/lib/party';
import {
  allowRoomPasswordAttempt,
  hashRoomPassword,
  validRoomPassword,
  verifyRoomPassword,
} from '@/lib/room-password';
import { ROOM_ROUND_MS } from '@/lib/round-timer';
import { all, database, one, run } from '@/lib/store';
import { randomWord } from '@/lib/words';
export async function handleRoomEntry(
  req: Request,
  b: any,
  now: number,
  readState?: StateReader,
): Promise<Response | null> {
  if (b.action === 'archive_room' || b.action === 'restore_room') {
    check(isSiteAdmin(req), '관리자만 방을 정리할 수 있어요.', 403);
    check(typeof b.room === 'string' && /^[a-f0-9]{24}$/.test(b.room), '방을 확인해 주세요.');
    const changed = await run(
      'UPDATE rooms SET archived_at=? WHERE id=?',
      b.action === 'archive_room' ? now : null,
      b.room,
    );
    check(changed.meta.changes, '방을 찾을 수 없어요.', 404);
    return reply({ ok: true });
  }
  if (b.action === 'create' || b.action === 'join') {
    const profileEntry = b.useProfile === true;
    const owner = accountId(req);
    check(!profileEntry || owner, '로그인한 계정으로 다시 입장해 주세요.', 401);
    const saved = profileEntry
      ? await one(
          `SELECT name,avatar FROM (SELECT name,avatar,0 AS priority,0 AS seen FROM profiles WHERE id=? UNION ALL SELECT name,avatar,1 AS priority,last_seen AS seen FROM members WHERE account_id=?) ORDER BY priority,seen DESC LIMIT 1`,
          owner,
          owner,
        )
      : null;
    let name = profileEntry
      ? String(saved?.name || '콩알' + owner!.replace(/[^a-z0-9]/gi, '').slice(-5))
          .trim()
          .slice(0, 16)
      : typeof b.name === 'string'
        ? b.name.trim().slice(0, 16)
        : '';
    check(name, '닉네임을 입력해 주세요.');
    let avatar = avatars.includes(profileEntry ? saved?.avatar : b.avatar)
      ? profileEntry
        ? saved.avatar
        : b.avatar
      : avatars[0];
    let token = cookie(req);
    if (!/^[a-f0-9]{64}$/.test(token))
      token = uuid().replaceAll('-', '') + uuid().replaceAll('-', '');
    const tokenHash = await hash(token),
      id = uuid();
    // Start independent reads together; still await the entitlement check before any write.
    const access = avatarAccess(req);
    const roomPromise =
      b.action === 'join'
        ? b.lobby === true
          ? one('SELECT * FROM rooms WHERE id=?', typeof b.room === 'string' ? b.room : '')
          : resolveRoom(req, b.room)
        : Promise.resolve(null);
    const [allowed, joiningRoom] = await Promise.all([access, roomPromise]);
    check(
      allowed.includes(avatar),
      '아직 해금되지 않은 캐릭터예요. 필요한 레벨을 확인해 주세요.',
      403,
    );
    async function entered(roomId: string) {
      if (b.includeState === true && readState) {
        // Use the newly issued cookie for a first guest join; trusted account headers are preserved.
        const headers = new Headers(req.headers);
        const cookies = (headers.get('cookie') || '')
          .split(';')
          .map((v) => v.trim())
          .filter((v) => v && !v.startsWith('bw_session='));
        cookies.push('bw_session=' + token);
        headers.set('cookie', cookies.join('; '));
        try {
          const snapshot = await readState(new Request(req.url, { headers }), roomId, 'daily');
          return reply({ ...(snapshot as object), roomId }, 200, token, req);
        } catch {
          // The membership write already committed. Let the client retry only the read, never create again.
        }
      }
      return reply({ roomId }, 200, token, req);
    }
    if (b.action === 'create') {
      check(
        b.password === undefined || b.password === '' || validRoomPassword(b.password),
        '비밀번호는 4~32자로 입력해 주세요.',
      );
      const passwordHash = b.password ? await hashRoomPassword(b.password) : null;
      const variant = b.variant ?? 'normal';
      check(['normal', 'items'].includes(variant), '대전 방식을 확인해 주세요.');
      const recent = await one(
        'SELECT COUNT(*) n FROM members m JOIN rooms r ON r.host_id=m.id WHERE m.token_hash=? AND r.created_at>?',
        tokenHash,
        now - 3600000,
      );
      check(recent.n < 5, '한 시간에 최대 5개 방을 만들 수 있어요.', 429);
      const roomId = key(),
        inviteKey = key(),
        roundId = uuid(),
        width = widthOf(b.width);
      const roomName = typeof b.roomName === 'string' ? b.roomName.trim().slice(0, 24) : '';
      check(roomName, '방 이름을 입력해 주세요.');
      await database().batch([
        database()
          .prepare(
            'INSERT INTO rooms(id,name,host_id,created_at,current_round_id,round_no,invite_code,password_hash) VALUES(?,?,?,?,?,1,?,?)',
          )
          .bind(roomId, roomName, id, now, roundId, inviteKey, passwordHash),
        database()
          .prepare(
            'INSERT INTO rounds(id,room_id,mode,answer,starts_at,ends_at,width,dictionary_version,variant,hint_policy) VALUES(?,?,?,?,?,?,?,1,?,1)',
          )
          .bind(
            roundId,
            roomId,
            'daily',
            randomWord(undefined, width),
            now,
            now + ROOM_ROUND_MS,
            width,
            variant,
          ),
        database()
          .prepare(
            'INSERT INTO members(id,room_id,token_hash,name,avatar,last_seen,account_id,last_active) VALUES(?,?,?,?,?,?,?,?)',
          )
          .bind(id, roomId, tokenHash, name, avatar, now, owner, now),
      ]);
      return entered(roomId);
    }
    const room = joiningRoom;
    check(room, '방을 찾을 수 없어요.', 404);
    let existing = await findMember(req, room.id);
    if (profileEntry && existing) {
      name = existing.name;
      avatar = existing.avatar;
    }
    if (room.password_hash && !existing && !isSiteAdmin(req)) {
      if (profileEntry && !b.password) return reply({ error: '', needsPassword: true }, 403);
      check(
        await allowRoomPasswordAttempt(
          room.id,
          (req.headers.get('CF-Connecting-IP') || 'local') + ':' + (accountId(req) || tokenHash),
        ),
        '시도가 많아요. 잠시 후 다시 입력해 주세요.',
        429,
      );
      check(
        await verifyRoomPassword(b.password, room.password_hash),
        '방 비밀번호를 확인해 주세요.',
        403,
      );
    }
    if (b.spectator === true && existing)
      check(
        !(await one(
          "SELECT 1 FROM plays WHERE round_id=? AND member_id=? AND guesses<>'[]'",
          room.current_round_id,
          existing.id,
        )),
        '제출한 판에는 관전으로 전환할 수 없어요.',
      );
    const occupied = await one(
      'SELECT id,account_id FROM members WHERE room_id=? AND token_hash=?',
      room.id,
      tokenHash,
    );
    if (!existing && occupied) {
      token = uuid().replaceAll('-', '') + uuid().replaceAll('-', '');
    }
    const joinHash = await hash(token);
    check(!existing?.blocked || isSiteAdmin(req), '이 방에서 내보내졌어요.', 403);
    const duplicate = await one('SELECT id FROM members WHERE room_id=? AND name=?', room.id, name);
    if (duplicate && duplicate.id !== existing?.id && profileEntry) {
      const taken = new Set(
        (await all('SELECT name FROM members WHERE room_id=?', room.id)).map((m) => m.name),
      );
      const base = name;
      for (let n = 2; taken.has(name) && n <= taken.size + 2; n++) {
        const suffix = '·' + n;
        name = base.slice(0, 16 - suffix.length) + suffix;
      }
    } else check(!duplicate || duplicate.id === existing?.id, '이미 사용 중인 닉네임이에요.');
    if (existing) {
      if (!existing.chat_seen || now - existing.last_seen >= 90000)
        await presenceNotice(existing, now);
      if (existing.name !== name || existing.avatar !== avatar)
        await run('UPDATE members SET name=?,avatar=? WHERE id=?', name, avatar, existing.id);
    } else {
      const inserted = await run(
        'INSERT OR IGNORE INTO members(id,room_id,token_hash,name,avatar,last_seen,account_id,last_active) SELECT ?,?,?,?,?,?,?,? WHERE (?=1 OR (SELECT COUNT(*) FROM members WHERE room_id=? AND blocked=0)<40)',
        id,
        room.id,
        joinHash,
        name,
        avatar,
        now,
        owner,
        now,
        isSiteAdmin(req) ? 1 : 0,
        room.id,
      );
      if (!inserted.meta.changes && profileEntry) {
        const concurrent = await findMember(req, room.id);
        if (concurrent && (!concurrent.blocked || isSiteAdmin(req))) existing = concurrent;
      }
      check(inserted.meta.changes || existing, '이 방은 최대 40명까지 참여할 수 있어요.');
    }
    if (b.spectator === true) {
      const changedRole = await run(
        "UPDATE members SET spectator=1 WHERE id=? AND NOT EXISTS(SELECT 1 FROM plays WHERE round_id=? AND member_id=members.id AND guesses<>'[]')",
        existing?.id || id,
        room.current_round_id,
      );
      check(changedRole.meta.changes, '이미 제출한 판에는 관전할 수 없어요.', 409);
      await trackSpectator(
        { ...existing, id: existing?.id || id, spectator: 1 },
        room.current_round_id,
      );
    }
    return entered(room.id);
  }
  return null;
}
export async function handleRoomManagement(
  req: Request,
  b: any,
  m: any,
  room: any,
  mode: string,
  readState: StateReader,
): Promise<Response | null> {
  if (b.action === 'rename') {
    const name = typeof b.name === 'string' ? b.name.trim().slice(0, 16) : '';
    check(name, '닉네임을 입력해 주세요.');
    const result = await run(
      'UPDATE members SET name=? WHERE id=? AND NOT EXISTS(SELECT 1 FROM members WHERE room_id=? AND name=? AND id<>?)',
      name,
      m.id,
      room.id,
      name,
      m.id,
    );
    check(result.meta.changes, '이미 사용 중인 닉네임이에요.');
    return reply(await readState(req, room.id, mode));
  }
  if (['transfer', 'kick', 'rotate_invite'].includes(b.action)) {
    check(room.host_id === m.id || isSiteAdmin(req), '방장만 사용할 수 있어요.', 403);
    if (b.action === 'rotate_invite') {
      const changed = await run(
        'UPDATE rooms SET invite_code=? WHERE id=? AND host_id=?',
        key(),
        room.id,
        room.host_id,
      );
      check(changed.meta.changes, '방장이 변경됐어요.', 409);
      return reply(await readState(req, room.id, mode));
    }
    const target = await one(
      'SELECT * FROM members WHERE id=? AND room_id=? AND blocked=0',
      b.memberId,
      room.id,
    );
    check(
      target && (target.id !== m.id || (isSiteAdmin(req) && b.action === 'transfer')),
      '다른 참가자를 선택해 주세요.',
    );
    if (b.action === 'kick')
      check(
        !target.account_id ||
          !(
            isAdminAccount(target.account_id) ||
            (await one(
              'SELECT account_id FROM linked_game_accounts WHERE account_id=? AND is_admin=1',
              target.account_id,
            ))
          ),
        '관리자는 내보낼 수 없어요.',
        403,
      );
    if (b.action === 'transfer') {
      const changed = await run(
        'UPDATE rooms SET host_id=? WHERE id=? AND host_id=?',
        target.id,
        room.id,
        room.host_id,
      );
      check(changed.meta.changes, '방장이 이미 변경됐어요.', 409);
    } else {
      const changed = await run(
        `UPDATE members SET blocked=1 WHERE id=? AND room_id=? AND blocked=0 AND EXISTS(SELECT 1 FROM rooms WHERE id=? AND host_id=? AND host_id<>?)`,
        target.id,
        room.id,
        room.id,
        room.host_id,
        target.id,
      );
      check(changed.meta.changes, '방장이 변경됐거나 이미 내보낸 참가자예요.', 409);
      await run(
        "DELETE FROM live_participants WHERE member_id=? AND round_id IN(SELECT id FROM rounds WHERE room_id=? AND phase='lobby')",
        target.id,
        room.id,
      );
    }
    return reply(await readState(req, room.id, mode));
  }
  return null;
}
