import test from 'node:test';import assert from 'node:assert/strict';
import {generateKeyPair,SignJWT} from 'jose';
import {verifyGoogleToken,googleAuth,ORIGIN} from '../../build/google-auth.mjs';
const {publicKey,privateKey}=await generateKeyPair('RS256');
async function sign(p={}){return new SignJWT({sub:'123',nonce:'expected',email:'tester@example.test',email_verified:true,...p}).setProtectedHeader({alg:'RS256'}).setIssuer('https://accounts.google.com').setAudience('test-client').setIssuedAt().setExpirationTime('5m').sign(privateKey);}
test('Google identity requires signed token, audience and nonce',async()=>{
 const token=await sign();assert.equal((await verifyGoogleToken(token,'test-client','expected',publicKey)).subject,'123');
 await assert.rejects(verifyGoogleToken(token,'wrong-client','expected',publicKey));
 await assert.rejects(verifyGoogleToken(token,'test-client','wrong-nonce',publicKey));
 await assert.rejects(verifyGoogleToken(await sign({email_verified:false}),'test-client','expected',publicKey));
 const {publicKey:wrong}=await generateKeyPair('RS256');await assert.rejects(verifyGoogleToken(token,'test-client','expected',wrong));
});
test('callback fails before database access without browser-bound state; logout checks origin',async()=>{
 const env={GOOGLE_CLIENT_ID:'id',GOOGLE_CLIENT_SECRET:'secret',DB:{prepare(){throw Error('must not reach DB');}}};
 assert.equal((await googleAuth(new Request(ORIGIN+'/auth/google/callback?code=untrusted'),env)).status,400);
 assert.equal((await googleAuth(new Request(ORIGIN+'/auth/logout',{method:'POST',headers:{origin:'https://evil.test'}}),env)).status,403);
 assert.equal((await googleAuth(new Request(ORIGIN+'/auth/google/start'),{})).status,503);
});
