import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
test('private room passwords: salted hashing, validation, atomic shared attempt limit and migration preservation',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'room-password-')),db=new DatabaseSync(':memory:');
 try{
 for(const f of readdirSync('drizzle').filter(x=>x.endsWith('.sql')&&!x.startsWith('0025')).sort())db.exec(readFileSync('drizzle/'+f,'utf8'));
 db.exec("INSERT INTO rooms(id,name,host_id,created_at) VALUES('legacy','keep','host',1)");
 db.exec(readFileSync('drizzle/0025_room_passwords.sql','utf8'));
 assert.equal(db.prepare("SELECT name FROM rooms WHERE id='legacy'").get().name,'keep');
 assert.equal(db.prepare("SELECT password_hash FROM rooms WHERE id='legacy'").get().password_hash,null);
 globalThis.__roomPasswordRun=async(sql,...args)=>({meta:{changes:db.prepare(sql).run(...args).changes}});
 let source=ts.transpileModule(readFileSync('lib/room-password.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace("import { run } from './store';","const run=globalThis.__roomPasswordRun;");
 const path=join(dir,'password.mjs');writeFileSync(path,source);const {validRoomPassword,hashRoomPassword,verifyRoomPassword,allowRoomPasswordAttempt}=await import(pathToFileURL(path));
 for(const v of ['',null,{},'123','a'.repeat(33)])assert.equal(validRoomPassword(v),false);
 const first=await hashRoomPassword('테스트1234'),second=await hashRoomPassword('테스트1234');assert.notEqual(first,second);assert.equal(first.includes('테스트'),false);
 assert.equal(await verifyRoomPassword('테스트1234',first),true);assert.equal(await verifyRoomPassword('wrong',first),false);assert.equal(await verifyRoomPassword('테스트1234','malformed'),false);
 const results=await Promise.all(Array.from({length:15},()=>allowRoomPasswordAttempt('room','ip',60000)));assert.equal(results.filter(Boolean).length,10);
 assert.equal(await allowRoomPasswordAttempt('room','ip',119999),false);assert.equal(await allowRoomPasswordAttempt('room','ip',120000),true);
 assert.equal(await allowRoomPasswordAttempt('other','ip',60000),true);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});delete globalThis.__roomPasswordRun;}
});
