import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {swdProfile,Stm32SwdSession} from '../public/stm32-swd.js';
import {L0_PROFILES} from '../public/stm32-l0.js';
import {targetCapability} from '../public/target-support.js';
const catalog=JSON.parse(readFileSync(new URL('../public/stm32-targets.json',import.meta.url)));
const F=0x40022000,B=0x08000000,PE=F+4,SR=F+24,OPT=F+28,RCC=0x40021034,SYS=0x40010000;
class Fake extends Stm32SwdSession{
 constructor(name){super(swdProfile(name));const p=this.pr;this.id='stm32-0102030405060708090a0b0c';this.bytes=new Uint8Array(p.flash).fill(255);this.erased=[];this.written=[];this.regs=new Map([[p.idReg,p.pid],[0xe000ed00,p.core<<4],[PE,7],[SR,8],[F,0],[OPT,0xaa],[F+32,0],[F+128,0],[RCC,0],[SYS,0],[SYS+4,1]]);}
 async reg(a){if(!this.regs.has(a))throw Error('unexpected register '+a.toString(16));return this.regs.get(a);}
 async put(a,v){
  assert.notEqual(a,OPT);
  if(a===0xe000edf0){this.regs.set(a,1<<17);return;}
  if(a===F+12){if(v===0x02030405)this.regs.set(PE,this.regs.get(PE)&~1);return;}
  if(a===F+16){if(v===0x13141516&&!this.failUnlock)this.regs.set(PE,this.regs.get(PE)&~2);return;}
  if(a===SR){this.regs.set(a,this.regs.get(a)&~v);return;}
  if(a===PE){assert.ok(v&4);this.regs.set(a,v);return;}
  if(a===F||a===RCC){this.regs.set(a,v);return;}
  assert.ok(a>=B&&a+4<=B+this.pr.flash&&a%4===0,'main Flash only');
  if(this.regs.get(PE)===0x20c){assert.equal(v,0);assert.equal((a-B)%128,0);this.erased.push(a);this.bytes.fill(0,a-B,a-B+128);}
  else{assert.equal(this.regs.get(PE),4);this.written.push(a);new DataView(this.bytes.buffer).setUint32(a-B,v,true);}
  this.regs.set(SR,this.failWrite?0x108:10);
 }
 async read(a,n){
  if(a===this.pr.sizeReg)return Uint8Array.of(this.pr.flash/1024,0);
  if(a===this.pr.uid){assert.equal(n,8);return Uint8Array.from({length:8},(_,i)=>i+1);}
  if(a===this.pr.uidTail){assert.equal(n,4);return Uint8Array.of(9,10,11,12);}
  assert.ok(a>=B&&a+n<=B+this.pr.flash);
  const x=this.bytes.slice(a-B,a-B+n);if(this.corrupt)x[0]^=1;return x;
 }
}
function image(p){const b=new Uint8Array(13);const v=new DataView(b.buffer);v.setUint32(0,0x20000000+p.ram,true);v.setUint32(4,B+9,true);b[8]=42;b[12]=7;return b;}
test('all L0 catalogue patterns and exact profiles',()=>{
 for(const n of Object.keys(L0_PROFILES)){const name=n.replace('x','6'),p=swdProfile(name);assert.equal(p.controller,'l0-pecr',name);assert.equal(targetCapability({fi:5,name},catalog).state,'both',name);assert.equal(swdProfile(n),null);assert.ok(swdProfile(name+'TR'));}
 for(const [n,pid,flash,ram] of [['STM32L010F4P6',0x457,16,2],['STM32L010C6T6',0x425,32,8],['STM32L010K8T6',0x417,64,8],['STM32L010RBT6',0x447,128,20],['STM32L011D3P6',0x457,8,2],['STM32L031C4T6',0x425,16,8],['STM32L083CZT6',0x447,192,20]]){const p=swdProfile(n);assert.equal(p.pid,pid);assert.equal(p.flash,flash*1024);assert.equal(p.ram,ram*1024);}
});
test('L0 zero erase, word programming and verification',async()=>{
 for(const n of ['STM32L011D3P6','STM32L010C6T6','STM32L052C8T6','STM32L083CZT6']){const s=new Fake(n),b=image(s.pr);await s.program(b);assert.equal(s.erased.length,s.pr.flash/128);assert.equal(s.erased.at(-1),B+s.pr.flash-128);assert.deepEqual(s.bytes.slice(0,b.length),b);assert.ok(s.bytes.slice(b.length).every(x=>x===0));assert.equal(s.regs.get(PE),7);assert.equal(s.regs.get(RCC),0);}
});
test('L0 preflight blocks protected, remapped or unready targets',async()=>{
 for(const [a,v] of [[OPT,0xbb],[OPT,0x1aa],[OPT,0x8000aa],[F+32,1],[F+128,1],[SYS+4,0],[SYS,8],[F,16],[SR,0x808],[SR,0]]){const s=new Fake('STM32L083CZT6');s.regs.set(a,v);await assert.rejects(s.program(image(s.pr)));assert.equal(s.erased.length,0);assert.equal(s.regs.get(RCC),0);}
 const s=new Fake('STM32L083CZT6');s.id='wrong';await assert.rejects(s.program(image(s.pr)));assert.equal(s.erased.length,0);
});
test('L0 relocks after unlock, programming or verification failure',async()=>{
 for(const mode of ['failUnlock','failWrite','corrupt']){const s=new Fake('STM32L011D3P6');s[mode]=true;await assert.rejects(s.program(image(s.pr)));assert.equal(s.regs.get(PE),7);}
});
