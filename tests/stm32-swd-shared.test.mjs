import test from 'node:test';
import assert from 'node:assert/strict';
import {Stm32SwdSession,swdProfile,STLINK_F0_PROFILES,STLINK_F1_PROFILES} from '../public/stm32-swd.js';
import {StLinkF1,StLinkF0,stLinkProfile} from '../public/extra-programmers.js';
import {DapStm32,openCmsisDap,openCmsisDapHid} from '../public/cmsis-dap.js';
const BASE=0x08000000,SR=0x4002200c,CR=0x40022010,AR=0x40022014,KEY=0x40022004;
function memory(pr){
 const bytes=new Uint8Array(pr.flash).fill(0),uid=Uint8Array.from({length:12},(_,i)=>i+1), regs=new Map([[pr.idReg||0xe0042000,pr.pid],[0xe000ed00,pr.idReg?0x410cc200:0x410fc230],[CR,128],[SR,0],[0x4002201c,0],[0x40022020,0xffffffff],[0xe000edf0,0],[0x40021000,3]]);
 const size=new Uint8Array(4);new DataView(size.buffer).setUint16(pr.sizeReg%4,pr.flash/1024,true);const reads=new Map([[pr.sizeReg&~3,size]]);
 for(let i=0;i<12;i+=4)reads.set(pr.uid+i,uid.slice(i,i+4));
 let erased=0;
 return {bytes,regs,get erased(){return erased;},device:{},readWord:async a=>{
  if(regs.has(a))return regs.get(a);let b=reads.get(a)||((a>=BASE&&a<BASE+pr.flash)?bytes.slice(a-BASE,a-BASE+4):null);if(!b)throw Error('unexpected register '+a.toString(16));return new DataView(b.buffer,b.byteOffset,4).getUint32(0,true);
 },writeWord:async(a,v)=>{
  if(a===KEY){if(v===0xcdef89ab)regs.set(CR,0);return;}
  if(a===0xe000edf0){regs.set(a,1<<17);return;}
  if(a===SR){regs.set(a,regs.get(a)&~v);return;}
  if(a===CR&&v===0x42){let offset=regs.get(AR)-BASE;assert.ok(offset>=0&&offset+pr.pageSize<=pr.flash);bytes.fill(255,offset,offset+pr.pageSize);regs.set(SR,32);erased++;}
  if(a===CR&&v===0x44){bytes.fill(255);regs.set(SR,32);erased++;}
  regs.set(a,v);
 },writeHalf:async(a,v)=>{assert.equal(regs.get(CR),1);assert.ok(a>=BASE&&a+2<=BASE+pr.flash);bytes[a-BASE]=v&255;bytes[a-BASE+1]=v>>>8;regs.set(SR,32);}};
}
test('Both adapters share exactly one profile registry and Flash algorithm',()=>{
 for(const [name,pr] of Object.entries({...STLINK_F0_PROFILES,...STLINK_F1_PROFILES})){
  assert.equal(stLinkProfile(name),swdProfile(name));assert.equal(swdProfile(name),pr);
  const a=pr.idReg?new StLinkF0({productId:0x3748},pr):new StLinkF1({productId:0x3748},pr);
  const b=new DapStm32({device:{}},pr);
  assert.ok(a instanceof Stm32SwdSession);assert.ok(b instanceof Stm32SwdSession);assert.equal(a.program,b.program);assert.equal(a.identify,b.identify);
 }
});
test('CMSIS-DAP exercises the actual shared F0/F1 algorithms through memory transport',async()=>{
 for(const name of ['STM32F070F6P6','STM32F031F4P6','STM32F051R8T6','STM32F071VBT6','STM32F072RBT6','STM32F103C4T6','STM32F103C8T6','STM32F103RET6','STM32F091RCT6','STM32F100RBT6','STM32F101RET6','STM32F102C8T6','STM32F105RCT6','STM32F107VCT6']){
  const pr=swdProfile(name),mem=memory(pr),dap=new DapStm32(mem,pr);dap.id=await dap.identify();
  const b=new Uint8Array(13).fill(85),v=new DataView(b.buffer);v.setUint32(0,0x20000000+pr.ram,true);v.setUint32(4,BASE+9,true);
  await dap.program(b);
  assert.deepEqual(mem.bytes.slice(0,b.length),b);assert.ok(mem.bytes.slice(b.length).every(x=>x===255));assert.equal(mem.regs.get(CR),128);assert.equal(mem.erased,pr.idReg?pr.flash/pr.pageSize:1);
 }
});
test('Unknown profiles fail before WebUSB/WebHID prompts',async()=>{
 const denied={requestDevice:async()=>assert.fail('must not open')};
 await assert.rejects(openCmsisDap('STM32H743ZIT6',denied),/неподдерживаемый/);
 await assert.rejects(openCmsisDapHid('STM32F103CFT6',denied),/неподдерживаемый/);
});
