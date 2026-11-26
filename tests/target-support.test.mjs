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
 assert.ok(Object.keys(F0_BASE_PROFILES).length>20);assert.equal(Object.keys(F1_BASE_PROFILES).length,21);
 assert.equal(swdProfile('STM32F031F4P6').pageSize,1024);assert.equal(swdProfile('STM32F071VBT6').pageSize,2048);
 assert.equal(swdProfile('STM32F103C4T6').pid,0x412);assert.equal(swdProfile('STM32F103RET6').pid,0x414);assert.equal(swdProfile('STM32F103RET6').flash,524288);
 assert.equal(swdProfile('STM32F103ZGT6'),null);assert.equal(swdProfile('STM32F091RCT6'),null);
});
