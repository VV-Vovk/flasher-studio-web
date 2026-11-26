import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {swdProfile,Stm32SwdSession} from '../public/stm32-swd.js';
import {clLayout,CL_PAGE_PROFILES} from '../public/stm32-cl-page.js';
import {targetCapability} from '../public/target-support.js';
const catalog=JSON.parse(readFileSync(new URL('../public/stm32-targets.json',import.meta.url)));
const F=0x40022000,BASE=0x08000000,CR=F+20,SR=F+16,OPT=F+32,RCC=0x40021060,SYS=0x40010000;
class Fake extends Stm32SwdSession{
 constructor(name){super(swdProfile(name));const p=this.pr;this.id='stm32-0102030405060708090a0b0c';this.bytes=new Uint8Array(p.flash);this.mass=[];this.written=[];this.regs=new Map([[p.idReg,p.pid],[0xe000ed00,p.core<<4],[F,p.c0?0x40300:0x700],[SR,0],[CR,0xc0000000],[OPT,0xaa],[F+0x24,p.c0?0x1ff:p.kind==='l4plus'?0x1ffff:0xffff],[F+0x28,0],[F+0x2c,0xff],[F+0x30,0xff],[F+0x34,0x1ff],[F+0x38,0],[F+0x44,p.kind==='l4plus'?0x1ffff:0xffff],[F+0x48,0],[F+0x4c,0xff],[F+0x50,0xff],[F+0x80,0],[RCC,0],[SYS,0],[SYS+4,1]]);if(!p.c0)this.regs.set(F+24,0);}
 async reg(a){if(!this.regs.has(a))throw Error('Unexpected register '+a.toString(16));return this.regs.get(a);}
 async put(a,v){assert.notEqual(a,OPT);if(a===0xe000edf0){this.regs.set(a,1<<17);return;}
 if(a===F+8){if(v===0xcdef89ab)this.regs.set(CR,0x40000000);return;}
 if(a===SR){this.regs.set(a,this.regs.get(a)&~v);return;}
 if(a===CR){assert.ok(v&0x40000000);if(v&0x10000){assert.equal(v&7,4);this.mass.push(v&0x8004);this.bytes.fill(255);this.regs.set(SR,this.failErase?0x10:1);}this.regs.set(a,v);return;}
 if(a===F||a===RCC){this.regs.set(a,v);return;}throw Error('Unexpected write '+a.toString(16));}
 async read(a,n){if(a===this.pr.sizeReg)return Uint8Array.of((this.pr.flash/1024)&255,(this.pr.flash/1024)>>8);if(a===this.pr.uid)return Uint8Array.from({length:12},(_,i)=>i+1);assert.ok(a>=BASE&&a+n<=BASE+this.pr.flash);return this.bytes.slice(a-BASE,a-BASE+n);}
 async writeDoubleword(a,b){assert.equal(a%8,0);assert.equal(b.length,8);assert.ok(this.regs.get(CR)&1);assert.ok(a>=BASE&&a+8<=BASE+this.pr.flash);this.written.push(a);this.bytes.set(b,a-BASE);this.regs.set(SR,1);}
}
function image(p){const b=new Uint8Array(25).fill(255),v=new DataView(b.buffer);v.setUint32(0,0x20000000+p.ram,true);v.setUint32(4,BASE+9,true);b[8]=42;b[24]=7;return b;}
test('C0 and L4 exact catalogue profiles and UID / flash geometry',()=>{
 assert.equal(Object.keys(CL_PAGE_PROFILES).length,348);
 for(const row of Object.keys(CL_PAGE_PROFILES)){const name=row.replace('x','6'),p=swdProfile(name);assert.equal(p.controller,'cl-page',name);assert.ok(p.flash>0&&p.ram>0,name);assert.ok(swdProfile(name+'TR'));assert.equal(swdProfile(row),null);}
 for(const [n,pid,flash,ram] of [['STM32C011F4U6',0x443,16,6],['STM32C031C6T6',0x453,32,12],['STM32C051K8T6',0x44c,64,12],['STM32C071RBT6',0x493,128,24],['STM32C091RCT6',0x44d,256,36],['STM32C092RCT6',0x44d,256,30],['STM32L412C8T6',0x464,64,40],['STM32L432KCU6',0x435,256,64],['STM32L452RET6',0x462,512,160],['STM32L476RGT6',0x415,1024,128],['STM32L496RGT6',0x461,1024,320],['STM32L4R5VIT6',0x470,2048,640],['STM32L4P5CGT6',0x471,1024,320]]){
 const p=swdProfile(n);assert.equal(p.pid,pid,n);assert.equal(p.flash,flash*1024,n);assert.equal(p.ram,ram*1024,n);assert.equal(targetCapability({fi:5,name:n},catalog).state,'both',n);}
 assert.equal(swdProfile('STM32C091FBP6').controller,'cl-page');assert.equal(targetCapability({fi:5,name:'STM32C091FBP6'},catalog).state,'flash');
 assert.equal(swdProfile('STM32L432KCX6'),null);
});
test('C0/L4 main Flash erase and doublewords, padding, verification and relock',async()=>{
 for(const [n,op,mer] of [['STM32C011F4U6',0xaa,4],['STM32C092RCT6',0xaa,4],['STM32L412C8T6',0xaa,4],['STM32L476RET6',0xaa,4],['STM32L476RGT6',0xaa,0x8004],['STM32L4R5VIT6',0xaa,0x8004],['STM32L4R5VIT6',0x4000aa,0x8004],['STM32L4P5CGT6',0x4000aa,0x8004]]){
 const s=new Fake(n),b=image(s.pr);s.regs.set(OPT,op);await s.program(b);assert.deepEqual(s.mass,[mer]);assert.deepEqual(s.written,[BASE,BASE+8,BASE+24]);assert.deepEqual(s.bytes.slice(0,b.length),b);assert.ok(s.bytes.slice(b.length).every(x=>x===255));assert.equal(s.regs.get(CR),0xc0000000);assert.equal(s.regs.get(RCC),0);}
});
test('C0/L4 protection, option errors, firewall, bank swap and ECC rejected before erase',async()=>{
 for(const [n,a,v,op] of [
 ['STM32C011F4U6',OPT,0xbb,0xaa],['STM32C071RBT6',F+0x80,1,0xaa],['STM32C091RCT6',F+0x34,0,0xaa],['STM32C091RCT6',SR,0x2000,0xaa],
 ['STM32L412C8T6',SYS+4,0,0xaa],['STM32L476RGT6',F+0x4c,0,0xaa],['STM32L476RGT6',F+0x44,0,0xaa],['STM32L476RGT6',SYS,0x100,0xaa],['STM32L476RGT6',OPT,0x1000aa,0xaa],['STM32L476RET6',OPT,0x2000aa,0xaa],['STM32L4R5VIT6',F+24,0x10000000,0xaa],['STM32L4P5CET6',OPT,0xaa,0x4000aa]]){
 const s=new Fake(n);s.regs.set(OPT,op);s.regs.set(a,v);await assert.rejects(s.program(image(s.pr)));assert.deepEqual(s.mass,[]);assert.equal(s.regs.get(RCC),0);}
 const s=new Fake('STM32L432KCU6');s.failErase=true;await assert.rejects(s.program(image(s.pr)),/status/);assert.equal(s.written.length,0);assert.equal(s.regs.get(CR),0xc0000000);
 const c=new Fake('STM32C031C6T6'),read=c.read.bind(c);c.read=async(a,n)=>{const b=await read(a,n);if(a===BASE+c.pr.flash-256)b[0]^=1;return b;};await assert.rejects(c.program(image(c.pr)),/readback/);assert.equal(c.regs.get(CR),0xc0000000);
});
