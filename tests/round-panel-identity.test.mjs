import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

test('round controls and result have distinct React keys across repeated round transitions',()=>{
 const source=ts.createSourceFile('page.tsx',fs.readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const prefixes=new Map();
 function visit(node){
  if(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)){
   const name=node.tagName.getText(source);
   if(['RoundOptions','RoundResult','PartyPanel'].includes(name)){
    const key=node.attributes.properties.find(p=>ts.isJsxAttribute(p)&&p.name.getText(source)==='key');
    assert.ok(key?.initializer&&ts.isJsxExpression(key.initializer),name+' needs identity');
    const expr=key.initializer.expression;
    assert.ok(ts.isTemplateExpression(expr),name+' needs namespaced round identity');
    assert.equal(expr.templateSpans[0].expression.getText(source),'data.round.id');
    prefixes.set(name,expr.head.text);
   }
  }
  ts.forEachChild(node,visit);
 }
 visit(source);
 assert.equal(prefixes.size,3);
 for(let round=1;round<=100;round++){
  const keys=[...prefixes.values()].map(prefix=>prefix+round);
  assert.equal(new Set(keys).size,3,'round '+round+' keys must not collide');
 }
});
