import test from 'node:test';import assert from 'node:assert/strict';import {rankPlayers} from '../lib/game.ts';
const p=(id,attempts,finishedAt,status='won')=>({id,attempts,finishedAt,status});
test('fewer attempts wins; ties break by earlier server completion; roster stays fixed',()=>{
 const input=[p('slow',2,3000),p('fast',2,1000),p('one',1,5000),p('waiting',0,null,'playing')];
 const result=rankPlayers(input,'daily');
 assert.deepEqual(result.map(x=>x.id),input.map(x=>x.id));
 assert.deepEqual(result.map(x=>x.rank),[3,2,1,undefined]);
 assert.equal(input[0].rank,undefined);
});
test('identical timestamps still yield stable unique ranks; missing time ranks last',()=>{
 const rows=[p('b',2,1000),p('a',2,1000),p('old',2,null)];
 assert.deepEqual(rankPlayers(rows,'daily').map(x=>x.rank),[2,1,3]);
 assert.deepEqual(rankPlayers([...rows].reverse(),'daily').map(x=>x.rank),[3,1,2]);
});
test('legacy live rounds keep completion-time-first ranking',()=>{
 assert.deepEqual(rankPlayers([p('few',1,3000),p('fast',3,1000)],'live').map(x=>x.rank),[2,1]);
});

test('equal attempts prefer unassisted wins, then completion time without reordering cards',()=>{
 const rows=[{...p('hint',2,100),hintUsed:true},p('clean',2,300),{...p('few',1,500),hintUsed:true}];
 assert.deepEqual(rankPlayers(rows,'daily').map(p=>p.rank),[3,2,1]);
 assert.deepEqual(rankPlayers(rows,'live').map(p=>p.rank),[1,2,3]);
});
