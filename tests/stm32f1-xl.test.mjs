import test from 'node:test';
import assert from 'node:assert/strict';
import {Stm32SwdSession,swdProfile} from '../public/stm32-swd.js';
const BASE=0x08000000,BOUNDARY=512*1024,KEY=0x40022004,SR=0x4002200c,CR=0x40022010,UID=Uint8Array.from({length:12},(_,i)=>i+1);
class Fake extends Stm32SwdSession{
 constructor(name){super(swdProfile(name));this.id='stm32-0102030405060708090a0b0c';this.bytes=new Uint8Array(this.pr.flash);this.regs=new Map([[0xe0042000,0x430],[0xe000ed00,0x410fc230],[0x4002201c,0],[0x40022020,0xffffffff],[0x40021000,3],[CR,128],[CR+64,128],[SR,0],[SR+64,0]]);this.erased=[];this.writes=[];}
 async reg(a){if(!this.regs.has(a))throw Error('unexpected register '+a.toString(16));return this.regs.get(a);}
 async read(a,n){if(a===this.pr.sizeReg)return Uint8Array.of((this.pr.flash/1024)&255,(this.pr.flash/1024)>>8);if(a===this.pr.uid)return UID.slice();assert.ok(a>=BASE&&a+n<=BASE+this.pr.flash);return this.bytes.slice(a-BASE,a-BASE+n);}
 async put(a,v){
   if(a===0xe000edf0){this.regs.set(a,1<<17);return;}
   for(const off of [0,64]){
     if(a===KEY+off){if(v===0xcdef89ab&&!(this.lockFailure&&off))this.regs.set(CR+off,0);return;}
     if(a===SR+off){this.regs.set(a,this.regs.get(a)&~v);return;}
     if(a===CR+off){
       if(v===0x44){assert.equal(this.regs.get(a),4);this.erased.push(off);this.bytes.fill(255,off?BOUNDARY:0,off?this.pr.flash:BOUNDARY);this.regs.set(SR+off,this.eraseError&&off?0x10:0x20);}
       this.regs.set(a,v);return;
     }
   }
   throw Error('unexpected write '+a.toString(16));
 }
 async writeHalfword(a,b){const off=a-BASE>=BOUNDARY?64:0;assert.equal(this.regs.get(CR+off),1);assert.equal(this.regs.get(CR+(off?0:64)),0);assert.ok(a>=BASE&&a+2<=BASE+this.pr.flash);this.bytes.set(b,a-BASE);this.writes.push(a);this.regs.set(SR+off,32);}
}
function image(pr,n=BOUNDARY+13){const b=new Uint8Array(n).fill(255),v=new DataView(b.buffer);v.setUint32(0,0x20000000+pr.ram,true);v.setUint32(4,BASE+9,true);b[8]=42;if(n>BOUNDARY){b[BOUNDARY-1]=0x12;b[BOUNDARY]=0x34;b[n-1]=0x56;}return b;}
test('XL 768 KiB and 1 MiB: both banks erased, correct boundary halfwords, erased tail, both locked',async()=>{
 for(const name of ['STM32F101RFT6','STM32F103ZGT6']){
   const s=new Fake(name),b=image(s.pr);await s.program(b);assert.deepEqual(s.erased,[0,64]);assert.ok(s.writes.includes(BASE+BOUNDARY-2));assert.ok(s.writes.includes(BASE+BOUNDARY));assert.deepEqual(s.bytes.slice(0,b.length),b);assert.ok(s.bytes.slice(b.length).every(x=>x===255));assert.equal(s.regs.get(CR),128);assert.equal(s.regs.get(CR+64),128);
 }
});
test('XL short image still erases bank 2; reject protection, wrong size and second-bank unlock before erase',async()=>{
 const s=new Fake('STM32F103RFT6');await s.program(image(s.pr,13));assert.deepEqual(s.erased,[0,64]);assert.ok(s.bytes.slice(BOUNDARY).every(x=>x===255));
 for(const mode of ['wrp','rdp','size','lock']){
   const a=new Fake('STM32F103RFT6');
   if(mode==='wrp')a.regs.set(0x40022020,0x7fffffff);
   if(mode==='rdp')a.regs.set(0x4002201c,2);
   if(mode==='size'){const read=a.read.bind(a);a.read=async(addr,n)=>addr===a.pr.sizeReg?Uint8Array.of(0,4):read(addr,n);}
   if(mode==='lock')a.lockFailure=true;
   await assert.rejects(a.program(image(a.pr,13)));assert.deepEqual(a.erased,[]);assert.equal(a.regs.get(CR),128);assert.equal(a.regs.get(CR+64),128);
 }
});
test('XL second-bank erase error relocks both and never programs; corrupted erased tail fails verification',async()=>{
 const a=new Fake('STM32F103ZGT6');a.eraseError=true;await assert.rejects(a.program(image(a.pr,13)),/Flash status/);assert.equal(a.writes.length,0);assert.equal(a.regs.get(CR),128);assert.equal(a.regs.get(CR+64),128);
 const b=new Fake('STM32F103ZGT6'),read=b.read.bind(b);b.read=async(addr,n)=>{const bytes=await read(addr,n);if(addr===BASE+b.pr.flash-256)bytes[0]=0;return bytes;};await assert.rejects(b.program(image(b.pr,13)),/readback mismatch/);assert.equal(b.regs.get(CR),128);assert.equal(b.regs.get(CR+64),128);
});
