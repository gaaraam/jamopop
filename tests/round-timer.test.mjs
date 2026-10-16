import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {ROOM_ROUND_MS,deadlinePassed} from '../lib/round-timer.ts';
import {shouldCelebrateWin} from '../lib/rank-feedback.ts';
test('deadline boundary and win transition do not replay history',()=>{
 assert.equal(ROOM_ROUND_MS,300000);assert(!deadlinePassed(null,9999999));assert(!deadlinePassed(300000,299999));assert(deadlinePassed(300000,300000));
 assert(shouldCelebrateWin({roundId:'a',won:false},{roundId:'a',won:true}));
 assert(!shouldCelebrateWin({roundId:'a',won:true},{roundId:'a',won:true}));
 assert(!shouldCelebrateWin({roundId:'a',won:false},{roundId:'b',won:true}));
});
test('real route: shared five-minute deadline, server expiry, reset, legacy and race preservation',async()=>{
 const db=new DatabaseSync(':memory:'),dir=mkdtempSync(join(tmpdir(),'bw-timer-')),realNow=Date.now;let now=2000000000000,crossDeadline=null;
 Date.now=()=>now;
 try{
 for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync(join('drizzle',f),'utf8'));
 const run=async(sql,...args)=>{const r=db.prepare(sql).run(...args);if(crossDeadline&&sql.startsWith('INSERT INTO plays')){now=crossDeadline;crossDeadline=null}return {meta:{changes:r.changes}}};
 const store={run,one:async(sql,...args)=>db.prepare(sql).get(...args)||null,all:async(sql,...args)=>db.prepare(sql).all(...args),database:()=>({prepare:sql=>({bind:(...args)=>({sql,args})}),batch:async qs=>{db.exec('BEGIN');try{const out=[];for(const q of qs)out.push(await run(q.sql,...q.args));db.exec('COMMIT');return out}catch(e){db.exec('ROLLBACK');throw e}}})};
 globalThis.__timerStore=store;
 const urls={};
 function stub(name,code){const p=join(dir,name+'.mjs');writeFileSync(p,code);return pathToFileURL(p).href}
 urls['@/lib/inquiries']=stub('inquiries',`export const inquiryCommand=()=>null,inquiryOwner=async()=>null,createInquiry=async()=>{throw Error('unexpected inquiry in timer test')};`);
 urls['@/lib/room-invitations']=stub('invitations',"export const invitationInbox=async()=>({signedIn:false,items:[]});");
 urls['@/lib/companions']=stub('companions',"export const companions=async()=>({friends:[],recent:[]});");
 urls['@/lib/store']=stub('store','export const {run,one,all,database}=globalThis.__timerStore;');
 urls['@/lib/account']=stub('account',`export const accountId=()=>null,isSiteAdmin=()=>false,isAdminAccount=()=>false,accountProgressions=async()=>new Map(),avatarAccess=async()=>['🐱'];export async function findMember(req,r){return globalThis.__timerStore.one('SELECT * FROM members WHERE room_id=? ORDER BY rowid LIMIT 1',r)}`);
 urls['@/lib/cosmetics']=stub('cosmetics',`export const AVATARS=['🐱'];export const equippedAtLevel=()=>({nameColor:'default',avatarFrame:'none'});`);
 urls['@/lib/words']=stub('words',`export const randomWord=()=> '사과',WORD_COUNTS={5:1};`);
 urls['@/lib/guess-dictionary']=stub('dictionary',`export const acceptsGuess=()=>true;`);
 urls['@/lib/input']=stub('input',`export const inputShape=()=>({valid:true,letters:[]});`);
 urls['@/lib/game']=pathToFileURL(resolve('lib/game.ts')).href;
 urls['@/lib/round-timer']=pathToFileURL(resolve('lib/round-timer.ts')).href;
 function compile(file,name){let code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;for(const [from,to]of Object.entries(urls))code=code.replaceAll("'"+from+"'",JSON.stringify(to));return stub(name,code)}
 urls['./store']=urls['@/lib/store'];
 urls['@/lib/competition']=compile('lib/competition.ts','competition');
 urls['./sync-policy.mjs']=urls['@/lib/sync-policy.mjs']=pathToFileURL(resolve('lib/sync-policy.mjs')).href;
 urls['@/lib/derived-cache']=compile('lib/derived-cache.ts','derived-cache');
 urls['@/app/api/lobby-chat/route']=compile('app/api/lobby-chat/route.ts','lobby-chat');
 urls['@/app/api/announcements/route']=compile('app/api/announcements/route.ts','announcements');
 let partyCode=ts.transpileModule(readFileSync('lib/party.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;for(const [from,to] of Object.entries(urls))partyCode=partyCode.replaceAll(`'${from}'`,JSON.stringify(to));urls['@/lib/party']=stub('party',partyCode);
 let compiled=ts.transpileModule(readFileSync('app/api/game/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 for(const [from,to] of Object.entries(urls))compiled=compiled.replaceAll(`'${from}'`,JSON.stringify(to));
 const {GET,POST}=await import(stub('route',compiled));
 const post=body=>POST(new Request('https://test.local/api/game',{method:'POST',headers:{origin:'https://test.local','content-type':'application/json'},body:JSON.stringify(body)}));
 const get=room=>GET(new Request(`https://test.local/api/game?room=${room}&mode=daily`));
 const created=await (await post({action:'create',roomName:'test',name:'host',avatar:'🐱',width:5})).json();assert(created.roomId);
 const room=created.roomId;let state=await (await get(room)).json();const first=state.round.id,end=state.round.endsAt;
 assert.equal(end-now,300000);assert.equal(state.play.status,'playing');
 now+=200000;assert.equal((await (await get(room)).json()).round.endsAt,end);
 const guessed=await post({action:'guess',room,mode:'daily',roundId:first,word:'바람',expected:0,fast:true});assert.equal(guessed.status,200);const ack=await guessed.json();assert.equal(ack.submitted,true);assert.equal(ack.roundId,first);assert.equal(ack.play.guesses.length,1);assert.equal(ack.play.answer,undefined);assert.equal(ack.weekly,undefined);
 const original=db.prepare('SELECT guesses FROM plays WHERE round_id=?').get(first).guesses;
 assert.equal((await post({action:'guess',room,mode:'daily',roundId:first,word:'바람',expected:0,fast:true})).status,409,'lost response retry cannot spend another attempt');
 assert.equal(db.prepare('SELECT guesses FROM plays WHERE round_id=?').get(first).guesses,original);
 now=end;state=await (await get(room)).json();assert.equal(state.round.expired,true);assert.equal(state.play.status,'lost');assert.equal(state.room.canReset,true);
 assert.equal(db.prepare('SELECT guesses FROM plays WHERE round_id=?').get(first).guesses,original);
 assert.equal((await post({action:'guess',room,mode:'daily',roundId:first,word:'사과',expected:1})).status,409);
 assert.equal((await post({action:'reset',room,roundId:first,width:5})).status,200);
 state=await (await get(room)).json();assert.equal(state.round.endsAt-now,300000);assert.notEqual(state.round.id,first);
 const second=state.round.id;
 // Work begun before the deadline but written after it must not append a guess.
 now=state.round.endsAt-1;crossDeadline=state.round.endsAt;
 assert.equal((await post({action:'guess',room,mode:'daily',roundId:second,word:'사과',expected:0})).status,409);
 assert.equal(db.prepare('SELECT guesses FROM plays WHERE round_id=?').get(second).guesses,'[]');
 // Existing unlimited rounds retain their null deadline, even far in the future.
 db.prepare('UPDATE rounds SET ends_at=NULL WHERE id=?').run(second);now+=100000000;
 state=await (await get(room)).json();assert.equal(state.round.endsAt,null);assert.equal(state.round.expired,false);
 assert.equal((await post({action:'guess',room,mode:'daily',roundId:second,word:'사과',expected:0})).status,200);
 assert.equal((await (await get(room)).json()).play.status,'won');
 const member=db.prepare('SELECT id FROM members WHERE room_id=?').get(room).id;
 db.prepare('INSERT INTO speed_rounds(id,room_id,theme,answers,starts_at,ends_at) VALUES(?,?,?,?,?,?)').run('speed-check',room,'food',JSON.stringify(Array(5).fill('사과')),now,now+180000);
 assert.equal((await post({action:'guess',room,mode:'daily',roundId:second,word:'사과',expected:1})).status,409,'cannot submit normal during speed');
 assert.equal((await post({action:'force_reset',room,roundId:second,width:5})).status,409,'cannot force-switch active speed');
 assert.equal((await (await get(room)).json()).room.activeSpeedId,'speed-check');
 now+=180001;
 assert.equal((await post({action:'reset',room,roundId:second,width:5,variant:'items'})).status,200,'switch after speed deadline');
 assert.equal(db.prepare('SELECT active_speed_id FROM rooms WHERE id=?').get(room).active_speed_id,null);
 }finally{Date.now=realNow;db.close();delete globalThis.__timerStore;rmSync(dir,{recursive:true,force:true})}
});
