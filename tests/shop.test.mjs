import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
test('gold accrual, daily bonus, guest linkage, safe purchases and skin propagation',async()=>{
 const db=new DatabaseSync(':memory:'),dir=mkdtempSync(join(tmpdir(),'jamopop-shop-'));
 try{
 for(const f of readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())db.exec(readFileSync('drizzle/'+f,'utf8'));
 const prepare=sql=>({bind(...args){return {run:()=>({meta:{changes:db.prepare(sql).run(...args).changes}})}}});
 globalThis.__shopStore={one:async(sql,...args)=>db.prepare(sql).get(...args)||null,all:async(sql,...args)=>db.prepare(sql).all(...args),database:()=>({prepare,batch:async qs=>{db.exec('BEGIN');try{const r=qs.map(q=>q.run());db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}}})};
 const save=(name,code)=>{const p=join(dir,name+'.mjs');writeFileSync(p,code);return pathToFileURL(p).href};
 const store=save('store','export const {one,all,database}=globalThis.__shopStore;');
 const account=save('account',"export const accountId=r=>r.headers.get('test-user'); export const avatarAccess=async()=>['🐱','🐰','🐻','🦊','🐸'];");
 const compile=(file,name,maps)=>{let s=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;for(const [key,url]of Object.entries(maps))s=s.replaceAll("'"+key+"'",JSON.stringify(url));return save(name,s)};
 const skins=compile('lib/skins.ts','skins',{}),shop=compile('lib/shop.ts','shop',{'./store':store}),{shopState}=await import(shop);
 const {GET,POST}=await import(compile('app/api/shop/route.ts','route',{'@/lib/store':store,'@/lib/account':account,'@/lib/skins':skins,'@/lib/shop':shop}));
 const request=(id,body,origin='https://test.local')=>new Request('https://test.local/api/shop',{method:body?'POST':'GET',headers:{...(id?{'test-user':id}:{}),origin,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 db.exec("INSERT INTO rooms(id,name,host_id,created_at) VALUES('room','QA','m',1),('guestroom','guest','guest',1),('newroom','new','new',1); INSERT INTO profiles(id,name,avatar,created_at) VALUES('A','A','🐱',1),('B','B','🐱',1); INSERT INTO members(id,room_id,token_hash,name,avatar,last_seen,account_id) VALUES('m','room','token','A','🐱',1,'A'),('b','room','btoken','B','🐱',1,'B'),('guest','guestroom','gtoken','guest','🐱',1,NULL);");
 let n=0;
 function play(status='won',mode='daily',member='m',day=0,phase='running',attempts=1){const id='p'+n++;db.prepare('INSERT INTO rounds(id,room_id,mode,answer,starts_at,phase) VALUES(?,?,?,?,?,?)').run(id,'room',mode,'사과',1,phase);db.prepare('INSERT INTO plays(id,round_id,member_id,guesses,status,updated_at,finished_at) VALUES(?,?,?,?,?,?,?)').run(id,id,member,JSON.stringify(Array.from({length:attempts},()=>({letters:['ㅅ'],colors:['gray']}))),status,1760000000000+day*86400000,1760000000000+day*86400000);return id}
 const first=play();assert.equal((await shopState('A')).balance,60);
 db.prepare("UPDATE plays SET status='won' WHERE id=?").run(first);assert.equal((await shopState('A')).balance,60,'repeat finish is idempotent');
 play();assert.equal((await shopState('A')).balance,90,'same day bonus once');play('lost');assert.equal((await shopState('A')).balance,100);
 for(const [status,mode,phase,attempts] of [['won','practice','running',1],['forfeited','daily','running',1],['won','daily','interrupted',1],['lost','daily','running',0]])play(status,mode,'m',0,phase,attempts);
 assert.equal((await shopState('A')).balance,100,'practice, surrender, interruption, zero input excluded');
 play('won','daily','guest');db.exec("UPDATE members SET account_id='A' WHERE id='guest'");assert.equal((await shopState('A')).balance,130,'guest rewards follow linkage without double daily bonus');
 assert.equal((await POST(request('A',{action:'buy',skin:'strawberry-cat',price:0}))).status,409);
 assert.equal((await GET(request(null))).status,401);
 assert.equal((await POST(request('A',{action:'buy',skin:'strawberry-cat'},'https://evil.test'))).status,403);
 assert.equal((await POST(request('B',{action:'equip',skin:'strawberry-cat'}))).status,403);
 for(let i=0;i<6;i++)play();assert.equal((await shopState('A')).balance,310);
 const before=JSON.stringify(db.prepare('SELECT * FROM plays').all());
 const responses=await Promise.all(Array.from({length:4},()=>POST(request('A',{action:'buy',skin:'strawberry-cat'}))));assert.ok(responses.every(r=>r.status===200));assert.equal((await shopState('A')).balance,10);assert.equal((await shopState('A')).owned.length,1,'duplicate buy charged once');
 assert.equal((await POST(request('A',{action:'equip',skin:'strawberry-cat'}))).status,200);
 assert.equal(db.prepare("SELECT skin_id FROM members WHERE id='m'").get().skin_id,'strawberry-cat');assert.equal(db.prepare("SELECT skin_id FROM members WHERE id='guest'").get().skin_id,'strawberry-cat');assert.equal(db.prepare("SELECT skin_id FROM members WHERE id='b'").get().skin_id,null);
 db.exec("INSERT INTO members(id,room_id,token_hash,name,avatar,last_seen,account_id) VALUES('new','newroom','newtoken','new','🐱',1,'A')");assert.equal(db.prepare("SELECT skin_id FROM members WHERE id='new'").get().skin_id,'strawberry-cat','new room membership inherits');
 assert.equal((await POST(request('A',{action:'unequip'}))).status,200);assert.equal((await shopState('A')).equipped,null);assert.equal((await shopState('A')).balance,10);
 assert.equal((await POST(request('A',{action:'buy',skin:'space-penguin'}))).status,403,'locked base rejected');assert.equal(JSON.stringify(db.prepare('SELECT * FROM plays').all()),before,'shop preserves all play records');
 const speedState={puzzles:Array.from({length:5},()=>({status:'won',guesses:[{letters:['ㅅ'],colors:['green']}]}))};
 db.exec("INSERT INTO speed_rounds(id,room_id,theme,answers,starts_at,ends_at) VALUES('speed','room','qa','[]',1,9999999999999)");db.prepare('INSERT INTO speed_plays(round_id,member_id,state,updated_at) VALUES(?,?,?,?)').run('speed','m',JSON.stringify(speedState),1760000000000);
 assert.equal((await shopState('A')).balance,40,'speed bundle rewards once');db.exec("UPDATE speed_plays SET state=state WHERE round_id='speed'");assert.equal((await shopState('A')).balance,40);
 play('won','daily','m',1);assert.equal((await shopState('A')).balance,100,'next Korean day bonus');
 }finally{db.close();delete globalThis.__shopStore;rmSync(dir,{recursive:true,force:true})}
});
