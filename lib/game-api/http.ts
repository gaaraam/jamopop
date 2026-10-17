export class UserError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function check(condition: any, message: string, status = 400): asserts condition {
  if (!condition) throw new UserError(message, status);
}
export function reply(data: any, status = 200, token?: string, req?: Request) {
  const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
  if (token)
    headers['Set-Cookie'] =
      `bw_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${req?.url.startsWith('https:') ? '; Secure' : ''}`;
  return Response.json(data, { status, headers });
}
export function failure(e: unknown) {
  if (e instanceof UserError) return reply({ error: e.message }, e.status);
  console.error('game request failed');
  return reply(
    { error: '잠시 연결이 원활하지 않아요. 입력은 그대로 두고 다시 시도해 주세요.' },
    503,
  );
}
