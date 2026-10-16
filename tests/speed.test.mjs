import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {readFileSync,readdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import ts from 'typescript';import {pathToFileURL} from 'node:url';
test('speed rounds: curated pools, countdown, ranking, skips, CAS, deadlines and isolation',async()=>{
 const db=new DatabaseSync(':memory:'),dir=mkdtempSync(join(tmpdir(),'speed-test-'));try{
 for(const f of readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())db.exec(readFileSync('drizzle/'+f,'utf8'));
 globalThis.__speedDB=db;
 writeFileSync(join(dir,'store.mjs'),`export const one=async(s,...v)=>globalThis.__speedDB.prepare(s).get(...v);export const all=async(s,...v)=>globalThis.__speedDB.prepare(s).all(...v);export const run=async(s,...v)=>({meta:{changes:globalThis.__speedDB.prepare(s).run(...v).changes}});`);
 writeFileSync(join(dir,'account.mjs'),`export const findMember=async(r,room)=>globalThis.__speedDB.prepare('SELECT * FROM members WHERE id=? AND room_id=?').get(r.headers.get('test-member'),room);export const isSiteAdmin=()=>false;export const accountProgressions=async()=>new Map();`);
 writeFileSync(join(dir,'chat.mjs'),`export const GET=async()=>Response.json({messages:[],serverNow:Date.now()});`);
 const compile=(file,name,replacements={})=>{let s=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;for(const [a,b]of Object.entries(replacements))s=s.replaceAll(`'${a}'`,JSON.stringify(b));writeFileSync(join(dir,name),s);return pathToFileURL(join(dir,name)).href};
 const gameUrl=compile('lib/game.ts','game.mjs'),speedUrl=compile('lib/speed.ts','speed.mjs',{'./game':gameUrl}),{splitWord}=await import(gameUrl),{SPEED_THEMES,emptySpeed,guessSpeed,advanceSpeed,speedRank,chooseSpeed}=await import(speedUrl);
 const dictionary=JSON.parse(readFileSync('public/dictionaries/allowed-words.json','utf8'));
 for(const t of SPEED_THEMES){assert(t.words.length>=5,t.name);for(const w of t.words){assert(dictionary.includes(w),w);assert([5,6,7].includes(splitWord(w).length))}const selection=chooseSpeed(t.words);assert.equal(new Set(selection).size,5);if(t.words.length>=10)assert(chooseSpeed(t.words,selection).every(w=>!selection.includes(w)))}
 writeFileSync(join(dir,'dict.mjs'),`import {splitWord} from './game.mjs';const allowed=new Set(${JSON.stringify(dictionary)}.map(w=>splitWord(w).join('')));export const acceptsGuess=l=>allowed.has(l.join(''));`);
 const api=await import(compile('app/api/speed/route.ts','route.mjs',{'@/lib/cosmetics':compile('lib/cosmetics.ts','cosmetics.mjs'),'@/lib/competition':compile('lib/competition.ts','competition.mjs',{'./store':'./store.mjs'}),'@/lib/account':'./account.mjs','@/lib/store':'./store.mjs','@/lib/game':gameUrl,'@/lib/speed':speedUrl,'@/lib/guess-dictionary':'./dict.mjs','@/app/api/game/route':'./chat.mjs'}));
 const room='a'.repeat(24);db.prepare('INSERT INTO rooms(id,name,host_id,created_at) VALUES(?,?,?,?)').run(room,'스피드','host',Date.now());
 for(const id of ['host','guest','watch','blocked'])db.prepare('INSERT INTO members(id,room_id,token_hash,name,avatar,last_seen,spectator,blocked) VALUES(?,?,?,?,?,?,?,?)').run(id,room,id,id,'🐱',Date.now(),id==='watch'?1:0,id==='blocked'?1:0);
 const req=(member,body,origin='https://test')=>new Request('https://test/api/speed?room='+room,{method:body?'POST':'GET',headers:{'test-member':member,origin,'Content-Type':'application/json'},...(body?{body:JSON.stringify({room,...body})}:{})});
 const get=async id=>{const r=await api.GET(req(id));assert.equal(r.status,200);return r.json()},post=(id,b)=>api.POST(req(id,b));
 assert.equal((await api.GET(req('nobody'))).status,403);assert.equal((await api.GET(req('blocked'))).status,403);assert.equal((await api.POST(req('host',{action:'start',theme:'food'},'https://evil'))).status,403);assert.equal((await post('guest',{action:'start',theme:'food'})).status,403);
 db.prepare("INSERT INTO rounds(id,room_id,mode,answer,starts_at,ends_at) VALUES('normal',?,'daily','사과',?,?)").run(room,Date.now(),Date.now()+300000);
 db.prepare("UPDATE rooms SET current_round_id='normal' WHERE id=?").run(room);
 db.prepare("INSERT INTO plays(id,round_id,member_id,guesses,updated_at) VALUES('normal-play','normal','guest','[{}]',?)").run(Date.now());
 assert.equal((await post('host',{action:'start',theme:'food'})).status,409,'normal game blocks speed');
 db.prepare("UPDATE plays SET status='won' WHERE id='normal-play'").run();
 const started=await post('host',{action:'start',theme:'food'});assert.equal(started.status,200);let v=await started.json(),r=v.round,answers=JSON.parse(db.prepare('SELECT answers FROM speed_rounds WHERE id=?').get(r.id).answers);
 assert.equal(r.endsAt-r.startsAt,180000);assert.equal(v.play.answers,undefined);assert(!JSON.stringify(v).includes('"words"'));
 assert.equal((await post('host',{action:'guess',roundId:r.id,revision:0,word:answers[0]})).status,400,'countdown enforced');
 assert.equal((await post('host',{action:'start',theme:'food'})).status,409,'cannot restart active round');
 db.prepare('UPDATE speed_rounds SET starts_at=? WHERE id=?').run(Date.now()-1000,r.id);await get('guest');await get('watch');assert.equal(db.prepare("SELECT COUNT(*) n FROM speed_plays WHERE member_id='watch'").get().n,0);
 assert.equal((await post('watch',{action:'guess',roundId:r.id,revision:0,word:answers[0]})).status,403);
 assert.equal((await post('host',{action:'guess',roundId:r.id,revision:0,word:'ㄱㄱㄱㄱㄱ'})).status,400);
 v=await (await post('host',{action:'skip',roundId:r.id,revision:0})).json();assert.equal(v.play.current,1);assert.equal(v.play.puzzles[0].guesses.length,0);
 v=await (await post('host',{action:'select',roundId:r.id,revision:1,index:0})).json();assert.equal(v.play.current,0);
 const parallel=await Promise.all([post('host',{action:'guess',roundId:r.id,revision:2,word:answers[0]}),post('host',{action:'guess',roundId:r.id,revision:2,word:answers[0]})]);assert.deepEqual(parallel.map(x=>x.status).sort(),[200,409]);v=await get('host');assert.equal(v.play.current,1);assert.equal(v.players.find(x=>x.id==='host').solved,1);
 const other=await get('guest');assert.equal(other.play.puzzles[0].guesses.length,0);assert(!('guesses' in other.players.find(x=>x.id==='host')));
 for(let i=1;i<5;i++){const response=await post('host',{action:'guess',roundId:r.id,revision:i+2,word:answers[i]});assert.equal(response.status,200);v=await response.json()};assert.equal(v.play.finished,true);assert.deepEqual(v.play.reward,{wins:1,xp:90});
 assert.equal(db.prepare("SELECT count(*) n FROM plays WHERE round_id=? AND member_id='host' AND status='won'").get(r.id).n,1);
 await get('host');await get('host');assert.equal(db.prepare("SELECT count(*) n FROM plays WHERE round_id=? AND member_id='host'").get(r.id).n,1,'refresh does not duplicate win');assert.equal(v.players.find(x=>x.id==='host').solved,5);
 assert.equal((await post('host',{action:'start',theme:'trip'})).status,409,'unfinished peer blocks early restart');
 db.prepare('UPDATE speed_rounds SET ends_at=? WHERE id=?').run(Date.now()-1,r.id);assert.equal((await post('guest',{action:'guess',roundId:r.id,revision:0,word:answers[0]})).status,409);assert.deepEqual((await get('guest')).play.answers,answers);
 const next=await post('host',{action:'start',theme:'trip'});assert.equal(next.status,200);assert.equal(db.prepare('SELECT COUNT(*) n FROM speed_rounds').get().n,2);assert.equal(db.prepare("SELECT json_array_length(json_extract(state,'$.puzzles[0].guesses')) n FROM speed_plays WHERE member_id='host' AND round_id=?").get(r.id).n,1);
 assert.deepEqual(speedRank([{id:'a',solved:2,lastSolvedAt:30},{id:'b',solved:2,lastSolvedAt:20},{id:'c',solved:3,lastSolvedAt:40}]).map(x=>x.id),['c','b','a']);
 let state=emptySpeed();for(let i=0;i<5;i++)state=guessSpeed(state,Array(5).fill('사과'),'수박',i);assert.equal(state.puzzles[0].status,'lost');assert.equal(state.current,1);
 }finally{db.close();delete globalThis.__speedDB;rmSync(dir,{recursive:true,force:true})}
});
