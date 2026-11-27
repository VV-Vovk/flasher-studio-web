import test from 'node:test';
import assert from 'node:assert/strict';
import {StLinkF1,StLinkF0} from '../public/extra-programmers.js';
import {DapStm32} from '../public/cmsis-dap.js';
import {swdReadRange,swdProfile} from '../public/stm32-swd.js';
const u=a=>Uint8Array.from(a);
const le=v=>{const b=new Uint8Array(4);new DataView(b.buffer).setUint32(0,v,true);return b;};
test('SWD alignment preserves the unsigned system register address and offset',()=>{
 assert.deepEqual(swdReadRange(0xe0042000,4),{start:0xe0042000,offset:0,alignedLength:4});
 assert.deepEqual(swdReadRange(0xe000ed03,3),{start:0xe000ed00,offset:3,alignedLength:8});
 assert.deepEqual(swdReadRange(0x7fffffff,2),{start:0x7ffffffc,offset:3,alignedLength:8});
 assert.deepEqual(swdReadRange(0xffffffff,1),{start:0xfffffffc,offset:3,alignedLength:4});
 for(const [a,n] of [[-1,4],[0x100000000,1],[0xffffffff,2],[0,0],[0,1025],[1,1024],[0.5,4],[0,1.5],[NaN,4],[0,NaN]])assert.throws(()=>swdReadRange(a,n),/SWD read length/);
});
function mockUSB(pr,core){
 const addresses=[],commands=[],memory=new Map();
 memory.set(pr.idReg||0xe0042000,le(pr.pid));
 memory.set(0xe000ed00,le(core));
 const size=new Uint8Array(4);new DataView(size.buffer).setUint16(pr.sizeReg%4,pr.flash/1024,true);memory.set(pr.sizeReg-pr.sizeReg%4,size);
 const uid=u([1,2,3,4,5,6,7,8,9,10,11,12]);for(let i=0;i<12;i+=4)memory.set(pr.uid+i,uid.slice(i,i+4));
 let command=null,mode=1;
 const device={productId:0x3748,async transferOut(ep,bytes){
  assert.equal(ep,2);assert.equal(bytes.length,16);command=Uint8Array.from(bytes);commands.push([...command.slice(0,3)]);
  if(command[0]===0xf2&&command[1]===0x30){assert.equal(command[2],0xa3);mode=2;}
  return {status:'ok',bytesWritten:bytes.length};
 },async transferIn(ep,n){
  assert.equal(ep,1);let b;
  if(command[0]===0xf1)b=u([0x20,0,0,0,0,0]);
  else if(command[0]===0xf5)b=u([mode,0]);
  else if(command[0]===0xf2&&command[1]===0x30)b=u([0x80,0]);
  else if(command[0]===0xf2&&command[1]===0x3e)b=u([0x80,...Array(11).fill(0)]);
  else if(command[0]===0xf2&&command[1]===7){
   assert.equal(mode,2);const v=new DataView(command.buffer),a=v.getUint32(2,true),len=v.getUint16(6,true);
   assert.equal(len,n);assert.equal(a%4,0);assert.equal(len%4,0);addresses.push([a,len]);b=new Uint8Array(len);
   for(let i=0;i<len;i+=4){assert.ok(memory.has(a+i),'unexpected read @'+(a+i).toString(16));b.set(memory.get(a+i),i);}
  }else assert.fail('Unexpected command; identify must not write or erase Flash');
  assert.equal(b.length,n);return {status:'ok',data:new DataView(b.buffer,b.byteOffset,b.byteLength)};
 }};
 return {device,addresses,commands,memory,uid};
}
test('Real ST-LINK F1 init reads DBGMCU, CPUID, Flash size and UID through USB',async()=>{
 const pr=swdProfile('STM32F103C8T6'),m=mockUSB(pr,0x410fc230),a=new StLinkF1(m.device,pr);
 assert.equal(await a.init(),'stm32-0102030405060708090a0b0c');
 assert.deepEqual(m.addresses,[[0xe0042000,4],[0xe000ed00,4],[pr.sizeReg-pr.sizeReg%4,4],[pr.uid,12]]);
});
test('Real ST-LINK F0 init reads high CPUID address through USB',async()=>{
 const pr=swdProfile('STM32F070F6P6'),m=mockUSB(pr,0x410cc200),a=new StLinkF0(m.device,pr);
 assert.equal(await a.init(),'stm32-0102030405060708090a0b0c');
 assert.ok(m.addresses.some(([a])=>a===0xe000ed00));
});
test('ST-LINK rejects incorrect silicon geometry even after unsigned address fix',async()=>{
 const pr=swdProfile('STM32F103C8T6'),m=mockUSB(pr,0x410fc230),a=new StLinkF1(m.device,pr);
 m.memory.set(0xe0042000,le(0x999));
 await assert.rejects(a.init(),/device ID mismatch/);
 assert.deepEqual(m.addresses,[[0xe0042000,4]]);
});
test('ST-LINK and CMSIS-DAP handle unaligned high addresses without giant allocations',async()=>{
 const pr=swdProfile('STM32F103C8T6'),m=mockUSB(pr,0x410fc230),a=new StLinkF1(m.device,pr);
 m.memory.set(0xe000ed00,u([1,2,3,4]));m.memory.set(0xe000ed04,u([5,6,7,8]));
 await a.enterSwd();
 assert.deepEqual([...await a.read(0xe000ed03,3)],[4,5,6]);assert.deepEqual(m.addresses,[[0xe000ed00,8]]);
 const seen=[],dap=new DapStm32({device:{},readWord:async addr=>{seen.push(addr);const b=m.memory.get(addr);return new DataView(b.buffer).getUint32(0,true);}},pr);
 assert.deepEqual([...await dap.read(0xe000ed03,3)],[4,5,6]);assert.deepEqual(seen,[0xe000ed00,0xe000ed04]);
});
