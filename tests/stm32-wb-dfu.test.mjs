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

import {WbDfuApplication} from '../public/stm32-wb-dfu.js';
import {wbProfile} from '../public/stm32-wb.js';
class FakeWbDfu extends WbDfuApplication{
 constructor(){super({},0,wbProfile(name),[]);this.memory=new Uint8Array(1024*1024).fill(0x5a);this.calls=[];this.regs=new Map([[0x58004080,240],[0x58004020,0x1aa],[0x58004084,0x80ffc000],[0x5800402c,0xff],[0x58004030,0xff],[0x58004024,0x1ff],[0x58004028,0],[0x58004034,0x1ff],[0x58004038,0],[0x58004010,0],[0x58004060,0],[0x58004064,0],[0x5800403c,0],[0x20030000,0x20030024]]);this.device={controlTransferOut:async(setup,b)=>{if(setup.request===1&&setup.value===0&&b[0]===0x41){const a=new DataView(b.buffer,b.byteOffset+1,4).getUint32(0,true);assert.ok(a>=0x08000000&&a<0x08000000+240*4096);this.calls.push(['erase',a]);this.memory.fill(255,a-0x08000000,a-0x08000000+4096);if(this.change)this.regs.set(0x58004080,239);}else if(setup.request===1&&setup.value===2){this.calls.push(['write',this.addr]);this.memory.set(b,this.addr-0x08000000);}else throw Error('unexpected command');return {status:'ok',bytesWritten:b.length};}};}
 async identify(){return 'fixture';}
 async read(a,n){if(a>=0x08000000&&a+n<=0x08100000){const b=this.memory.slice(a-0x08000000,a-0x08000000+n);if(this.corrupt&&this.calls.some(x=>x[0]==='write'))b[0]^=1;return b;}if(a===0x20030024&&n===32){const b=new Uint8Array(32),v=new DataView(b.buffer);v.setUint32(0,0xa94656b9,true);b[5]=this.fusBusy?2:0;v.setUint32(12,0x02010000,true);for(const off of [20,24,28])v.setUint32(off,0xffffffff,true);return b;}assert.equal(n,4);assert.ok(this.regs.has(a),'reg '+a.toString(16));const b=new Uint8Array(4);new DataView(b.buffer).setUint32(0,this.regs.get(a),true);return b;}
 async idle(){}
 async pointer(a){this.addr=a;}
 async download(block,data){await this.output(1,data,block);}
}
test('DFU application driver verifies occupied pages and preserves tail',async()=>{const s=new FakeWbDfu(),b=image();const r=await s.program(name,b,desc(240),()=>true);assert.equal(r.verified,true);assert.deepEqual(s.calls.filter(x=>x[0]==='erase'),[['erase',0x08000000],['erase',0x08001000]]);assert.deepEqual(s.memory.slice(0,b.length),b);assert.ok(s.memory.slice(b.length,8192).every(x=>x===255));assert.ok(s.memory.slice(8192).every(x=>x===0x5a));await assert.rejects(s.output(1,Uint8Array.of(0x41,0,0,0,8),0),/read-only/);});
test('DFU cancel, FUS busy, changed boundary and corrupt readback cannot report success',async()=>{let s=new FakeWbDfu();assert.equal((await s.program(name,image(),desc(240),()=>false)).cancelled,true);assert.deepEqual(s.calls,[]);s=new FakeWbDfu();s.fusBusy=true;await assert.rejects(s.program(name,image(),desc(240),()=>true),/not reported idle/);assert.deepEqual(s.calls,[]);s=new FakeWbDfu();s.change=true;await assert.rejects(s.program(name,image(),desc(240),()=>true),/security changed/);assert.equal(s.calls.length,1);s=new FakeWbDfu();s.corrupt=true;await assert.rejects(s.program(name,image(),desc(240),()=>true),/readback mismatch/);});

import {WbDfuRadioStart} from '../public/stm32-wb-dfu.js';
class FakeRadioStart extends WbDfuRadioStart{
 constructor(){super({},0,wbProfile(name),[]);this.calls=[];this.fixture=new FakeWbDfu();this.device={controlTransferOut:async(setup,b)=>{this.calls.push([setup.request,setup.value,...b]);return {status:'ok',bytesWritten:b.length};}};}
 async identify(){return 'fixture';}
 async read(a,n){if(a===0xffff0054){this.calls.push(['query']);return Uint8Array.of(this.busy?0x10:0,0);}const b=await this.fixture.read(a,n);if(a===0x20030024&&n===32){const v=new DataView(b.buffer);b[7]=1;v.setUint32(20,0x01180000,true);v.setUint32(24,0x01010010,true);v.setUint32(28,0,true);}return b;}
 async idle(){}
 async download(block,data){await this.output(1,data,block);}
}
test('Radio start uses one explicit FUS state query and one start; no install or auto retry',async()=>{let s=new FakeRadioStart();assert.deepEqual(await s.startInstalled(name,desc(240),()=>true),{commandAccepted:true,runningVerified:false});assert.deepEqual(s.calls,[['query'],[1,0,0x5a]]);await assert.rejects(s.startInstalled(name,desc(240),()=>true),/already used/);await assert.rejects(s.output(1,Uint8Array.of(0x53),0),/read-only/);s=new FakeRadioStart();s.busy=true;await assert.rejects(s.startInstalled(name,desc(240),()=>true),/not idle/);assert.deepEqual(s.calls,[['query']]);s=new FakeRadioStart();assert.equal((await s.startInstalled(name,desc(240),()=>false)).cancelled,true);assert.deepEqual(s.calls,[]);});
test('DFU diagnostic cannot access virtual FUS command address',async()=>{const s=new WbDfuReadOnly({},0,{},[]);await assert.rejects(s.pointer(0xffff0054),/virtual/);await assert.rejects(s.output(1,Uint8Array.of(0x21,0x54,0,0xff,0xff),0),/read-only/);});
