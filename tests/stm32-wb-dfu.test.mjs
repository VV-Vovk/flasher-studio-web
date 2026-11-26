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

import {wbRadioStagingPlan,WbDfuRadioStage} from '../public/stm32-wb-dfu.js';
import {WB_RADIO_FILES} from '../public/wb-radio-catalog.js';
const stageSnap={...snap,sfr:244,srrvr:0x80ffd000};
const stageRadio={fus:{major:2,minor:1,patch:0},lastFusState:0,lastWirelessState:0,wireless:null,stackType:0};
const stageFile='stm32wb5x_FUS_fw.bin';
const appEnd=0x08008000;
test('radio staging uses live SFSA and checks protection of the actual high Flash range',()=>{
 const make=(s=stageSnap,r=stageRadio,d=desc(244),end=appEnd)=>wbRadioStagingPlan(name,stageFile,end,s,d,r,true);
 const p=make();assert.equal(p.start,0x080ee000);assert.equal(p.end,0x080f4000);assert.equal(p.size,24468);assert.equal(p.installationAllowed,false);
 assert.throws(()=>make({...stageSnap,sfr:243}),/SFSA/);
 assert.throws(()=>make({...stageSnap,wrp:[0x00ee00ee,0xff]}),/WRP/);
 assert.throws(()=>make({...stageSnap,pcrop:[[476,476],[0x1ff,0]]}),/PCROP/);
 assert.throws(()=>make(stageSnap,{...stageRadio,wireless:{major:1}}),/no installed/);
 assert.throws(()=>make(stageSnap,{...stageRadio,lastFusState:2}),/idle/);
 assert.throws(()=>make(stageSnap,stageRadio,desc(243)),/descriptor/);
 assert.throws(()=>make(stageSnap,stageRadio,desc(244),0x080ef000),/пересекает/);
});
class FakeRadioStage extends WbDfuRadioStage{
 constructor(){
  super({},0,wbProfile(name),[]);
  this.fixture=new FakeWbDfu();this.memory=this.fixture.memory;this.calls=[];
  this.fixture.regs.set(0x58004080,244);this.fixture.regs.set(0x58004084,0x80ffd000);
  this.memory.fill(255,0xee000,0xf4000);
  this.device={controlTransferOut:async(setup,b)=>{
   assert.equal(setup.request,1);
   if(setup.value===0&&b.length===1&&b[0]===0x53){this.upgrades=(this.upgrades||0)+1;if(this.disconnect)throw Error('simulated reset');return {status:'ok',bytesWritten:1};}
   assert.equal(setup.value,2);
   assert.ok(this.addr>=0x080ee000&&this.addr+b.length<=0x080f4000);
   this.calls.push(this.addr);this.memory.set(b,this.addr-0x08000000);
   if(this.change)this.fixture.regs.set(0x58004080,243);
   return {status:'ok',bytesWritten:b.length};
  }};
 }
 async identify(){return 'fixture';}
 async read(a,n){
  if(a===0xffff0054){this.queries=(this.queries||0)+1;return Uint8Array.of(this.busy?0x10:0,0);}
  const b=await this.fixture.read(a,n);
  if(this.corrupt&&this.calls.length&&a===0x080ee000)b[0]^=1;
  return b;
 }
 async idle(){}
 async pointer(a){this.addr=a;}
 async download(block,data){await this.output(1,data,block);}
}
test('stage transport: synthetic binary, mocked catalogue digest, exact readback and no erase or activation',async()=>{
 const entry=WB_RADIO_FILES['5x'].find(e=>e.name===stageFile),bytes=new Uint8Array(entry.size).fill(0xa5);
 // Test transport only: explicitly simulate successful catalogue identity;
 // real catalogue verification is exercised by separate rejection tests.
 const original=Object.getOwnPropertyDescriptor(globalThis,'crypto');
 Object.defineProperty(globalThis,'crypto',{configurable:true,value:{subtle:{async digest(alg){return alg==='SHA-1'?Uint8Array.from(entry.blob.match(/../g),x=>parseInt(x,16)).buffer:new Uint8Array(32).buffer;}}}});
 const options={file:stageFile,bytes,applicationEnd:appEnd,acknowledge:true};
 try{
  let s=new FakeRadioStage(),r=await s.stage(name,desc(244),options,()=>true);
  assert.equal(r.staged,true);assert.equal(r.installed,false);assert.equal(r.activationAllowed,false);
  assert.deepEqual(s.memory.slice(0xee000,0xee000+bytes.length),bytes);
  assert.ok(s.memory.slice(0,0xee000).every(x=>x===0x5a));
  assert.ok(s.memory.slice(0xf4000).every(x=>x===0x5a));
  await assert.rejects(s.output(1,Uint8Array.of(0x53),0),/read-only/);
  await assert.rejects(s.output(1,Uint8Array.of(0x41,0,0,0,8),0),/read-only/);
  await assert.rejects(s.stage(name,desc(244),options,()=>true),/already used/);
  s=new FakeRadioStage();r=await s.stage(name,desc(244),options,()=>false);assert.equal(r.cancelled,true);assert.equal(s.calls.length,0);
  s=new FakeRadioStage();s.memory[0xf3000]=0;await assert.rejects(s.stage(name,desc(244),options,()=>true),/not blank/);assert.equal(s.calls.length,0);
  s=new FakeRadioStage();s.change=true;await assert.rejects(s.stage(name,desc(244),options,()=>true),/changed/);
  s=new FakeRadioStage();s.corrupt=true;await assert.rejects(s.stage(name,desc(244),options,()=>true),/readback mismatch/);
 }finally{if(original)Object.defineProperty(globalThis,'crypto',original);else delete globalThis.crypto;}
});

test('blank-target FUS upgrade: separate approval, one-shot command, safe reconnect boundary',async()=>{
 const entry=WB_RADIO_FILES['5x'].find(e=>e.name===stageFile),bytes=new Uint8Array(entry.size).fill(0xa5),options={file:stageFile,bytes,applicationEnd:0x08000000,acknowledge:true};
 const original=Object.getOwnPropertyDescriptor(globalThis,'crypto');
 Object.defineProperty(globalThis,'crypto',{configurable:true,value:{subtle:{async digest(alg){return alg==='SHA-1'?Uint8Array.from(entry.blob.match(/../g),x=>parseInt(x,16)).buffer:new Uint8Array(32).buffer;}}}});
 const fresh=()=>{const s=new FakeRadioStage();s.memory.fill(255,0,0xf4000);return s;};
 const run=(s,activate=()=>true,opts=options)=>s.stage(name,desc(244),opts,()=>true,()=>{},activate);
 try{
  let s=fresh(),r=await run(s);assert.equal(r.commandAccepted,true);assert.equal(r.installed,false);assert.equal(s.queries,1);assert.equal(s.upgrades,1);
  await assert.rejects(run(s),/already used/);await assert.rejects(s.output(1,Uint8Array.of(0x53),0),/read-only/);
  s=fresh();s.disconnect=true;r=await run(s);assert.equal(r.outcomeUnknown,true);assert.equal(r.commandAttempted,true);assert.equal(s.upgrades,1);
  s=fresh();s.busy=true;r=await run(s);assert.equal(r.activationBlocked,true);assert.equal(s.upgrades,undefined);
  s=fresh();r=await run(s,()=>false);assert.equal(r.activationCancelled,true);assert.equal(s.queries,undefined);
  const resumed=fresh();resumed.memory.set(bytes,0xee000);r=await run(resumed);assert.equal(r.resumed,true);assert.equal(resumed.calls.length,0);assert.equal(resumed.upgrades,1);
  s=fresh();s.memory[0x8000]=0;await assert.rejects(run(s),/not blank/);assert.equal(s.calls.length,0);
  s=fresh();s.memory[0xee000]=0;await assert.rejects(run(s),/neither blank nor/);assert.equal(s.calls.length,0);
  s=fresh();await assert.rejects(run(s,()=>true,{...options,applicationEnd:appEnd}),/blank CPU1/);assert.equal(s.calls.length,0);
 }finally{if(original)Object.defineProperty(globalThis,'crypto',original);else delete globalThis.crypto;}
});

import {WbDfuRadioDelete,wbDeleteCompletion,wbFusReply,wbRadioWriteCandidate} from '../public/stm32-wb-dfu.js';
test('radio write candidate covers only ROM USB WB35/WB55 and actual densities',()=>{
 for(const n of [name,'STM32WB55CCU6','STM32WB55REV6','STM32WB35CEU6A'])assert.equal(wbRadioWriteCandidate(n),true,n);
 for(const n of ['STM32WB50CGU6','STM32WB15CCU6','STM32WB30CEU6A','STM32WB5MMGH6','STM32WB55'])assert.equal(wbRadioWriteCandidate(n),false,n);
});
test('FUS response decoder never equates busy/error/not-running with idle',()=>{
 assert.equal(wbFusReply(Uint8Array.of(0,0)).phase,'idle');
 for(const n of [0x10,0x21,0x30])assert.equal(wbFusReply(Uint8Array.of(n,0)).phase,'busy');
 assert.equal(wbFusReply(Uint8Array.of(0xff,0xfe)).phase,'not-running');
 assert.equal(wbFusReply(Uint8Array.of(0,6)).phase,'error');
 assert.equal(wbFusReply(Uint8Array.of(0x40,0)).phase,'unknown');
 assert.throws(()=>wbFusReply(Uint8Array.of(0)),/length/);
});
class FakeRadioDelete extends WbDfuRadioDelete{
 constructor(){
  super({},0,wbProfile(name),[]);this.fixture=new FakeWbDfu();this.calls=[];this.hasStack=true;this.uid='fixture';
  this.device={controlTransferOut:async(setup,b)=>{this.calls.push([setup.request,setup.value,...b]);if(this.disconnect)throw Error('reset');return {status:'ok',bytesWritten:b.length};}};
 }
 async identify(){return this.uid;}
 async read(a,n){
  if(a===0xffff0054){this.calls.push(['query']);return this.reply||Uint8Array.of(0,0);}
  const b=await this.fixture.read(a,n);
  if(a===0x20030024&&n===32){
   const v=new DataView(b.buffer);v.setUint32(12,0x02020000,true);
   if(this.hasStack){b[7]=1;v.setUint32(20,0x01180000,true);v.setUint32(24,0x01010010,true);v.setUint32(28,0,true);}
   if(this.running){b[5]=4;b[6]=1;}
  }
  return b;
 }
 async idle(){}
 async download(block,data){await this.output(1,data,block);}
}
test('delete requires replacement digest, idle FUS, explicit approval; single command and same UID verification',async()=>{
 const entry=WB_RADIO_FILES['5x'].find(e=>e.name==='stm32wb5x_BLE_Stack_full_fw.bin'),bytes=new Uint8Array(entry.size).fill(0xa5),options={file:entry.name,bytes,acknowledge:true};
 const original=Object.getOwnPropertyDescriptor(globalThis,'crypto');
 Object.defineProperty(globalThis,'crypto',{configurable:true,value:{subtle:{async digest(alg){return alg==='SHA-1'?Uint8Array.from(entry.blob.match(/../g),x=>parseInt(x,16)).buffer:new Uint8Array(32).buffer;}}}});
 const run=(s,approve=()=>true,o=options)=>s.deleteInstalled(name,desc(240),o,approve);
 try{
  let s=new FakeRadioDelete(),r=await run(s);assert.equal(r.commandAccepted,true);assert.deepEqual(s.calls,[['query'],[1,0,0x52]]);
  await assert.rejects(run(s),/already used/);await assert.rejects(s.output(1,Uint8Array.of(0x52),0),/read-only/);
  let v=new FakeRadioDelete();assert.equal((await v.verifyDelete(name,desc(240),r)).completed,false);
  v=new FakeRadioDelete();v.hasStack=false;assert.equal((await v.verifyDelete(name,desc(240),r)).completed,true);
  v=new FakeRadioDelete();v.hasStack=false;v.reply=Uint8Array.of(0x20,0);assert.equal((await v.verifyDelete(name,desc(240),r)).completed,false);
  v=new FakeRadioDelete();v.uid='another';await assert.rejects(v.verifyDelete(name,desc(240),r),/different device/);assert.deepEqual(v.calls,[]);
  v=new FakeRadioDelete();v.running=true;assert.equal((await v.verifyDelete(name,desc(240),r)).reply.phase,'not-running');assert.deepEqual(v.calls,[]);
  s=new FakeRadioDelete();assert.equal((await run(s,()=>false)).cancelled,true);assert.deepEqual(s.calls,[]);
  s=new FakeRadioDelete();s.running=true;await assert.rejects(run(s),/idle FUS/);assert.deepEqual(s.calls,[]);
  s=new FakeRadioDelete();s.reply=Uint8Array.of(0x10,0);assert.equal((await run(s)).activationBlocked,true);assert.deepEqual(s.calls,[['query']]);
  s=new FakeRadioDelete();s.disconnect=true;assert.equal((await run(s)).outcomeUnknown,true);assert.deepEqual(s.calls,[['query'],[1,0,0x52]]);
  s=new FakeRadioDelete();await assert.rejects(run(s,()=>true,{...options,bytes:new Uint8Array(1)}),/filename/);assert.deepEqual(s.calls,[]);
 }finally{if(original)Object.defineProperty(globalThis,'crypto',original);else delete globalThis.crypto;}
});
test('deletion completion requires idle, unchanged FUS, absent stack and nondecreasing SFSA',()=>{
 const p={kind:'delete',commandAttempted:true,expectedVersion:'2.1.0',oldAppKiB:800},reply=wbFusReply(Uint8Array.of(0,0));
 assert.equal(wbDeleteCompletion(p,stageRadio,reply,976).completed,true);
 assert.equal(wbDeleteCompletion(p,stageRadio,reply,799).completed,false);
 assert.equal(wbDeleteCompletion(p,{...stageRadio,stackType:1},reply,976).completed,false);
 assert.equal(wbDeleteCompletion(p,{...stageRadio,fus:{major:2,minor:2,patch:0}},reply,976).completed,false);
});

import {wbWirelessFooter,wbDirectAddress,WbDfuRadioEnter,readWbCpu1Backup} from '../public/stm32-wb-dfu.js';
test('AN5185 new format footer and placement require exact ST footer, version and NVM gap',()=>{
 const b=new Uint8Array(100),v=new DataView(b.buffer),set=(o,x)=>v.setUint32(o,x,true);
 set(40,0x200);set(48,0x0202);set(52,0x01180000);set(56,0xb10c8b99);set(88,20);set(96,0xd3a12c5e);
 assert.deepEqual(wbWirelessFooter(b,'1.24.0'),{format:2,nvmPages:2,version:'1.24.0',flashPages:2});
 assert.throws(()=>wbWirelessFooter(b,'1.23.0'),/version/);
 set(40,0);assert.throws(()=>wbWirelessFooter(b,'1.24.0'),/NVM/);
 assert.equal(wbDirectAddress(wbProfile(name),240*4096,129460,2),0x080ce000);
 assert.throws(()=>wbDirectAddress(wbProfile(name),4096,8192,2),/insufficient/);
});
test('CPU1 backup reads twice and rejects PCROP, short geometry, and changing bytes',async()=>{
 const s=new FakeWbDfu();const r=await readWbCpu1Backup(s,name,desc(240),4096);
 assert.equal(r.data.length,4096);assert.ok(r.data.every(x=>x===0x5a));assert.equal(r.sha256.length,64);
 await assert.rejects(readWbCpu1Backup(s,name,desc(240),240*4096+4096),/SFSA/);
 s.regs.set(0x58004024,0);await assert.rejects(readWbCpu1Backup(s,name,desc(240),4096),/PCROP/);
});
class FakeEnter extends WbDfuRadioEnter{
 constructor(){super({},0,wbProfile(name),[]);this.fixture=new FakeRadioDelete();this.fixture.running=true;this.calls=0;this.replies=[Uint8Array.of(255,254),Uint8Array.of(0,0)];}
 async identify(){return this.fixture.uid;}
 async read(a,n){if(a===0xffff0054){this.calls++;if(this.disconnect&&this.calls===2)throw Error('reset');return this.replies.shift();}return this.fixture.read(a,n);}
}
test('enter FUS only on explicit approval and NOT_RUNNING response; no command repetition',async()=>{
 let s=new FakeEnter(),r=await s.enter(name,desc(240),()=>true);assert.equal(r.commandAttempted,true);assert.equal(s.calls,2);
 await assert.rejects(s.enter(name,desc(240),()=>true),/used/);
 s=new FakeEnter();s.replies=[Uint8Array.of(16,0)];assert.equal((await s.enter(name,desc(240),()=>true)).activationBlocked,true);assert.equal(s.calls,1);
 s=new FakeEnter();assert.equal((await s.enter(name,desc(240),()=>false)).cancelled,true);assert.equal(s.calls,0);
 s=new FakeEnter();s.disconnect=true;assert.equal((await s.enter(name,desc(240),()=>true)).outcomeUnknown,true);assert.equal(s.calls,2);
 s=new FakeEnter();s.fixture.running=false;assert.equal((await s.enter(name,desc(240),()=>true)).alreadyIdle,true);assert.equal(s.calls,0);
});

import {wbContainsUpgradeMarker} from '../public/stm32-wb-dfu.js';
test('reject possible second upgrade image in preserved CPU1',()=>{
 const b=new Uint8Array(64);assert.equal(wbContainsUpgradeMarker(b),false);
 new DataView(b.buffer).setUint32(12,0xd3a12c5e,true);assert.equal(wbContainsUpgradeMarker(b),true);
});
test('direct new-format upgrade with nonblank CPU1: live address, exact backup, no erase, one command',async()=>{
 const entry=WB_RADIO_FILES['5x'].find(e=>e.name==='stm32wb5x_BLE_Stack_full_fw.bin'),bytes=new Uint8Array(entry.size).fill(0xa5),v=new DataView(bytes.buffer),tag=bytes.length-20,body=tag-20-20;
 v.setUint32(body,0x200,true);v.setUint32(body+8,0x0220,true);v.setUint32(body+12,0x01180000,true);v.setUint32(body+16,0xb10c8b99,true);v.setUint32(tag+8,20,true);v.setUint32(tag+16,0xd3a12c5e,true);
 const start=wbDirectAddress(wbProfile(name),240*4096,bytes.length,2),end=start+Math.ceil(bytes.length/4096)*4096;
 const backup=new Uint8Array(4096).fill(0x5a),options={file:entry.name,bytes,applicationEnd:0x08001000,acknowledge:true,backup,direct:true};
 class Direct extends WbDfuRadioStage{
  constructor(){super({},0,wbProfile(name),[]);this.fixture=new FakeRadioDelete();this.memory=this.fixture.fixture.memory;this.memory.fill(255,4096,240*4096);this.calls=[];this.device={controlTransferOut:async(setup,b)=>{assert.equal(setup.request,1);if(setup.value===0){assert.deepEqual([...b],[0x53]);this.calls.push('upgrade');}else{assert.equal(setup.value,2);assert.ok(this.addr>=start&&this.addr+b.length<=end);this.memory.set(b,this.addr-0x08000000);this.calls.push(this.addr);}return {status:'ok',bytesWritten:b.length};}};}
  async identify(){return 'fixture';}async read(a,n){return this.fixture.read(a,n);}async idle(){}async pointer(a){this.addr=a;}async download(block,b){await this.output(1,b,block);}
 }
 const original=Object.getOwnPropertyDescriptor(globalThis,'crypto');
 Object.defineProperty(globalThis,'crypto',{configurable:true,value:{subtle:{async digest(alg){return alg==='SHA-1'?Uint8Array.from(entry.blob.match(/../g),x=>parseInt(x,16)).buffer:new Uint8Array(32).buffer;}}}});
 try{
  let s=new Direct(),r=await s.stage(name,desc(240),options,()=>true,()=>{},()=>true);
  assert.equal(r.direct,true);assert.equal(r.commandAccepted,true);assert.equal(r.start,start);assert.equal(r.preserveBytes,4096);assert.deepEqual(s.memory.slice(0,4096),backup);assert.deepEqual(s.memory.slice(start-0x08000000,start-0x08000000+bytes.length),bytes);assert.equal(s.calls.filter(x=>x==='upgrade').length,1);
  s=new Direct();s.memory[0]=1;await assert.rejects(s.stage(name,desc(240),options,()=>true,()=>{},()=>true),/backup differs/);assert.equal(s.calls.length,0);
  s=new Direct();s.memory[4096]=1;await assert.rejects(s.stage(name,desc(240),options,()=>true,()=>{},()=>true),/not blank/);assert.equal(s.calls.length,0);
  s=new Direct();await assert.rejects(s.stage(name,desc(240),{...options,backup:null},()=>true,()=>{},()=>true),/exact CPU1 backup/);
 }finally{if(original)Object.defineProperty(globalThis,'crypto',original);else delete globalThis.crypto;}
});
