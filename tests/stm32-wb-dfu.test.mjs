import test from 'node:test';
import assert from 'node:assert/strict';
import {wbDfuPlan,wbRomDfuCandidate} from '../public/stm32-wb-dfu.js';
import {targetCapability} from '../public/target-support.js';
const name='STM32WB55RGV6';
const snap={sfr:240,optr:0x1aa,srrvr:0x8003c000,wrp:[0xff,0xff],pcrop:[[0x1ff,0],[0x1ff,0]]};
function image(n=4097){const b=new Uint8Array(n).fill(255),v=new DataView(b.buffer);v.setUint32(0,0x20001000,true);v.setUint32(4,0x08000009,true);return b;}
const desc=n=>'@Internal Flash /0x08000000/'+n+'*004Kg';
test('WB ROM DFU scope excludes WB10/WB15 and unreviewed modules',()=>{
 for(const n of [name,'STM32WB35CEU6A'])assert.equal(wbRomDfuCandidate(n),true,n);
 for(const n of ['STM32WB30CEU6A','STM32WB50CGU6','STM32WB15CCU6','STM32WB10CCU6','STM32WB1MMCH6','STM32WB5MMGH6','STM32WB55RGVx','STM32WB55RGV','STM32WB55ZZZ6'])assert.equal(wbRomDfuCandidate(n),false,n);
 assert.ok(!targetCapability({fi:5,name},[]).methods.includes('USB DFU'));
});
test('WB DFU plan erases only occupied pages under live SFSA',()=>{
 for(const n of [240,256]){
  const p=wbDfuPlan(name,image(),desc(n),snap);
  assert.equal(p.limit,240*4096);assert.equal(p.span,8192);
  assert.deepEqual(p.erasePages,[{address:0x08000000,size:4096},{address:0x08001000,size:4096}]);
 }
 const p=wbDfuPlan(name,image(4096),desc(240),snap);assert.equal(p.erasePages.length,1);
});
test('WB DFU rejects missing security state, wrong geometry and secure overlap',()=>{
 for(const bad of [null,{}, {...snap,sfr:0},{...snap,optr:0x1bb},{...snap,srrvr:0},{...snap,wrp:[0,0xff]},{...snap,pcrop:[[0,0],[0x1ff,0]]},{...snap,sfr:1.5}]){
  assert.throws(()=>wbDfuPlan(name,image(),desc(240),bad));
 }
 for(const d of [desc(239),desc(257),'@Internal Flash /0x08000000/480*002Kg','@Option Bytes /0x08000000/240*004Kg','@Internal Flash /0x08000000/240*004Ka']){
  assert.throws(()=>wbDfuPlan(name,image(),d,snap));
 }
 assert.throws(()=>wbDfuPlan(name,image(240*4096+1),desc(240),snap),/crosses SFSA/);
});

import {WbDfuReadOnly} from '../public/stm32-wb-dfu.js';
test('WB diagnostic permits only pointer and abort, never destructive DFU commands',async()=>{const calls=[],s=new WbDfuReadOnly({async controlTransferOut(setup,b){calls.push([setup.request,setup.value,...b]);return {status:'ok',bytesWritten:b.length};}},0,{},[]);
 await s.output(1,Uint8Array.of(0x21,0,0,0,8),0);await s.output(6);
 for(const [req,b,v] of [[1,Uint8Array.of(0x41,0,0,0,8),0],[1,Uint8Array.of(0x92),0],[1,Uint8Array.of(1,2),2],[1,new Uint8Array(),0],[4,new Uint8Array(),0]])await assert.rejects(s.output(req,b,v),/read-only/);
 await assert.rejects(s.program());assert.equal(calls.length,2);
});
