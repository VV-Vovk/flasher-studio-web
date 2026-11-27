import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogScope,splitCatalogGroups,catalogBuckets,UNKNOWN_FAMILY,UNKNOWN_CHIP} from '../public/catalog-view.js';
const families=['ESP32','Arduino AVR','STM32','Nordic nRF'],catalog={'ESP32':{'ESP32-C3':['C3 board']},'Arduino AVR':{ATtiny85:['Digispark']},STM32:{F1:['Blue Pill STM32F103']},'Nordic nRF':{nRF52840:['DK']}};
test('catalog scope uses saved target and exact known board; unknown stays unknown',()=>{
 const s=(x,k='app')=>catalogScope(x,k,families,catalog);
 assert.deepEqual(s({family:'ESP32',board:'C3 board'}),{family:'ESP32',chip:'ESP32-C3'});
 assert.deepEqual(s({target:{fi:1,chip:'ATtiny85',board:'Digispark'}},'boot'),{family:'Arduino AVR',chip:'ATtiny85'});
 assert.deepEqual(s({target:{fi:2,chip:'F1',board:'Blue Pill STM32F103'}},'device'),{family:'STM32',chip:'STM32F103C8T6'});
 assert.deepEqual(s({board:'mystery'}),{family:UNKNOWN_FAMILY,chip:UNKNOWN_CHIP});
 assert.deepEqual(s({family:'ESP32',chip:'wrong',board:'C3 board'}),{family:'ESP32',chip:UNKNOWN_CHIP});
});
test('multi-target projects split only for display, preserve original records and exact installation counts',()=>{
 const a={id:'a',family:'ESP32',chip:'ESP32-C3',board:'C3 board',version:'2.0',createdAt:2},b={id:'b',family:'Arduino AVR',chip:'ATtiny85',board:'Digispark',version:'1.0',createdAt:1},c={...a,id:'c',version:'1.0',createdAt:0};
 const groups=[{id:'p',name:'Project',versions:[a,b,c]}],before=JSON.stringify(groups);
 const view=splitCatalogGroups(groups,x=>catalogScope(x,'app',families,catalog),x=>x.id==='b'?['dev2']:['dev1']);
 assert.equal(view.length,2);assert.deepEqual(view.map(g=>g.versions.map(v=>v.id)),[['a','c'],['b']]);assert.deepEqual(view.map(g=>g.used),[1,1]);assert.equal(view[1].latest,b);assert.equal(view[0].id,'p');assert.notEqual(view[0].viewKey,view[1].viewKey);assert.equal(JSON.stringify(groups),before);
 assert.deepEqual(catalogBuckets(view.map(g=>({scope:g.scope,g})),families).map(f=>[f.family,f.count]),[['ESP32',1],['Arduino AVR',1]]);
});
test('family groups omit empty categories and sort chip labels naturally',()=>{
 const entries=['ATtiny85','ATtiny13',UNKNOWN_CHIP].map(chip=>({scope:{family:'Arduino AVR',chip}}));
 const v=catalogBuckets(entries,families);assert.equal(v.length,1);assert.deepEqual(v[0].chips.map(c=>c.chip),['ATtiny13','ATtiny85',UNKNOWN_CHIP]);
});
