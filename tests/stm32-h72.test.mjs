import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {H72_PROFILES} from '../public/stm32-h72.js';
import {swdProfile,Stm32SwdSession} from '../public/stm32-swd.js';
import {targetCapability} from '../public/target-support.js';
import {DapStm32} from '../public/cmsis-dap.js';
import {StLinkF1} from '../public/extra-programmers.js';
const cat=JSON.parse(readFileSync(new URL('../public/stm32-targets.json',import.meta.url)));
const F=0x52002000,B=0x08000000,CR=F+12,SR=F+16,OPT=F+28,UID=Uint8Array.from({length:12},(_,i)=>i+1);
class Fake extends Stm32SwdSession{
 constructor(name){super(swdProfile(name));const p=this.pr;this.id='stm32-0102030405060708090a0b0c';this.mem=new Uint8Array(p.flash);this.erased=[];this.written=[];this.regs=new Map([[p.idReg,p.pid],[0xe000ed00,p.core<<4],[0xe000ed14,0],[CR,0x31],[SR,0],[F+24,1],[OPT,0xaa00],[F+0x70,0],[F+40,0xff],[F+48,0xff],[F+56,0xff],[F+64,0x1ff00800]]);}
 async reg(a){if(!this.regs.has(a))throw Error('Unknown register '+a.toString(16));return this.regs.get(a);}
 async put(a,v){
  assert.ok(![F+8,F+24,OPT,F+32,F+40,F+48,F+56,F+64,F+0x70].includes(a),'no option writes');
  if(a===0xe000edf0){this.regs.set(a,1<<17);return;}
  if(a===F+4){if(v===0xcdef89ab&&!this.failUnlock)this.regs.set(CR,0x30);return;}
  if(a===F+20){this.regs.set(SR,this.regs.get(SR)&~v);return;}
  assert.equal(a,CR);
  if(v&128){assert.equal(v&15,4);const n=(v>>>8)&7;assert.ok(n<this.pr.flash/131072);this.erased.push(n);this.mem.fill(255,n*131072,(n+1)*131072);this.regs.set(SR,this.failErase?0x20000:0x10000);}
  if(v===0)this.regs.set(SR,this.regs.get(SR)&~2);
  this.regs.set(a,v);
 }
 async read(a,n){
  if(a===this.pr.sizeReg)return Uint8Array.of(this.pr.flash/1024&255,this.pr.flash/1024>>>8);
  if(a===this.pr.uid)return UID.slice();
  assert.ok(a>=B&&a+n<=B+this.pr.flash);
  const b=this.mem.slice(a-B,a-B+n);if(this.corrupt)b[0]^=1;if(this.ecc)this.regs.set(SR,0x4000000);return b;
 }
 async writeFlashWord32(a,b){assert.equal(a%32,0);assert.equal(b.length,32);assert.equal(this.regs.get(CR),2);assert.ok(a>=B&&a+32<=B+this.pr.flash);if(this.partial){this.regs.set(SR,2);throw Error('link error');}this.written.push(a);this.mem.set(b,a-B);this.regs.set(SR,this.failWrite?0x80000:0x10000);}
}
function image(p,axi=false){const b=new Uint8Array(65).fill(255),v=new DataView(b.buffer);v.setUint32(0,axi?0x24020000:0x20020000,true);v.setUint32(4,B+9,true);b[8]=42;b[64]=7;return b;}
test('H72/H73 exact package profiles, 128/512/1024 KiB geometry and capabilities',()=>{
 assert.equal(Object.keys(H72_PROFILES).length,42);
 for(const n of Object.keys(H72_PROFILES)){const name=n.replace('x','6'),p=swdProfile(name);assert.equal(p.pid,0x483);assert.equal(p.wordSize,32);assert.equal(targetCapability({fi:5,name},cat).state,'both',name);assert.equal(swdProfile(n),null);assert.ok(swdProfile(name+'TR'));}
 for(const n of ['STM32H743ZIT6','STM32H745ZIT6','STM32H723ZGX6','STM32H563ZIT6'])assert.equal(swdProfile(n),null,n);
});
test('H72 sector erase, full 32-byte row, erased tail, and both stack regions',async()=>{
 for(const [name,flash,axi] of [['STM32H730VBT6',128,false],['STM32H723VET6',512,true],['STM32H725IGT6',1024,false],['STM32H733VGT6',1024,true],['STM32H735ZGT6',1024,false]]){
  const s=new Fake(swdProfile(name)?name:name.slice(0,11)),b=image(s.pr,axi);assert.equal(s.pr.flash,flash*1024);await s.program(b);assert.deepEqual(s.erased,Array.from({length:flash/128},(_,i)=>i));assert.deepEqual(s.written,[B,B+64]);assert.deepEqual(s.mem.slice(0,b.length),b);assert.ok(s.mem.slice(b.length).every(x=>x===255));assert.equal(s.regs.get(CR),1);
 }
});
test('H72 protection, cache, identity and boot checks precede any erase',async()=>{
 for(const [a,v] of [[0x5c001000,0x450],[0xe000ed00,0xc24<<4],[OPT,0xbb00],[OPT,0x20aa00],[F+24,0],[F+0x70,0x40000000],[F+40,0],[F+48,0],[F+56,0xfe],[F+64,0],[0xe000ed14,0x10000],[SR,0x4000000],[CR,0x33]]){
  const s=new Fake('STM32H723VGT6');s.regs.set(a,v);await assert.rejects(s.program(image(s.pr)));assert.deepEqual(s.erased,[]);
 }
 const s=new Fake('STM32H723VGT6'),b=image(s.pr);new DataView(b.buffer).setUint32(0,0x24050000,true);await assert.rejects(s.program(b));assert.deepEqual(s.erased,[]);
});
test('H72 failure cases relock; partial write buffer discarded, no forced programming',async()=>{
 for(const flag of ['failUnlock','failErase','failWrite','partial','corrupt','ecc']){
  const s=new Fake('STM32H730VBT6');s[flag]=true;await assert.rejects(s.program(image(s.pr)));assert.ok(s.regs.get(CR)&1,flag);
 }
});
test('32-byte transport sends exactly eight words on DAP and a 32-byte ST-LINK memory write',async()=>{
 const b=Uint8Array.from({length:32},(_,i)=>i),calls=[],d=new DapStm32({device:{},writeWord:async(...a)=>calls.push(a)},{});
 await d.writeFlashWord32(B,b);assert.equal(calls.length,8);for(let i=0;i<8;i++)assert.deepEqual(calls[i],[B+i*4,new DataView(b.buffer).getUint32(i*4,true)]);
 const s=new StLinkF1({productId:0x3748},{});s.cmd=async(...a)=>calls.push(a);s.rwStatus=async()=>{};await s.writeFlashWord32(B,b);assert.deepEqual(calls[8][0],[0xf2,8,0,0,0,8,32,0]);assert.deepEqual(calls[8][2],b);await assert.rejects(d.writeFlashWord32(B+4,b));await assert.rejects(s.writeFlashWord32(B,new Uint8Array(8)));
});
