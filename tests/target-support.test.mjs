import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {targetCapability,stmCompile,stmTarget} from '../public/target-support.js';
import {swdProfile,F0_BASE_PROFILES,F1_BASE_PROFILES} from '../public/stm32-swd.js';
const catalog=JSON.parse(readFileSync(new URL('../public/stm32-targets.json',import.meta.url)));
test('Capabilities separate supported, compile-only, unavailable, and flash-only',()=>{
 const cap=(name,fi=5,other={})=>targetCapability({fi,name,board:name,...other},catalog);
 assert.equal(cap('STM32F070F6P6').state,'both');
 assert.equal(cap('STM32G431CBT6').state,'compile');
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
 assert.equal(swdProfile('STM32F103ZGT6'),null);assert.equal(swdProfile('STM32F091RCT6').flash,262144);
});

test('Every F0 and single-bank F1 DFP base entry has a compatible geometry',()=>{
 const rows=catalog.filter(x=>['f0','f1'].includes(x.family)&&x.profile&&/^STM32F[0-9]{3}[A-Z][468BCDE]$/.test(x.name));
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
 for(const n of ['STM32F101RGT6','STM32F103ZFT6','STM32F103ZGT6','STM32F099ZCT6'])assert.equal(swdProfile(n),null);
});
