import { accountId, guestToken, tokenHash } from '@/lib/account';
import { one, run } from '@/lib/store';
import {
  STAGES,
  emptySolo,
  expireSolo,
  finishSoloGuess,
  publicSolo,
  unlockedStage,
  type SoloState,
} from '@/lib/solo';
import { chooseSoloWord } from '@/lib/solo-words';
import { splitWord } from '@/lib/game';
import { acceptsGuess } from '@/lib/guess-dictionary';
async function identity(req: Request) {
  const id = accountId(req);
  if (id) return { owner: `account:${id}`, signedIn: true, cookie: '' };
  let token = guestToken(req),
    cookie = '';
  if (!/^[a-f0-9]{64}$/.test(token)) {
    token = [...crypto.getRandomValues(new Uint8Array(32))]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('');
    cookie = `bw_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${new URL(req.url).protocol === 'https:' ? '; Secure' : ''}`;
  }
  return { owner: `guest:${await tokenHash(token)}`, signedIn: false, cookie };
}
const reply = (data: unknown, status = 200, cookie = '') =>
  Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store', ...(cookie ? { 'Set-Cookie': cookie } : {}) },
  });
async function load(owner: string) {
  await run(
    'INSERT INTO solo_progress(owner,state,revision) VALUES(?,?,0) ON CONFLICT(owner) DO NOTHING',
    owner,
    JSON.stringify(emptySolo()),
  );
  return (await one('SELECT state,revision FROM solo_progress WHERE owner=?', owner))!;
}
function view(state: SoloState, signedIn: boolean, includeStages = true) {
  return {
    ...publicSolo(state),
    ...(includeStages ? { stages: STAGES } : {}),
    unlocked: unlockedStage(state),
    signedIn,
    serverNow: Date.now(),
  };
}
export async function GET(req: Request) {
  try {
    const who = await identity(req),
      row = await load(who.owner);
    return reply(
      view(expireSolo(JSON.parse(row.state), Date.now()), who.signedIn),
      200,
      who.cookie,
    );
  } catch (e) {
    console.error('solo read', e);
    return reply({ error: '도전을 불러오지 못했어요. 다시 시도해 주세요.' }, 503);
  }
}
export async function POST(req: Request) {
  try {
    if (req.headers.get('origin') && req.headers.get('origin') !== new URL(req.url).origin)
      return reply({ error: '이 페이지에서 다시 시도해 주세요.' }, 403);
    const raw = await req.text();
    if (raw.length > 2048) return reply({ error: '요청이 너무 길어요.' }, 400);
    let b: any;
    try {
      b = JSON.parse(raw);
    } catch {
      return reply({ error: '잘못된 요청이에요.' }, 400);
    }
    if (!b || typeof b !== 'object') return reply({ error: '잘못된 요청이에요.' }, 400);
    const who = await identity(req);
    if (who.cookie) return reply({ error: '다시 시도해 주세요.' }, 409, who.cookie);
    const row = await load(who.owner),
      state: SoloState = expireSolo(JSON.parse(row.state), Date.now());
    if (b.action === 'start') {
      if (state.active?.status === 'playing')
        return reply({ error: '진행 중인 도전을 먼저 마치거나 포기해 주세요.' }, 409);
      if ((state.active?.id || null) !== (b.previousId || null))
        return reply({ error: '다른 창에서 도전이 변경됐어요.' }, 409);
      const stage = STAGES.find((s) => s.id === b.stage);
      if (!stage || stage.id > unlockedStage(state))
        return reply({ error: '아직 열리지 않은 스테이지예요.' }, 403);
      const answer = chooseSoloWord(stage, state.recent),
        now = Date.now();
      state.recent = [...state.recent, answer].slice(-20);
      state.active = {
        id: crypto.randomUUID(),
        stage: stage.id,
        answer,
        startedAt: now,
        endsAt: stage.seconds ? now + stage.seconds * 1000 : null,
        status: 'playing',
        guesses: [],
        stars: 0,
      };
    } else if (b.action === 'guess' || b.action === 'abandon') {
      const active = state.active;
      if (!active || active.id !== b.runId || active.status !== 'playing')
        return reply({ error: '종료되었거나 다른 도전이에요. 화면을 갱신해 주세요.' }, 409);
      if (b.action === 'abandon') active.status = 'abandoned';
      else {
        if (b.expected !== active.guesses.length)
          return reply({ error: '이미 처리된 입력이에요. 기록을 갱신합니다.' }, 409);
        if (typeof b.word !== 'string' || b.word.length > 32)
          return reply({ error: '단어를 확인해 주세요.' }, 400);
        const letters = splitWord(b.word.trim());
        if (letters.length !== STAGES[active.stage - 1].width || !acceptsGuess(letters, 1))
          return reply({ error: '칸 수에 맞는 사전 단어를 입력해 주세요.' }, 400);
        finishSoloGuess(state, letters, Date.now());
      }
    } else return reply({ error: '요청을 확인해 주세요.' }, 400);
    const saved = await run(
      `UPDATE solo_progress SET state=?,revision=revision+1 WHERE owner=? AND revision=? AND (?<>'guess' OR json_extract(state,'$.active.endsAt') IS NULL OR json_extract(state,'$.active.endsAt')>?)`,
      JSON.stringify(state),
      who.owner,
      row.revision,
      b.action,
      Date.now(),
    );
    if (!saved.meta.changes)
      return reply(
        { error: '다른 창에서 변경됐거나 시간이 종료됐어요. 최신 기록을 불러옵니다.' },
        409,
      );
    // Older clients still receive the catalog until they explicitly opt out.
    return reply(view(state, who.signedIn, req.headers.get('X-Solo-Catalog') !== 'omit'));
  } catch (e) {
    console.error('solo update', e);
    return reply({ error: '저장하지 못했어요. 기록을 확인한 뒤 다시 시도해 주세요.' }, 503);
  }
}
