import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

test('account ownership, safe claims, privacy, pagination and preservation',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'bw-account-')),db=new DatabaseSync(':memory:');
 try{
 for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync(join('drizzle',f),'utf8'));
 const prepare=sql=>({bind(...args){return {run:()=>({meta:{changes:db.prepare(sql).run(...args).changes}}),sql,args}}});
 const store={adminAccountId:()=>globalThis.__testAdminId||'',one:async(sql,...args)=>db.prepare(sql).get(...args)||null,all:async(sql,...args)=>db.prepare(sql).all(...args),run:async(sql,...args)=>({meta:{changes:db.prepare(sql).run(...args).changes}}),database:()=>({prepare,batch:async queries=>{db.exec('BEGIN');try{const out=queries.map(q=>q.run());db.exec('COMMIT');return out}catch(e){db.exec('ROLLBACK');throw e}}})};
 globalThis.__accountTestStore=store;
 const storePath=join(dir,'store.mjs');writeFileSync(storePath,'export const {one,all,run,database,adminAccountId}=globalThis.__accountTestStore;');
 function module(file,name,extra={}){const input=readFileSync(file,'utf8');const out=ts.transpileModule(input,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replaceAll("'@/lib/guest-solo'",JSON.stringify(pathToFileURL(join(dir,'guest-solo.mjs')).href)).replaceAll("'@/lib/cosmetics'",JSON.stringify(name==='cosmetics.mjs'?'':cosmeticsUrl)).replaceAll("'./store'",JSON.stringify(pathToFileURL(storePath).href)).replaceAll("'@/lib/store'",JSON.stringify(pathToFileURL(storePath).href)).replaceAll("'@/lib/inquiries'",JSON.stringify(pathToFileURL(join(dir,'inquiries.mjs')).href)).replaceAll("'./derived-cache'", JSON.stringify(derivedUrl)).replaceAll("'@/lib/account'", JSON.stringify(extra.account||''));const p=join(dir,name);writeFileSync(p,out);return pathToFileURL(p).href;}
 const derivedPath=join(dir,'derived-cache.mjs');
 writeFileSync(derivedPath,ts.transpileModule(readFileSync('lib/derived-cache.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replaceAll("'./store'",JSON.stringify(pathToFileURL(storePath).href)).replaceAll("'./sync-policy.mjs'",JSON.stringify(pathToFileURL(resolve('lib/sync-policy.mjs')).href)));
 const derivedUrl=pathToFileURL(derivedPath).href;
 const cosmeticsUrl=module('lib/cosmetics.ts','cosmetics.mjs');
 module('lib/guest-solo.ts','guest-solo.mjs');
 const accountUrl=module('lib/account.ts','account.mjs'),{tokenHash,findMember}=await import(accountUrl),{GET,POST}=await import(module('app/api/account/route.ts','route.mjs',{account:accountUrl}));
 const guest='a'.repeat(64),hash=await tokenHash(guest),room='a'.repeat(24),other='b'.repeat(24);
 db.prepare('INSERT INTO rooms(id,name,host_id,created_at) VALUES(?,?,?,?)').run(room,'방','guest',1);
 db.prepare('INSERT INTO rooms(id,name,host_id,created_at) VALUES(?,?,?,?)').run(other,'다른 방','other',1);
 const member=(id,r,token,name,owner=null,blocked=0)=>db.prepare('INSERT INTO members(id,room_id,token_hash,name,avatar,last_seen,account_id,blocked) VALUES(?,?,?,?,?,?,?,?)').run(id,r,token,name,'🐱',1,owner,blocked);
 member('guest',room,hash,'가람');member('other',other,await tokenHash('b'.repeat(64)),'가람','B');
 db.prepare("INSERT INTO rounds(id,room_id,mode,answer,starts_at) VALUES('round',?,'daily','비밀',1)").run(room);
 db.prepare("INSERT INTO plays(id,round_id,member_id,guesses,status,updated_at) VALUES('play','round','guest',?,'playing',1)").run(JSON.stringify([{letters:['ㄱ'],colors:['gray']}]));
 const snapshot=JSON.stringify(db.prepare('SELECT * FROM plays').all());
 const req=(id,token=guest,body)=>new Request('https://test.local/api/account',{method:body?'POST':'GET',headers:{...(id?{'oai-authenticated-user-id':id}:{}),...(token?{cookie:`bw_session=${token}`} :{}),...(body?{'content-type':'application/json',origin:'https://test.local'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 assert.equal((await POST(req(null,guest,{action:'link',name:'가람',avatar:'🐱'}))).status,401);
 assert.equal((await GET(req(null))).status,200);assert.equal((await (await GET(req(null))).json()).signedIn,false);
 assert.equal((await findMember(req(null),room)).id,'guest');
 assert.equal((await POST(req('A',guest,{action:'link',name:'가람',avatar:'🐱',accountId:'B'}))).status,200);
 assert.equal(db.prepare('SELECT account_id FROM members WHERE id=?').get('guest').account_id,'A');
 assert.equal(await findMember(req(null),room),null,'linked cookie requires login');
 assert.equal(await findMember(req('B'),room),null,'another account cannot take cookie record');
 assert.equal((await findMember(req('A',''),room)).id,'guest','cross-device restore');
 assert.equal((await POST(req('A','',{action:'profile',name:'새 기본이름',avatar:'🦊'}))).status,200);
 assert.equal(db.prepare("SELECT avatar FROM members WHERE id='guest'").get().avatar,'🦊');
 assert.equal(db.prepare("SELECT name FROM members WHERE id='guest'").get().name,'가람');
 assert.equal(db.prepare("SELECT avatar FROM members WHERE id='other'").get().avatar,'🐱');
 assert.equal(JSON.stringify(db.prepare('SELECT * FROM plays').all()),snapshot);
 assert.equal((await POST(req('A','',{action:'cosmetics',nameColor:'default',avatarFrame:'none',avatar:'🐰'}))).status,200);
 assert.equal(db.prepare("SELECT avatar FROM members WHERE id='guest'").get().avatar,'🐰');
 assert.equal(db.prepare("SELECT avatar FROM profiles WHERE id='A'").get().avatar,'🐰');
 assert.equal((await POST(req('A','',{action:'cosmetics',nameColor:'default',avatarFrame:'none',avatar:'🦄'}))).status,403);
 db.exec("UPDATE profiles SET skin_id='sleepy-rabbit' WHERE id='A'; UPDATE members SET avatar='🐰' WHERE id='guest'");
 await POST(req('A','',{action:'profile',name:'가람',avatar:'🐰'}));assert.equal(db.prepare("SELECT skin_id FROM members WHERE id='guest'").get().skin_id,'sleepy-rabbit','same species retains skin');
 await POST(req('A','',{action:'profile',name:'가람',avatar:'🐱'}));assert.equal(db.prepare("SELECT skin_id FROM profiles WHERE id='A'").get().skin_id,null,'different species clears old skin');
 assert.equal(db.prepare("SELECT skin_id FROM members WHERE id='guest'").get().skin_id,null);
 const a=await (await GET(req('A',''))).json();assert.equal(a.records.length,1);assert.equal(a.records[0].answer,null,'unfinished answer hidden');assert.equal(a.rooms.length,1);assert.equal(a.stats.completed,0);
 const b=await (await GET(req('B',''))).json();assert.equal(b.records.length,0);assert.equal(b.rooms[0].id,other);
 await POST(req('B',guest,{action:'link',name:'나',avatar:'🐻'}));assert.equal(db.prepare('SELECT account_id FROM members WHERE id=?').get('guest').account_id,'A','cannot steal claimed record');
 assert.equal(JSON.stringify(db.prepare('SELECT * FROM plays').all()),snapshot,'linking does not touch plays');
 member('conflict',room,await tokenHash('c'.repeat(64)),'다른닉');
 const conflict=await (await POST(req('A','c'.repeat(64),{action:'link',name:'가람',avatar:'🐱'}))).json();assert.equal(conflict.conflicts,1);assert.equal(conflict.pending,1);assert.equal(db.prepare('SELECT account_id FROM members WHERE id=?').get('conflict').account_id,null);
 assert.equal((await findMember(req(null,'c'.repeat(64)),room)).id,'conflict','conflict stays accessible as guest');
 member('blocked',other,await tokenHash('d'.repeat(64)),'퇴장',null,1);
 await POST(req('A','d'.repeat(64),{action:'link',name:'가람',avatar:'🐱'}));assert.equal((await findMember(req('A',''),other)).blocked,1,'kick survives linkage and device change');
 const cross=new Request('https://test.local/api/account',{method:'POST',headers:{origin:'https://evil.local','oai-authenticated-user-id':'A'},body:JSON.stringify({action:'profile',name:'x',avatar:'🐱'})});assert.equal((await POST(cross)).status,403);
 await POST(req('A','',{action:'profile',name:'새 이름',avatar:'🐻'}));assert.equal(db.prepare('SELECT name FROM members WHERE id=?').get('guest').name,'가람','profile edit preserves room nickname');
 db.prepare("UPDATE plays SET status='won' WHERE id='play'").run();const done=await (await GET(req('A'))).json();assert.equal(done.records[0].answer,'비밀');assert.equal(done.stats.wins,1);
 // Exercise game authorization and account-bound creation/join with actual route code.
 const gameUrl=module('lib/game.ts','game.mjs');
 const inputPath=join(dir,'input.mjs');writeFileSync(inputPath,ts.transpileModule(readFileSync('lib/input.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replaceAll("'./game'",JSON.stringify(gameUrl)));
 const wordsPath=join(dir,'words.mjs');writeFileSync(wordsPath,"export const WORD_COUNTS={5:100};export const randomWord=()=> '사과';");
 const dictPath=join(dir,'dict.mjs');writeFileSync(dictPath,"export const acceptsGuess=()=>true;");
 const gameRoutePath=join(dir,'game-route.mjs');let code=ts.transpileModule(readFileSync('app/api/game/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 for(const [name,url] of Object.entries({'@/lib/room-password':module('lib/room-password.ts','room-password.mjs'),'@/lib/room-invitations':module('lib/room-invitations.ts','room-invitations.mjs',{account:accountUrl}),'@/lib/companions':module('lib/companions.ts','companions.mjs',{account:accountUrl}),'@/lib/competition':module('lib/competition.ts','competition.mjs'),'@/lib/derived-cache':derivedUrl,'@/lib/sync-policy.mjs':pathToFileURL(resolve('lib/sync-policy.mjs')).href,'@/app/api/lobby-chat/route':module('app/api/lobby-chat/route.ts','lobby-chat.mjs',{account:accountUrl}),'@/app/api/announcements/route':module('app/api/announcements/route.ts','announcements.mjs',{account:accountUrl}),'@/lib/party':module('lib/party.ts','party.mjs'),'@/lib/inquiries':module('lib/inquiries.ts','inquiries.mjs',{account:accountUrl}),'@/lib/round-timer':pathToFileURL(resolve('lib/round-timer.ts')).href,'@/lib/cosmetics':cosmeticsUrl,'@/lib/account':accountUrl,'@/lib/store':pathToFileURL(storePath).href,'@/lib/game':gameUrl,'@/lib/input':pathToFileURL(inputPath).href,'@/lib/words':pathToFileURL(wordsPath).href,'@/lib/guess-dictionary':pathToFileURL(dictPath).href}))code=code.replaceAll("'"+name+"'",JSON.stringify(url));
 writeFileSync(gameRoutePath,code);const gameApi=await import(pathToFileURL(gameRoutePath).href);
 const gameReq=(id,token,body,query='')=>new Request('https://test.local/api/game'+query,{method:body?'POST':'GET',headers:{...(id?{'oai-authenticated-user-id':id}:{}),...(token?{cookie:`bw_session=${token}`} :{}),...(body?{'content-type':'application/json',origin:'https://test.local'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 assert.equal((await gameApi.GET(gameReq('A','',null,`?room=${room}`))).status,200);
 const countPresence=()=>db.prepare("SELECT COUNT(*) n FROM chat_messages WHERE member_id='guest' AND system=1").get().n;
 assert.equal(countPresence(),1,'first visit produces a presence notice');
 await Promise.all([gameApi.GET(gameReq('A','',null,`?room=${room}`)),gameApi.GET(gameReq('A','',null,`?room=${room}`))]);
 assert.equal(countPresence(),1,'refresh and parallel polling do not duplicate notices');
 db.prepare("UPDATE members SET last_seen=?,chat_seen=? WHERE id='guest'").run(Date.now()-180000,Date.now()-180000);
 await Promise.all([gameApi.GET(gameReq('A','',null,`?room=${room}`)),gameApi.GET(gameReq('A','',null,`?room=${room}`))]);
 assert.equal(countPresence(),2,'return after absence produces exactly one notice');
 assert.equal((await gameApi.GET(gameReq('B',guest,null,`?room=${room}`))).status,401);
 assert.equal((await gameApi.GET(gameReq('A','',null,`?room=${other}`))).status,403);
 // Public profiles are restricted to this room and return aggregate data only.
 const profileQuery=`?room=${room}&profile=guest`;
 assert.equal((await gameApi.GET(gameReq(null,'',null,profileQuery))).status,401);
 assert.equal((await gameApi.GET(gameReq('B','',null,profileQuery))).status,401);
 assert.equal((await gameApi.GET(gameReq('A','',null,`?room=${other}&profile=other`))).status,403);
 assert.equal((await gameApi.GET(gameReq('A','',null,`?room=${room}&profile=other`))).status,404);
 db.exec('SAVEPOINT public_profile');

 member('profile-hidden',room,await tokenHash('1'.repeat(64)),'퇴장',null,1);
 assert.equal((await gameApi.GET(gameReq('A','',null,`?room=${room}&profile=profile-hidden`))).status,404);
 const profilePlay=(id,r,m,mode,status,count)=>{
  db.prepare('INSERT INTO rounds(id,room_id,mode,answer,starts_at) VALUES(?,?,?,?,1)').run(id,r,mode,'비밀');
  db.prepare('INSERT INTO plays(id,round_id,member_id,guesses,status,updated_at) VALUES(?,?,?,?,?,1)').run(id,id,m,JSON.stringify(Array.from({length:count},()=>({letters:['ㄱ'],colors:['gray']}))),status);
 };
 profilePlay('profile-win',other,'blocked','daily','won',3);
 profilePlay('profile-loss',room,'guest','daily','lost',5);
 profilePlay('profile-active',room,'guest','daily','playing',2);
 profilePlay('profile-practice',room,'guest','practice','won',1);
 const publicResponse=await gameApi.GET(gameReq('A','',null,profileQuery)),publicData=await publicResponse.json();
 assert.equal(publicResponse.headers.get('cache-control'),'no-store');
 assert.deepEqual(Object.keys(publicData).sort(),['avatar','level','linked','name','overall','room','skin','title']);
 assert.deepEqual(publicData.overall,{completed:3,wins:2,average:2});
 assert.deepEqual(publicData.room,{completed:2,wins:1,average:1});
 assert.equal(publicData.linked,true);
 assert.equal(JSON.stringify(publicData).includes('비밀'),false);
 member('profile-guest-other',other,await tokenHash('c'.repeat(64)),'게스트');
 profilePlay('profile-guest-play',other,'profile-guest-other','daily','won',2);
 const guestProfile=await (await gameApi.GET(gameReq('A','',null,`?room=${room}&profile=conflict`))).json();
 assert.deepEqual(guestProfile.overall,{completed:1,wins:1,average:2});
 assert.deepEqual(guestProfile.room,{completed:0,wins:0,average:null});
 assert.equal(guestProfile.linked,false);assert.equal(guestProfile.level,null);
 db.exec('ROLLBACK TO public_profile; RELEASE public_profile');
 const made=await gameApi.POST(gameReq('C','',{action:'create',name:'새사람',avatar:'🐻',roomName:'계정방',width:5}));assert.equal(made.status,200);const madeData=await made.json();
 const inquiryRequest={action:'chat_send',room:madeData.roomId,body:'@문의 키보드 문제',requestId:crypto.randomUUID()};
 const inquiryResult=await (await gameApi.POST(gameReq('C','',inquiryRequest))).json();assert(inquiryResult.inquiryId);assert.equal(inquiryResult.messages.filter(m=>!m.system).length,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM chat_messages WHERE system=0').get().n,0);assert.equal(db.prepare('SELECT body FROM inquiries').get().body,'키보드 문제');
 assert.equal((await (await gameApi.POST(gameReq('C','',inquiryRequest))).json()).inquiryId,inquiryResult.inquiryId);
 assert.equal((await gameApi.POST(gameReq('C','',{...inquiryRequest,body:'@문의',requestId:crypto.randomUUID()}))).status,400);
 const normal=await (await gameApi.POST(gameReq('C','',{...inquiryRequest,body:'일반 대화',requestId:crypto.randomUUID()}))).json();assert.equal(normal.messages.filter(m=>!m.system).length,1);
 const newMember=db.prepare('SELECT * FROM members WHERE room_id=?').get(madeData.roomId);assert.equal(newMember.account_id,'C');
 const joined=await gameApi.POST(gameReq('C','',{action:'join',room:madeData.roomId,lobby:true,name:'새사람',avatar:'🐻'}));assert.equal(joined.status,200);assert.equal(db.prepare('SELECT COUNT(*) n FROM members WHERE room_id=?').get(madeData.roomId).n,1);
 const restore=await (await gameApi.GET(gameReq('C','',null,`?room=${madeData.roomId}`))).json();assert.equal(restore.me.id,newMember.id);assert.equal(restore.roster[0].presence,'online');assert.equal(restore.roster[0].linked,true);assert.equal('account_id' in restore.roster[0],false);
 db.prepare('UPDATE members SET last_active=? WHERE id=?').run(Date.now()-30000,newMember.id);
 const away=await (await gameApi.GET(gameReq('C','',null,`?room=${madeData.roomId}&away=1`))).json();assert.equal(away.roster[0].presence,'away');
 member('offline',madeData.roomId,await tokenHash('e'.repeat(64)),'오프라인');const withOffline=await (await gameApi.GET(gameReq('C','',null,`?room=${madeData.roomId}`))).json();assert.equal(withOffline.roster.find(x=>x.id==='offline').presence,'offline');assert.equal(withOffline.roster.find(x=>x.id==='offline').linked,false);
 for(let i=0;i<22;i++){db.prepare("INSERT INTO rounds(id,room_id,mode,answer,starts_at) VALUES(?,?,'daily','사과',?)").run('r'+i,room,i);db.prepare("INSERT INTO plays(id,round_id,member_id,guesses,status,updated_at) VALUES(?,?,'guest',?,'lost',?)").run('p'+i,'r'+i,'[{"letters":["ㄱ"],"colors":["gray"]}]',i+2);}
 const page1=await (await GET(req('A'))).json();assert.equal(page1.records.length,20);assert.equal(page1.nextOffset,20);const page2=await (await GET(new Request('https://test.local/api/account?offset=20',{headers:{'oai-authenticated-user-id':'A'}}))).json();assert.equal(page2.records.length,3);assert.equal(page2.nextOffset,null);assert.equal(new Set([...page1.records,...page2.records].map(x=>x.id)).size,23);


 // XP is derived only from eligible linked plays, including pre-link history.
 const {progressionFromXp,accountProgressions}=await import(accountUrl);
 assert.deepEqual([0,99,100,299,300].map(x=>progressionFromXp(x).level),[1,1,2,2,3]);
 assert.equal(progressionFromXp(100).remaining,200);
 assert.equal(restore.roster[0].level,1);assert.equal(withOffline.roster.find(x=>x.id==='offline').level,null);
 const xpCases=[['won','daily',1],['won','daily',2],['won','daily',3],['won','daily',4],['lost','daily',5],['forfeited','daily',5],['playing','daily',5],['lost','daily',1],['won','practice',1],['won','live',1]];
 for(const [i,[status,mode,count]] of xpCases.entries()){
  db.prepare('INSERT INTO rounds(id,room_id,mode,answer,starts_at) VALUES(?,?,?,?,?)').run('xp-r'+i,madeData.roomId,mode,'사과',i);
  db.prepare('INSERT INTO plays(id,round_id,member_id,guesses,status,updated_at) VALUES(?,?,?,?,?,?)').run('xp-p'+i,'xp-r'+i,'offline',JSON.stringify(Array.from({length:count},()=>({letters:['ㄱ'],colors:['gray']}))),status,i);
 }
 const beforeClaim=JSON.stringify(db.prepare('SELECT * FROM plays').all());
 const linked=await (await POST(req('G','e'.repeat(64),{action:'link',name:'레벨회원',avatar:'🐱'}))).json();
 assert.equal(linked.progression.xp,130);assert.equal(linked.progression.level,2);
 assert.equal(JSON.stringify(db.prepare('SELECT * FROM plays').all()),beforeClaim);
 const repeat=await (await POST(req('G','e'.repeat(64),{action:'link',name:'레벨회원',avatar:'🐱'}))).json();assert.equal(repeat.progression.xp,130,'link retries cannot duplicate XP');
 assert.equal((await accountProgressions(['C','G'])).get('C').xp,0,'accounts remain isolated');
 const leveled=await (await gameApi.GET(gameReq('C','',null,`?room=${madeData.roomId}`))).json();
 assert.equal(leveled.roster.find(x=>x.id==='offline').level,2);assert.equal('account_id' in leveled.roster.find(x=>x.id==='offline'),false);

 assert.equal((await POST(req(null,guest,{action:'cosmetics',nameColor:'blue',avatarFrame:'none'}))).status,401);
 assert.equal((await POST(req('G','',{action:'cosmetics',nameColor:'gold',avatarFrame:'crown',level:99}))).status,403,'client cannot forge unlocked level');
 assert.equal((await POST(req('G','',{action:'cosmetics',nameColor:'bogus',avatarFrame:'none'}))).status,403);
 const equip=await (await POST(req('G','',{action:'cosmetics',nameColor:'blue',avatarFrame:'none'}))).json();assert.deepEqual(equip.cosmetics,{nameColor:'blue',avatarFrame:'none'});
 const again=await (await GET(req('G',''))).json();assert.equal(again.cosmetics.nameColor,'blue','equipment persists across sessions');
 assert.equal((await (await GET(req('C',''))).json()).cosmetics.nameColor,'default','equipment is account scoped');
 const dressed=await (await gameApi.GET(gameReq('C','',null,`?room=${madeData.roomId}`))).json();assert.equal(dressed.roster.find(x=>x.id==='offline').nameColor,'blue');
 const expanded=await POST(req('G','',{action:'profile',name:'레벨회원',avatar:'🦦'}));assert.equal(expanded.status,403,'locked avatar rejected');
 db.prepare('UPDATE profiles SET avatar=? WHERE id=?').run('🦦','G');
 assert.equal((await POST(req('G','',{action:'profile',name:'레벨회원',avatar:'🦦'}))).status,200,'persisted avatar retained');
 assert.equal(JSON.stringify(db.prepare('SELECT * FROM plays').all()),beforeClaim,'cosmetics do not modify gameplay records');

 // Locked characters are checked at every write path; stored choices are retained.
 assert.equal((await gameApi.POST(gameReq('G','',{action:'create',name:'해금검증',avatar:'🦄',roomName:'잠금',width:5}))).status,403);
 assert.equal((await gameApi.POST(gameReq('G','',{action:'join',room:madeData.roomId,lobby:true,name:'새이름',avatar:'🦄'}))).status,403);
 assert.ok((await (await GET(req('G',''))).json()).avatarAccess.includes('🦦'));
 assert.equal((await (await GET(req(null,''))).json()).avatarAccess.length,8);
 // Cross-room admin rights are bound only to configured trusted identity.
 member('ordinary',madeData.roomId,await tokenHash('ordinary-token'),'일반','H');
 globalThis.__testAdminId='G';
 const adminState=await (await gameApi.GET(gameReq('G','',null,`?room=${madeData.roomId}`))).json();
 assert.equal(adminState.room.isAdmin,true);assert.equal(adminState.room.isHost,true);assert.equal(adminState.room.hostId,newMember.id,'admin does not steal host');
 const ordinaryState=await (await gameApi.GET(gameReq('H','',null,`?room=${madeData.roomId}`))).json();assert.equal(ordinaryState.room.isHost,false);
 assert.equal((await gameApi.POST(gameReq('H','',{action:'force_reset',room:madeData.roomId,roundId:adminState.round.id,isAdmin:true}))).status,403);
 assert.equal((await gameApi.POST(gameReq('C','',{action:'kick',room:madeData.roomId,memberId:'offline'}))).status,403,'host cannot kick global admin');
 db.prepare('INSERT INTO plays(id,round_id,member_id,guesses,status,updated_at) VALUES(?,?,?,?,?,?)').run('admin-preserve',adminState.round.id,'ordinary','[{"letters":["ㄱ"],"colors":["gray"]}]','playing',1);
 const preserved=db.prepare('SELECT guesses FROM plays WHERE id=?').get('admin-preserve').guesses;
 assert.equal((await gameApi.POST(gameReq('G','',{action:'reset',room:madeData.roomId,roundId:adminState.round.id}))).status,409,'ordinary reset still respects active play');
 assert.equal((await gameApi.POST(gameReq('G','',{action:'force_reset',room:madeData.roomId,roundId:adminState.round.id}))).status,200);
 assert.equal(db.prepare('SELECT guesses FROM plays WHERE id=?').get('admin-preserve').guesses,preserved);
 assert.equal((await gameApi.POST(gameReq('G','',{action:'rotate_invite',room:madeData.roomId}))).status,200);
 assert.equal((await gameApi.POST(gameReq('G','',{action:'transfer',room:madeData.roomId,memberId:'offline'}))).status,200,'admin can recover host to self');
 assert.equal((await gameApi.POST(gameReq('G','',{action:'kick',room:madeData.roomId,memberId:'ordinary'}))).status,200);
 const fullRoom='c'.repeat(24);db.prepare('INSERT INTO rooms(id,name,host_id,created_at,current_round_id) VALUES(?,?,?,?,?)').run(fullRoom,'정원방','full0',1,'fullRound');
 db.prepare('INSERT INTO rounds(id,room_id,mode,answer,starts_at) VALUES(?,?,?,?,?)').run('fullRound',fullRoom,'daily','사과',1);
 for(let i=0;i<40;i++)member('full'+i,fullRoom,await tokenHash('full'+i),'참가'+i);
 assert.equal((await gameApi.POST(gameReq('H','',{action:'join',room:fullRoom,lobby:true,name:'일반',avatar:'🐱'}))).status,400);
 assert.equal((await gameApi.POST(gameReq('G','',{action:'join',room:fullRoom,lobby:true,name:'관리자',avatar:'🐱'}))).status,200,'admin may enter a full room for recovery');
 // Archival only changes discoverability; records, membership and ongoing play survive.
 const beforeArchive=JSON.stringify(db.prepare('SELECT * FROM plays ORDER BY id').all());
 assert.equal((await gameApi.POST(gameReq('H','',{action:'archive_room',room:fullRoom,isAdmin:true}))).status,403);
 assert.equal((await gameApi.GET(gameReq('H','',null,'?lobby=1&archived=1'))).status,403);
 assert.equal((await gameApi.POST(gameReq('G','',{action:'archive_room',room:fullRoom}))).status,200);
 const openRooms=await (await gameApi.GET(gameReq(null,'',null,'?lobby=1'))).json();assert.ok(!openRooms.rooms.some(r=>r.id===fullRoom));
 const archivedRooms=await (await gameApi.GET(gameReq('G','',null,'?lobby=1&archived=1'))).json();assert.ok(archivedRooms.rooms.some(r=>r.id===fullRoom));assert.equal(archivedRooms.isAdmin,true);
 assert.equal((await gameApi.GET(gameReq('G','',null,`?room=${fullRoom}`))).status,200,'existing room access stays intact');
 assert.equal(JSON.stringify(db.prepare('SELECT * FROM plays ORDER BY id').all()),beforeArchive);
 assert.equal((await gameApi.POST(gameReq('G','',{action:'restore_room',room:fullRoom}))).status,200);
 assert.ok((await (await gameApi.GET(gameReq(null,'',null,'?lobby=1'))).json()).rooms.some(r=>r.id===fullRoom));
 assert.equal(JSON.stringify(db.prepare('SELECT * FROM plays ORDER BY id').all()),beforeArchive);
 globalThis.__testAdminId='';assert.equal((await (await gameApi.GET(gameReq('G','',null,`?room=${fullRoom}`))).json()).room.isAdmin,false,'unset configuration fails closed');

 const beforeReward=await (await GET(req('A'))).json();
 db.prepare('INSERT INTO speed_rounds(id,room_id,theme,answers,starts_at,ends_at) VALUES(?,?,?,?,?,?)').run('reward-speed',room,'food',JSON.stringify(Array(5).fill('사과')),Date.now()-1000,Date.now()+180000);
 const bundle={current:4,lastSolvedAt:Date.now(),puzzles:Array.from({length:5},()=>({status:'won',guesses:[{letters:['ㅅ','ㅏ','ㄱ','ㅗ','ㅏ'],colors:Array(5).fill('green')}]}))};
 db.prepare('INSERT INTO speed_plays(round_id,member_id,state,updated_at) VALUES(?,?,?,?)').run('reward-speed','guest',JSON.stringify(bundle),Date.now());
 const reward=await (await GET(req('A'))).json();assert.equal(reward.stats.wins,beforeReward.stats.wins+1);assert.equal(reward.stats.completed,beforeReward.stats.completed+1);assert.equal(reward.progression.xp,beforeReward.progression.xp+90);
 const repeated=await (await GET(req('A'))).json();assert.equal(repeated.progression.xp,reward.progression.xp);assert.equal(repeated.stats.wins,reward.stats.wins);

 // New password rooms: both entry routes and spectators require proof; members can reconnect.
 const legacySnapshot=JSON.stringify(db.prepare('SELECT * FROM plays ORDER BY id').all());
 const created=await gameApi.POST(gameReq('A','',{action:'create',name:'host',avatar:'🐱',roomName:'private',width:5,password:'room-secret'}));assert.equal(created.status,200);
 const privateId=(await created.json()).roomId,privateRow=db.prepare('SELECT * FROM rooms WHERE id=?').get(privateId);
 assert.notEqual(privateRow.password_hash,'room-secret');assert(privateRow.password_hash.startsWith('v1:'));
 const info=await (await gameApi.GET(gameReq(null,'',null,`?room=${privateId}&info=1&publicRoom=1`))).json();assert.deepEqual(info,{name:'private',locked:true});
 const privateJoin={action:'join',room:privateId,lobby:true,name:'visitor',avatar:'🐱'};
 assert.equal((await gameApi.POST(gameReq('C','',{...privateJoin}))).status,403);
 assert.equal((await gameApi.POST(gameReq('C','',{...privateJoin,password:'wrong'}))).status,403);
 assert.equal((await gameApi.POST(gameReq('C','',{...privateJoin,password:'room-secret'}))).status,200);
 assert.equal((await gameApi.POST(gameReq('C','',{...privateJoin}))).status,200,'existing member reconnects without password');
 assert.equal((await gameApi.POST(gameReq('D','',{...privateJoin,lobby:false,room:privateRow.invite_code,name:'spectator',spectator:true}))).status,403);
 assert.equal((await gameApi.POST(gameReq('D','',{...privateJoin,lobby:false,room:privateRow.invite_code,name:'spectator',spectator:true,password:'room-secret'}))).status,200);
 assert.equal(JSON.stringify(db.prepare('SELECT * FROM plays ORDER BY id').all()),legacySnapshot,'entry never mutates ongoing plays');
 // End-to-end account API: solo-only guest claims work without any room membership.
 const soloToken='e'.repeat(64),soloOwner='guest:'+await tokenHash(soloToken);
 const soloState={best:{1:3},recent:['수박'],active:null,xp:90};
 db.prepare('INSERT INTO solo_progress(owner,state,revision) VALUES(?,?,0)').run(soloOwner,JSON.stringify(soloState));
 const pendingSolo=await (await GET(req('solo-owner',soloToken))).json();assert.deepEqual(pendingSolo.guestSolo,{pending:true,conflict:false});assert.equal(pendingSolo.pending,0);
 const linkedSoloResponse=await POST(req('solo-owner',soloToken,{action:'link',name:'콩알',avatar:'🐱'}));assert.equal(linkedSoloResponse.status,200);
 const linkedSolo=await linkedSoloResponse.json();assert.equal(linkedSolo.guestSolo.pending,false);assert.equal(linkedSolo.progression.xp,90);
 const repeatedSolo=await (await POST(req('solo-owner',soloToken,{action:'link',name:'콩알',avatar:'🐱'}))).json();assert.equal(repeatedSolo.progression.xp,90,'solo claim cannot double XP');
 assert.equal(JSON.parse(db.prepare('SELECT state FROM solo_progress WHERE owner=?').get('account:solo-owner').state).best[1],3,'solo achievement entitlements survive');
 }finally{db.close();delete globalThis.__accountTestStore;delete globalThis.__testAdminId;rmSync(dir,{recursive:true,force:true})}
});
