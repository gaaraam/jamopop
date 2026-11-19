// Called only after the Worker strips untrusted headers and verifies the session.
export function memberAccess(req) {
  const id = req.headers.get('oai-authenticated-user-id');
  if (!id) return 'guest';
  return 'member';
}
const personalApis = new Set(['/api/access','/api/account','/api/account-deletion','/api/solo','/api/daily','/api/shop','/api/home','/api/home/life','/api/news','/api/announcements','/api/inquiries']);
const personalPages = ['/personal','/solo','/daily','/home','/shop','/news','/support','/privacy','/terms','/how-to-play','/transfer','/account-deletion'];
export function restrictedPath(path) {
  if (path.startsWith('/api/')) return !personalApis.has(path);
  if (path.startsWith('/_next/') || /\.[a-zA-Z0-9]+$/.test(path)) return false;
  return !personalPages.some(p => path === p || path.startsWith(p + '/'));
}
export function accessResponse(req, env) {
  const status = memberAccess(req, env), url = new URL(req.url);
  if (url.pathname === '/api/access' && req.method === 'GET') return Response.json({ status, social: status === 'member', signedIn: status !== 'guest' }, { headers: { 'Cache-Control': 'private, no-store' } });
  if (status === 'member' || !restrictedPath(url.pathname)) return null;
  if (url.pathname.startsWith('/api/')) return Response.json({ code: 'SIGN_IN_REQUIRED', error: '방과 회원 기능은 로그인 후 이용할 수 있어요.' }, { status: 403, headers: { 'Cache-Control': 'private, no-store' } });
  return new Response(null, { status: 303, headers: { Location: '/personal', 'Cache-Control': 'private, no-store' } });
}
