import test from 'node:test';
import assert from 'node:assert/strict';
import {animateCharacterReaction} from '../lib/character-motion.mjs';
test('reactions respect reduced motion, support missing animation APIs, and cancel on cleanup',()=>{
 const previous=globalThis.matchMedia;let calls=0,cancelled=0;
 const element={animate(){calls++;return {cancel(){cancelled++}}}};
 try{
 globalThis.matchMedia=()=>({matches:true});assert.equal(animateCharacterReaction(element,'win'),undefined);assert.equal(calls,0);
 globalThis.matchMedia=()=>({matches:false});assert.equal(animateCharacterReaction({},'win'),undefined);
 const release=animateCharacterReaction(element,'win');assert.equal(calls,1);release();assert.equal(cancelled,1);
 const next=animateCharacterReaction(element,'cheer');next();assert.equal(cancelled,2);
 }finally{if(previous)globalThis.matchMedia=previous;else delete globalThis.matchMedia}
});
