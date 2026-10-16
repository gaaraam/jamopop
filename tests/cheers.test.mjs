import test from 'node:test';
import assert from 'node:assert/strict';
import {unseenCheers} from '../lib/cheers.ts';
const event=(id,memberId='a',createdAt=10000)=>({id,memberId,name:'같은이름',emoji:'👏',createdAt});
test('routes by stable member ID, not nickname; duplicate poll does not replay',()=>{
 const events=[event('1'),event('2','b')];
 assert.deepEqual(unseenCheers(events,'a',new Set(),10000).map(e=>e.id),['1']);
 assert.deepEqual(unseenCheers(events,'a',new Set(['1']),11000),[]);
});
test('ignores expired and future events and orders new bursts',()=>{
 const events=[event('new','a',11000),event('old','a',10000),event('stale','a',1000),event('future','a',20000)];
 assert.deepEqual(unseenCheers(events,'a',new Set(),12000).map(e=>e.id),['old','new']);
 assert.equal(events[0].id,'new');
});
test('mount snapshot suppresses previous reactions; a new event still plays',()=>{
 const initial=[event('1')],seen=new Set(initial.map(e=>e.id));
 assert.deepEqual(unseenCheers(initial,'a',seen,11000),[]);
 assert.deepEqual(unseenCheers([...initial,event('2','a',11000)],'a',seen,11000).map(e=>e.id),['2']);
});
