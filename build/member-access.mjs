// Called only after the Worker strips untrusted headers and verifies the session.
export function memberAccess(req, env = {}) {
  const id = req.headers.get('oai-authenticated-user-id');
  if (!id) return 'guest';
  if (req.headers.get('x-jamopop-admin') === '1' || id === env.SITE_ADMIN_ACCOUNT_ID) return 'approved';
  return req.headers.get('x-jamopop-approval') === 'approved' ? 'approved' : req.headers.get('x-jamopop-approval') === 'rejected' ? 'rejected' : 'pending';
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
  if (url.pathname === '/api/access' && req.method === 'GET') return Response.json({ status, social: status === 'approved', signedIn: status !== 'guest' }, { headers: { 'Cache-Control': 'private, no-store' } });
  if (status === 'approved' || !restrictedPath(url.pathname)) return null;
  if (url.pathname.startsWith('/api/')) return Response.json({ code: 'MEMBER_APPROVAL_REQUIRED', error: status === 'guest' ? '방과 회원 기능은 가입 후 관리자 승인이 필요해요.' : '관리자 승인 후 이용할 수 있어요.' }, { status: 403, headers: { 'Cache-Control': 'private, no-store' } });
  return new Response(null, { status: 303, headers: { Location: '/personal', 'Cache-Control': 'private, no-store' } });
}
