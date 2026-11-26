import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {targetCapability,stmCompile,stmTarget,stmPickerRows,stmTemplateCapability} from '../public/target-support.js';
import {swdProfile,F0_BASE_PROFILES,F1_BASE_PROFILES,F3_BASE_PROFILES} from '../public/stm32-swd.js';
const catalog=JSON.parse(readFileSync(new URL('../public/stm32-targets.json',import.meta.url)));
test('Capabilities separate supported, compile-only, unavailable, and flash-only',()=>{
 const cap=(name,fi=5,other={})=>targetCapability({fi,name,board:name,...other},catalog);
 assert.equal(cap('STM32F070F6P6').state,'both');
 assert.equal(cap('STM32G431CBT6').state,'both');
 assert.equal(cap('STM32G474RET6').state,'both');
 assert.equal(cap('STM32G411CCT6').state,'compile');
 assert.equal(cap('STM32H563ZIT6').state,'none');
 assert.equal(cap('STM32U575RIT6').selectable,false);
 assert.equal(cap('STM32FOOBAR').selectable,false);
 assert.equal(cap('Arduino Nano',2,{arduino:true}).state,'both');
 assert.equal(cap('Arduino Nano Every',2,{arduino:true}).state,'compile');
 assert.equal(cap('Arduino Nano',2,{legacy:true}).state,'flash');
 assert.equal(cap('Arduino Nano Every',2).state,'none');
 assert.equal(cap('Blue Pill STM32F103').state,'both');
 assert.equal(stmTarget('Black Pill F411'),'STM32F411CEU6');
});
test('DFP exact variants, no unrestricted family inference',()=>{
 assert.equal(stmCompile('STM32F030F4P6',catalog),true);
 assert.equal(stmCompile('STM32F030F4Px',catalog),false);
 assert.equal(stmCompile('STM32H563ZIT6',catalog),false);
 assert.equal(stmCompile('STM32F999ZIT6',catalog),false);
});
test('F0 and F103 geometry extensions',()=>{
 assert.ok(Object.keys(F0_BASE_PROFILES).length>20);assert.ok(Object.keys(F1_BASE_PROFILES).length>70);
 assert.equal(swdProfile('STM32F031F4P6').pageSize,1024);assert.equal(swdProfile('STM32F071VBT6').pageSize,2048);
 assert.equal(swdProfile('STM32F103C4T6').pid,0x412);assert.equal(swdProfile('STM32F103RET6').pid,0x414);assert.equal(swdProfile('STM32F103RET6').flash,524288);
 assert.equal(swdProfile('STM32F103ZGT6').flash,1048576);assert.equal(swdProfile('STM32F091RCT6').flash,262144);
});

test('Every F0 and single-bank F1 DFP base entry has a compatible geometry',()=>{
 const rows=catalog.filter(x=>['f0','f1'].includes(x.family)&&x.profile&&/^STM32F[0-9]{3}[A-Z][468BCDEFG]$/.test(x.name));
 assert.ok(rows.length>130);
 for(const x of rows)assert.ok(swdProfile(x.name),x.name);
});
test('F09x final write-protection bit and value/connectivity lines',()=>{
 for(const [name,pid,flash,ram,page] of [
 ['STM32F030CCT6',0x442,256,32,2048],['STM32F098RCT6',0x442,256,32,2048],
 ['STM32F038F6P6',0x444,32,4,1024],['STM32F048C6U6',0x445,32,6,1024],
 ['STM32F058R8T6',0x440,64,8,1024],['STM32F078VBT6',0x448,128,16,2048],
 ['STM32F100RBT6',0x420,128,8,1024],['STM32F100ZET6',0x428,512,32,2048],
 ['STM32F101T6U6',0x412,32,6,1024],['STM32F102C8T6',0x410,64,10,1024],
 ['STM32F105RCT6',0x418,256,64,2048],['STM32F107VCT6',0x418,256,64,2048]]){
  const p=swdProfile(name);assert.equal(p.pid,pid,name);assert.equal(p.flash,flash*1024,name);assert.equal(p.ram,ram*1024,name);assert.equal(p.pageSize,page,name);
 }
 assert.equal(swdProfile('STM32F091RCT6').wrpMask,0xffffffff);
 for(const n of ['STM32F099ZCT6','STM32F103CFT6','STM32F100RGT6'])assert.equal(swdProfile(n),null);
});

test('XL profiles cover all twelve F101/F103 base parts, with exact RAM and two-bank boundaries',()=>{
 const rows=catalog.filter(x=>/^STM32F10[13][RVZ][FG]$/.test(x.name));
 assert.equal(rows.length,12);
 for(const x of rows){const p=swdProfile(x.name);assert.equal(p.pid,0x430);assert.equal(p.controller,'f1-xl');assert.equal(p.bankBoundary,524288);assert.equal(p.flash,(x.name.endsWith('F')?768:1024)*1024);assert.equal(p.ram,(x.name.startsWith('STM32F101')?80:96)*1024);assert.equal(targetCapability({fi:5,name:x.name},catalog).state,'both');}
});
test('Picker hides redundant Tx templates, keeps exact searches and genuinely distinct profiles',()=>{
 const base='STM32F030C6',pattern=base+'Tx',names=[base,pattern];
 assert.deepEqual(stmPickerRows(names,names,'',catalog),[base]);
 assert.deepEqual(stmPickerRows(names,[pattern],base+'T',catalog),[base]);
 assert.deepEqual(stmPickerRows(names,[pattern],base+'Tx',catalog),[base]);
 assert.deepEqual(stmPickerRows(names,[pattern],base+'T6',catalog),[pattern]);
 assert.deepEqual(stmPickerRows(names,[pattern],'F030C6T6',catalog),[pattern]);
 assert.equal(targetCapability({fi:5,name:base+'T6'},catalog).state,'both');
 assert.equal(targetCapability({fi:5,name:pattern},catalog).selectable,false);
 const special=['STM32F334K4','STM32F334K4Tx'];
 assert.deepEqual(stmPickerRows(special,special,'',catalog),special);
});

test('F3 all 69 base catalogue devices have a page controller; unsupported package template remains unavailable',()=>{
 const rows=catalog.filter(x=>x.family==='f3'&&/^STM32F[0-9]{3}[A-Z][468BCDE]$/.test(x.name));
 assert.equal(rows.length,69);assert.equal(Object.keys(F3_BASE_PROFILES).length,rows.length);
 for(const x of rows){const p=swdProfile(x.name);assert.equal(p.controller,'f3-page',x.name);assert.equal(p.core,0xc24);assert.equal(p.pageSize,2048);assert.ok(targetCapability({fi:5,name:x.name},catalog).methods.includes('ST-LINK · SWD'));}
 assert.equal(swdProfile('STM32F303CCT6').pid,0x422);
 assert.equal(swdProfile('STM32F302RET6').pid,0x446);
 assert.equal(swdProfile('STM32F373VBT6').pid,0x432);
 assert.equal(swdProfile('STM32F301K6T6').pid,0x439);
 assert.equal(swdProfile('STM32F334C4T6').pid,0x438);
 assert.equal(swdProfile('STM32F303CCTx'),null);
});

test('Supported templates offer exact-code entry but are never selectable as wildcard targets',()=>{
 const t='STM32G474RETx';
 assert.equal(stmTemplateCapability(t,catalog).state,'both');
 assert.equal(targetCapability({fi:5,name:t},catalog).selectable,false);
 assert.equal(stmTemplateCapability('STM32H563ZITx',catalog),null);
 assert.equal(stmTemplateCapability('STM32F030C6',catalog),null);
 assert.equal(stmTemplateCapability('STM32F334K4Tx',catalog).state,'both');
});
