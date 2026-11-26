import test from 'node:test';
import assert from 'node:assert/strict';
import {swdProfile,Stm32SwdSession} from '../public/stm32-swd.js';
import {G_PAGE_PROFILES,gPageProfile} from '../public/stm32-g-page.js';
import {DapStm32} from '../public/cmsis-dap.js';
import {StLinkF1} from '../public/extra-programmers.js';
import {targetCapability} from '../public/target-support.js';
import {readFileSync} from 'node:fs';
const cat=JSON.parse(readFileSync(new URL('../public/stm32-targets.json',import.meta.url)));
const F=0x40022000,SR=F+16,CR=F+20,BASE=0x08000000,UID=Uint8Array.from({length:12},(_,i)=>i+1);
class Fake extends Stm32SwdSession{
 constructor(name){super(swdProfile(name));const p=this.pr;this.id='stm32-0102030405060708090a0b0c';this.bytes=new Uint8Array(p.flash);this.erased=[];this.written=[];this.registers=new Map([[p.idReg,p.pid],[0xe000ed00,p.core<<4],[F,0x700],[SR,0],[CR,0xc0000000],[F+32,0x2000aa],[F+0x24,0x7fff],[F+0x28,0],[F+0x2c,0x7f],[F+0x30,0x7f],[F+0x34,0x1ff],[F+0x38,0],[F+0x70,0],[F+0x80,0],[F+24,0]]);}
 async reg(a){if(!this.registers.has(a))throw Error('unexpected register '+a.toString(16));return this.registers.get(a);}
 async put(a,v){if(a===0xe000edf0){this.registers.set(a,1<<17);return;}
  if(a===F+8){if(v===0xcdef89ab)this.registers.set(CR,0x40000000);return;}
  if(a===SR){this.registers.set(a,this.registers.get(a)&~v);return;}
  if(a===CR){assert.ok(v&0x40000000);if(v&0x10000){assert.ok(v&2);const p=(v>>>3)&0x7f;assert.ok(p<this.pr.flash/2048);this.erased.push(p);this.bytes.fill(255,p*2048,(p+1)*2048);this.registers.set(SR,this.failErase?0x10:1);}this.registers.set(a,v);return;}
  if(a===F){this.registers.set(a,v);return;}throw Error('unexpected write '+a.toString(16));
 }
 async read(a,n){if(a===this.pr.sizeReg)return Uint8Array.of(this.pr.flash/1024,0);if(a===this.pr.uid)return UID.slice();assert.ok(a>=BASE&&a+n<=BASE+this.pr.flash);return this.bytes.slice(a-BASE,a-BASE+n);}
 async writeDoubleword(a,b){assert.equal(a%8,0);assert.equal(b.length,8);assert.ok(this.registers.get(CR)&1);assert.ok(a>=BASE&&a+8<=BASE+this.pr.flash);this.written.push(a);this.bytes.set(b,a-BASE);this.registers.set(SR,1);}
}
function image(p){const b=new Uint8Array(25).fill(255),v=new DataView(b.buffer);v.setUint32(0,0x20000000+p.ram,true);v.setUint32(4,BASE+9,true);b[8]=42;b[24]=7;return b;}
test('G0/G4 exact geometry and existing catalogue compile capability',()=>{
 for(const [n,pid,flash,ram] of [['STM32G031K8T6',0x466,64,8],['STM32G041F6P6',0x466,32,8],['STM32G051C8T6',0x456,64,18],['STM32G061C6T6',0x456,32,18],['STM32G071RBT6',0x460,128,36],['STM32G081KBT6N',0x460,128,36],['STM32G431CBT6',0x468,128,32],['STM32G441CBT6',0x468,128,32]]){
 const p=swdProfile(n);assert.equal(p.pid,pid,n);assert.equal(p.flash,flash*1024);assert.equal(p.ram,ram*1024);assert.equal(targetCapability({fi:5,name:n},cat).state,'both',n);}
 for(const n of ['STM32G0B1RET6','STM32G474RET6','STM32G030C6T6','STM32G431CBTx','STM32G431CBP6'])assert.equal(gPageProfile(n),null,n);
 assert.equal(Object.keys(G_PAGE_PROFILES).length,128);
});
test('G0/G4 erase only main pages, aligned doublewords and erased tail; lock after verified write',async()=>{
 for(const n of ['STM32G031K8T6','STM32G071RBT6','STM32G431CBT6']){
  const s=new Fake(n),b=image(s.pr);await s.program(b);assert.equal(s.erased.length,s.pr.flash/2048);assert.deepEqual(s.written,[BASE,BASE+8,BASE+24]);assert.deepEqual(s.bytes.slice(0,b.length),b);assert.ok(s.bytes.slice(b.length).every(x=>x===255));assert.equal(s.registers.get(CR),0xc0000000);
 }
});
test('G protection and identity checks reject before erase; erase error relocks',async()=>{
 for(const n of ['STM32G031K8T6','STM32G431CBT6']){
  const g4=swdProfile(n).g4;
  for(const [a,v] of [[F+32,0xbb],[F+0x2c,0],[F+0x24,0],[F+(g4?0x70:0x80),1],[F+24,0x80000000],[CR,0x80000000],[SR,0x8000],[0xe000ed00,0]]){
   const s=new Fake(n);s.registers.set(a,v);await assert.rejects(s.program(image(s.pr)));assert.equal(s.erased.length,0);
  }
  const s=new Fake(n);s.failErase=true;await assert.rejects(s.program(image(s.pr)),/status/);assert.equal(s.written.length,0);assert.equal(s.registers.get(CR),0xc0000000);
 }
});
test('doubleword transports emit two aligned 32-bit words or one 8-byte ST-LINK transaction',async()=>{
 const writes=[],d=new DapStm32({device:{},writeWord:async(...a)=>writes.push(a)},{}),b=Uint8Array.of(1,2,3,4,5,6,7,8);
 await d.writeDoubleword(BASE,b);assert.deepEqual(writes,[[BASE,0x04030201],[BASE+4,0x08070605]]);
 const s=new StLinkF1({productId:0x3748},{});s.cmd=async(...a)=>writes.push(a);s.rwStatus=async()=>{};
 await s.writeDoubleword(BASE,b);assert.deepEqual(writes[2][0],[0xf2,8,0,0,0,8,8,0]);assert.deepEqual(writes[2][2],b);
 await assert.rejects(d.writeDoubleword(BASE+4,b));await assert.rejects(s.writeDoubleword(BASE,new Uint8Array(4)));
});
