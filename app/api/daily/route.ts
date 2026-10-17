import { accountId, guestToken, tokenHash } from '@/lib/account';
import { all, one, run } from '@/lib/store';
import { dailyClock, type DailyView } from '@/lib/daily';
import { score, splitWord, type Guess } from '@/lib/game';
import { acceptsGuess } from '@/lib/guess-dictionary';
import { chooseSoloWord } from '@/lib/solo-words';
const reply = (body: unknown, status = 200, cookie = '') =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', ...(cookie ? { 'Set-Cookie': cookie } : {}) },
  });
async function identity(req: Request) {
  const id = accountId(req);
  if (id) return { owner: `account:${id}`, signedIn: true, cookie: '' };
  let token = guestToken(req),
    cookie = '';
  if (!/^[a-f0-9]{64}$/.test(token)) {
    token = [...crypto.getRandomValues(new Uint8Array(32))]
      .map((n) => n.toString(16).padStart(2, '0'))
      .join('');
    cookie = `bw_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${new URL(req.url).protocol === 'https:' ? '; Secure' : ''}`;
  }
  return { owner: `guest:${await tokenHash(token)}`, signedIn: false, cookie };
}
async function puzzle() {
  const clock = dailyClock(Date.now());
  let row = await one('SELECT * FROM daily_puzzles WHERE day=?', clock.day);
  if (!row) {
    const recent = await all('SELECT answer FROM daily_puzzles ORDER BY day DESC LIMIT 20');
    const answer = chooseSoloWord(
      { id: 1, name: '오늘의 단어', width: 5, attempts: 5, seconds: 0, tier: 'normal' },
      recent.map((r) => r.answer),
    );
    await run(
      'INSERT INTO daily_puzzles(day,answer,resets_at) VALUES(?,?,?) ON CONFLICT(day) DO NOTHING',
      clock.day,
      answer,
      clock.resetsAt,
    );
    row = await one('SELECT * FROM daily_puzzles WHERE day=?', clock.day);
  }
  return row!;
}
function view(p: any, play: any, signedIn: boolean): DailyView {
  const status = play?.status || 'playing';
  return {
    day: p.day,
    resetsAt: p.resets_at,
    signedIn,
    serverNow: Date.now(),
    guesses: JSON.parse(play?.guesses || '[]'),
    status,
    ...(status !== 'playing' ? { answer: p.answer } : {}),
  };
}
export async function GET(req: Request) {
  try {
    const who = await identity(req),
      p = await puzzle();
    const play = await one('SELECT * FROM daily_plays WHERE owner=? AND day=?', who.owner, p.day);
    return reply(view(p, play, who.signedIn), 200, who.cookie);
  } catch (e) {
    console.error('daily read', e);
    return reply({ error: '오늘의 단어를 불러오지 못했어요. 다시 시도해 주세요.' }, 503);
  }
}
export async function POST(req: Request) {
  try {
    if (req.headers.get('origin') && req.headers.get('origin') !== new URL(req.url).origin)
      return reply({ error: '이 페이지에서 다시 시도해 주세요.' }, 403);
    const raw = await req.text();
    if (raw.length > 2048) return reply({ error: '입력을 확인해 주세요.' }, 400);
    let b: any;
    try {
      b = JSON.parse(raw);
    } catch {
      return reply({ error: '입력을 확인해 주세요.' }, 400);
    }
    if (!b || typeof b.word !== 'string' || b.word.length > 32 || !Number.isInteger(b.expected))
      return reply({ error: '입력을 확인해 주세요.' }, 400);
    const who = await identity(req);
    if (who.cookie) return reply({ error: '연결을 확인하고 다시 제출해 주세요.' }, 409, who.cookie);
    const p = await puzzle();
    if (b.day !== p.day)
      return reply({ error: '새로운 날짜의 문제가 열렸어요. 기록을 갱신합니다.' }, 409);
    const letters = splitWord(b.word.trim());
    if (letters.length !== 5 || !acceptsGuess(letters, p.dictionary_version))
      return reply({ error: '5칸에 맞는 사전 단어를 입력해 주세요.' }, 400);
    await run(
      'INSERT INTO daily_plays(owner,day) VALUES(?,?) ON CONFLICT(owner,day) DO NOTHING',
      who.owner,
      p.day,
    );
    const play = await one('SELECT * FROM daily_plays WHERE owner=? AND day=?', who.owner, p.day);
    const guesses: Guess[] = JSON.parse(play!.guesses);
    if (play!.status !== 'playing' || guesses.length !== b.expected || guesses.length >= 5)
      return reply({ error: '이미 처리된 입력이에요. 기록을 갱신합니다.' }, 409);
    const colors = score(letters, splitWord(p.answer));
    guesses.push({ letters, colors });
    const status = colors.every((c) => c === 'green')
      ? 'won'
      : guesses.length === 5
        ? 'lost'
        : 'playing';
    const saved = await run(
      "UPDATE daily_plays SET guesses=?,status=?,revision=revision+1,finished_at=? WHERE owner=? AND day=? AND revision=? AND status='playing' AND ? < (SELECT resets_at FROM daily_puzzles WHERE day=?)",
      JSON.stringify(guesses),
      status,
      status === 'playing' ? null : Date.now(),
      who.owner,
      p.day,
      play!.revision,
      Date.now(),
      p.day,
    );
    if (!saved.meta.changes)
      return reply({ error: '문제가 바뀌었거나 다른 창에서 제출했어요. 기록을 갱신합니다.' }, 409);
    return reply(view(p, { guesses: JSON.stringify(guesses), status }, who.signedIn));
  } catch (e) {
    console.error('daily submit', e);
    return reply({ error: '저장하지 못했어요. 다시 연결해 기록을 확인해 주세요.' }, 503);
  }
}
