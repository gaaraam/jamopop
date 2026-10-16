import test from 'node:test';
import assert from 'node:assert/strict';
import {stripUntrustedIdentity,migrationResponse} from '../../build/cloudflare-boundary.mjs';
test('forged Sites identity is removed, guest session is retained',()=>{
 const r=stripUntrustedIdentity(new Request('https://example.com/api/game',{headers:{'OAI-Authenticated-User-Id':'admin','oai-authenticated-user-email':'fake@example.com',cookie:'bw_session=abc'}}));
 assert.equal(r.headers.get('oai-authenticated-user-id'),null);
 assert.equal(r.headers.get('oai-authenticated-user-email'),null);
 assert.equal(r.headers.get('cookie'),'bw_session=abc');
});
test('all game reads and writes remain locked during migration',()=>{
 for(const method of ['GET','POST','PUT','DELETE'])assert.equal(migrationResponse(new Request('https://example.com/api/game',{method})).status,503);
});
test('health identifies locked mode without database or user records',async()=>{
 assert.deepEqual(await migrationResponse(new Request('https://example.com/healthz')).json(),{service:'jamopop',mode:'migration-locked'});
});
test('landing directs players back to authoritative existing site',async()=>{
 const r=migrationResponse(new Request('https://example.com/'));
 assert.match(await r.text(),/https:\/\/word-office-garam\.river2\.chatgpt\.site\//);
 assert.equal(r.headers.get('X-Robots-Tag'),'noindex');
});
