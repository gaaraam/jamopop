import { isSiteAdmin } from '@/lib/account';
import { one, run } from '@/lib/store';
const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
async function current() {
  return (
    (await one(
      'SELECT body,active,revision,updated_at AS updatedAt FROM announcements WHERE id=1',
    )) || { body: '', active: 0, revision: 0, updatedAt: null }
  );
}
export async function GET(req: Request) {
  try {
    const admin = new URL(req.url).searchParams.get('admin') === '1';
    if (admin && !isSiteAdmin(req)) return reply({ error: '관리자만 확인할 수 있어요.' }, 403);
    const data = await current();
    return reply(admin ? data : { announcement: data.active ? data : null });
  } catch {
    return reply({ error: '공지를 불러오지 못했어요.' }, 503);
  }
}
export async function POST(req: Request) {
  if (!isSiteAdmin(req)) return reply({ error: '관리자만 공지할 수 있어요.' }, 403);
  if (req.headers.get('origin') && req.headers.get('origin') !== new URL(req.url).origin)
    return reply({ error: '현재 페이지에서 다시 시도해 주세요.' }, 403);
  try {
    const raw = await req.text();
    if (raw.length > 4096) return reply({ error: '공지는 300자 이내로 입력해 주세요.' }, 400);
    let b: any;
    try {
      b = JSON.parse(raw);
    } catch {
      return reply({ error: '요청을 확인해 주세요.' }, 400);
    }
    if (
      !b ||
      typeof b.body !== 'string' ||
      b.body.trim().length > 300 ||
      typeof b.active !== 'boolean' ||
      (b.active && !b.body.trim()) ||
      !Number.isSafeInteger(b.revision) ||
      b.revision < 0
    )
      return reply({ error: '공지 내용과 상태를 확인해 주세요.' }, 400);
    const result = await run(
      `INSERT INTO announcements(id,body,active,revision,updated_at) SELECT 1,?,?,1,? WHERE ?=0 OR EXISTS(SELECT 1 FROM announcements WHERE id=1) ON CONFLICT(id) DO UPDATE SET body=excluded.body,active=excluded.active,revision=announcements.revision+1,updated_at=excluded.updated_at WHERE announcements.revision=?`,
      b.body.trim(),
      b.active ? 1 : 0,
      Date.now(),
      b.revision,
      b.revision,
    );
    if (!result.meta.changes)
      return reply(
        { error: '다른 창에서 공지가 변경됐어요. 새로고침 후 다시 확인해 주세요.' },
        409,
      );
    return reply(await current());
  } catch {
    return reply({ error: '저장하지 못했어요. 다시 확인해 주세요.' }, 503);
  }
}
