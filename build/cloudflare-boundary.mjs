// Never trust Sites identity headers on an independently hosted public Worker.
export function stripUntrustedIdentity(request) {
 const headers = new Headers(request.headers);
 for (const name of [...headers.keys()]) {
  if ((name.toLowerCase().startsWith('oai-authenticated-user-') || name.toLowerCase().startsWith('x-jamopop-'))) headers.delete(name);
 }
 return new Request(request, {headers});
}
export function migrationResponse(request) {
 const url = new URL(request.url);
 if (url.pathname === '/healthz') return Response.json({service:'jamopop',mode:'migration-locked'}, {headers:{'Cache-Control':'no-store'}});
 if (url.pathname.startsWith('/api/') || !['GET','HEAD'].includes(request.method)) {
  return Response.json({error:'이전 검증 중입니다. 기존 사이트를 이용해 주세요.'},{status:503,headers:{'Cache-Control':'no-store','Retry-After':'3600'}});
 }
 return new Response('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>자음모음팝 이전 준비</title><main><h1>자음모음팝</h1><p>새 서버를 준비하고 있어요.</p><p>게임과 기록은 기존 사이트에서 계속 이용할 수 있습니다.</p><a href="/auth/google/start">Google로 로그인</a><br><a href="https://word-office-garam.river2.chatgpt.site/">기존 게임으로 이동</a></main></html>',{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex'}});
}
