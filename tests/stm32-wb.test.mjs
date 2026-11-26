import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {swdProfile,Stm32SwdSession} from '../public/stm32-swd.js';
import {WB_PROFILES} from '../public/stm32-wb.js';
import {targetCapability} from '../public/target-support.js';
const cat=JSON.parse(readFileSync(new URL('../public/stm32-targets.json',import.meta.url)));
const F=0x58004000,B=0x08000000,CR=F+20,SR=F+16,OPT=F+32,SFR=F+128,RV=F+132,PWR=0x5800040c;
class Fake extends Stm32SwdSession{
 constructor(name){super(swdProfile(name));const p=this.pr;this.id='stm32-0102030405060708090a0b0c';this.mem=new Uint8Array(p.flash).fill(0x5a);this.erased=[];this.written=[];const page=p.flash/4096-8;this.regs=new Map([[p.idReg,p.pid],[0xe000ed00,p.core<<4],[F,0x700],[SR,0],[CR,0xc0000000],[F+24,0],[OPT,0x1aa],[SFR,page],[RV,(0x80000000|page*1024)>>>0],[PWR,0],[F+0x60,0],[F+0x64,0xc0000000],[F+0x24,0x1ff],[F+0x28,0],[F+0x34,0x1ff],[F+0x38,0],[F+0x2c,0xff],[F+0x30,0xff]]);}
 async reg(a){if(!this.regs.has(a))throw Error('unknown register '+a.toString(16));return this.regs.get(a);}
 async put(a,v){assert.ok([F,F+8,SR,CR,0xe000edf0].includes(a),'no CPU2/option writes');if(a===0xe000edf0){this.regs.set(a,1<<17);return;}
 if(a===F+8){if(v===0xcdef89ab)this.regs.set(CR,0x40000000);return;}
 if(a===SR){this.regs.set(a,this.regs.get(a)&~v);return;}
 if(a===CR){assert.ok(v&0x40000000);assert.equal(v&4,0,'no mass erase');if(v&0x10000){const n=(v>>>3)&255;assert.ok(n<(this.regs.get(SFR)&255));this.erased.push(n);this.mem.fill(255,n*4096,(n+1)*4096);this.regs.set(SR,this.failErase?0x10:1);}this.regs.set(a,v);return;}this.regs.set(a,v);}
 async read(a,n){if(a===this.pr.sizeReg)return Uint8Array.of(this.pr.flash/1024&255,this.pr.flash/1024>>>8);if(a===this.pr.uid)return Uint8Array.from({length:12},(_,i)=>i+1);assert.ok(a>=B&&a+n<=B+(this.regs.get(SFR)&255)*4096);let v=this.mem.slice(a-B,a-B+n);if(this.corrupt)v[0]^=1;return v;}
 async writeDoubleword(a,b){assert.equal(a%8,0);assert.equal(b.length,8);assert.ok(a>=B&&a+8<=B+(this.regs.get(SFR)&255)*4096);assert.ok(this.regs.get(CR)&1);this.written.push(a);this.mem.set(b,a-B);this.regs.set(SR,1);}
}
function image(p,n=4097){const b=new Uint8Array(n).fill(255),v=new DataView(b.buffer);v.setUint32(0,0x20000000+p.ram,true);v.setUint32(4,B+9,true);b[8]=42;b[n-1]=7;return b;}
test('WB exact catalogue profiles and flash-only policy',()=>{
 assert.equal(Object.keys(WB_PROFILES).length,17);
 for(const n of Object.keys(WB_PROFILES)){const name=n.replace('x','6'),p=swdProfile(name);assert.equal(p.pid,0x495);assert.equal(p.pageSize,4096);assert.equal(targetCapability({fi:5,name},cat).state,'flash');assert.equal(swdProfile(n),null);}
 assert.equal(swdProfile('STM32WB15CCU6'),null);
});
test('WB application pages only; preserves remaining nonsecure and secure Flash',async()=>{
 for(const n of ['STM32WB55RGV6','STM32WB55CCU6','STM32WB35CEU6A','STM32WB50CGU6','STM32WB5MMGH6']){
  const s=new Fake(n),b=image(s.pr);await s.program(b);assert.deepEqual(s.erased,[0,1]);assert.deepEqual(s.mem.slice(0,b.length),b);assert.ok(s.mem.slice(b.length,8192).every(x=>x===255));assert.ok(s.mem.slice(8192).every(x=>x===0x5a));assert.equal(s.regs.get(CR),0xc0000000);
 }
});
test('WB refuses CPU2 running, unsafe SFSA, RDP, WRP/PCROP and option/ECC errors before erase',async()=>{
 for(const [a,v] of [[PWR,0x8000],[SFR,0],[SFR,0x1f0],[OPT,0x1bb],[OPT,0xaa],[RV,0],[F+0x60,0x80000],[F+0x64,1],[F+0x2c,0],[F+0x34,0],[SR,0x8000],[F+24,0x80000000]]){
  const s=new Fake('STM32WB55RGV6');s.regs.set(a,v);await assert.rejects(s.program(image(s.pr)));assert.equal(s.erased.length,0);
 }
 const s=new Fake('STM32WB55RGV6');await assert.rejects(s.program(image(s.pr,await s.applicationLimit()+1)),/overlaps/);assert.deepEqual(s.erased,[]);
});
test('WB errors relock; CPU2 and remaining pages preserved',async()=>{
 for(const flag of ['failErase','corrupt']){const s=new Fake('STM32WB55RGV6');s[flag]=true;await assert.rejects(s.program(image(s.pr)));assert.equal(s.regs.get(CR),0xc0000000);assert.ok(s.mem.slice(8192).every(x=>x===0x5a));}
});
