import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function module(path,replacements={}){let code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;for(const [from,to] of Object.entries(replacements))code=code.replaceAll(`'${from}'`,JSON.stringify(to));return 'data:text/javascript;base64,'+Buffer.from(code).toString('base64');}
const game=module('lib/game.ts'),extra=module('lib/extra-words.ts'),everyday=module('lib/everyday-words.ts'),five=module('lib/five-letter-words.ts');
const {splitWord}=await import(game),{EVERYDAY_WORDS}=await import(everyday);
const {FIVE_LETTER_WORDS}=await import(five);
const {ALL_WORDS,WORD_COUNTS,randomWord}=await import(module('lib/words.ts',{'./game':game,'./extra-words':extra,'./everyday-words':everyday,'./five-letter-words':five}));
test('new everyday answers are unique dictionary headwords and match supported widths',()=>{
 const allowed=new Set(JSON.parse(readFileSync('public/dictionaries/allowed-words.json','utf8')));
 assert.equal(new Set(EVERYDAY_WORDS).size,EVERYDAY_WORDS.length);
 for(const word of EVERYDAY_WORDS){assert.ok(allowed.has(word),word);assert.ok([5,6,7].includes(splitWord(word).length),word);assert.ok(ALL_WORDS.includes(word),word);}
 for(const width of [5,6,7])assert.equal(WORD_COUNTS[width],ALL_WORDS.filter(w=>splitWord(w).length===width).length);
 console.log('Answer counts',WORD_COUNTS,'total',ALL_WORDS.length);
});
test('selection preserves difficulty and excludes the recent thirty answers',()=>{
 for(const width of [5,6,7]){const recent=ALL_WORDS.filter(w=>splitWord(w).length===width).slice(0,30);for(let i=0;i<100;i++){const word=randomWord(undefined,width,recent);assert.equal(splitWord(word).length,width);assert.ok(!recent.includes(word));}}
});

test('five-jamo expansion adds only unique five-slot headwords without changing six or seven slots',()=>{
 const allowed=new Set(JSON.parse(readFileSync('public/dictionaries/allowed-words.json','utf8')));
 assert.equal(new Set(FIVE_LETTER_WORDS).size,FIVE_LETTER_WORDS.length);
 for(const word of FIVE_LETTER_WORDS){assert.equal(splitWord(word).length,5,word);assert.ok(allowed.has(word),word);assert.ok(ALL_WORDS.includes(word),word);}
 assert.equal(WORD_COUNTS[5],400+FIVE_LETTER_WORDS.length);
 assert.equal(WORD_COUNTS[6],396);assert.equal(WORD_COUNTS[7],210);
});
