import test from 'node:test';
import assert from 'node:assert/strict';
import {Stm32SwdSession,swdProfile,SECTOR_PROFILES} from '../public/stm32-swd.js';
import {StLinkF1} from '../public/extra-programmers.js';
import {DapLink} from '../public/cmsis-dap.js';
import {SECTOR_BASE_PROFILES} from '../public/stm32-sector.js';
import {readFileSync} from 'node:fs';
import {targetCapability} from '../public/target-support.js';
const catalog=JSON.parse(readFileSync(new URL('../public/stm32-targets.json',import.meta.url)));
const BASE=0x08000000,ACR=0x40023c00,KEY=0x40023c04,SR=0x40023c0c,CR=0x40023c10,OPT=0x40023c14;
class Mock extends Stm32SwdSession{
 constructor(name){super(swdProfile(name));const p=this.pr;this.bytes=new Uint8Array(p.flash).fill(0);this.id='stm32-0102030405060708090a0b0c';this.regs=new Map([[0xe0042000,p.pid],[0xe000ed00,p.part<<4],[0xe000edf0,0],[ACR,0x703],[CR,0x80000000],[SR,0],[OPT,0x0fffaaed]]);this.erased=[];this.writes=[];}
 async reg(a){if(!this.regs.has(a))throw Error('Unknown register');return this.regs.get(a);}
 async read(a,n){if(a===this.pr.sizeReg)return Uint8Array.of(this.pr.flash/1024&255,this.pr.flash/1024>>>8);if(a===this.pr.uid)return Uint8Array.from({length:12},(_,i)=>i+1);assert.ok(a>=BASE&&a+n<=BASE+this.pr.flash);return this.bytes.slice(a-BASE,a-BASE+n);}
 async put(a,v){this.writes.push([a,v]);assert.notEqual(a,OPT);if(a===KEY){if(v===0xcdef89ab)this.regs.set(CR,0);return;}if(a===0xe000edf0){this.regs.set(a,1<<17);return;}if(a===SR){this.regs.set(a,this.regs.get(a)&~v);return;}if(a===CR&&(v&0x10000)){assert.equal(v&0x306,2);const i=(v>>>3)&15;assert.ok(i<this.pr.sectors.length);const start=this.pr.sectors.slice(0,i).reduce((a,b)=>a+b,0);this.bytes.fill(255,start,start+this.pr.sectors[i]);this.erased.push(i);this.regs.set(SR,1);}this.regs.set(a,v);}
 async writeByte(a,v){assert.equal(this.regs.get(CR)&0x301,1);assert.ok(a>=BASE&&a<BASE+this.pr.flash);this.bytes[a-BASE]=v;this.regs.set(SR,1);}
}
function image(p){const b=new Uint8Array(13).fill(0x55),v=new DataView(b.buffer);v.setUint32(0,0x20000000+p.ram,true);v.setUint32(4,BASE+9,true);return b;}
test('F2/F4 exact geometry and full readback for every added model',async()=>{
 for(const [name,p] of Object.entries(SECTOR_PROFILES)){const s=new Mock(name),b=image(p);await s.program(b);assert.deepEqual(s.erased,p.sectors.map((_,i)=>i));assert.deepEqual(s.bytes.slice(0,b.length),b);assert.ok(s.bytes.slice(b.length).every(x=>x===255));assert.equal(s.regs.get(CR),0x80000000);assert.equal(s.regs.get(ACR),0x703);}
 assert.equal(swdProfile('STM32F429ZIT6'),null);
});
test('Sector driver blocks wrong ID, CPU, RDP, WRP and PCROP before erase',async()=>{
 for(const [addr,value] of [[0xe0042000,0x413],[0xe000ed00,0xc23<<4],[OPT,0x0fff55ed],[OPT,0x0ffeaaed],[OPT,0x8fffaaed]]){const s=new Mock('STM32F411CEU6');s.regs.set(addr,value);await assert.rejects(s.program(image(s.pr)));assert.equal(s.erased.length,0);}
});
test('Verification failure relocks; flash status error aborts sector loop',async()=>{
 const s=new Mock('STM32F401CCU6'),read=s.read.bind(s);s.read=async(a,n)=>{let b=await read(a,n);if(a===BASE+s.pr.flash-256)b[0]^=1;return b;};await assert.rejects(s.program(image(s.pr)),/readback/);assert.equal(s.regs.get(CR),0x80000000);
 const f=new Mock('STM32F401CCU6'),put=f.put.bind(f);f.put=async(a,v)=>{await put(a,v);if(a===CR&&(v&0x10000))f.regs.set(SR,0x10);};await assert.rejects(f.program(image(f.pr)),/status/);assert.equal(f.erased.length,1);assert.equal(f.regs.get(CR),0x80000000);
});
test('ST-LINK byte write framing and CMSIS-DAP byte lanes',async()=>{
 const a=new StLinkF1({productId:0x3748},{}),calls=[];a.cmd=async(...p)=>calls.push(p);a.rwStatus=async()=>calls.push('status');await a.writeByte(BASE+3,0xab);assert.deepEqual(calls,[[[0xf2,0x0d,3,0,0,8,1,0],0,Uint8Array.of(0xab)],'status']);
 const d=new DapLink({},1,2),log=[];d.csw=0x23000052;d.ap=async(...p)=>log.push(p);d.dp=async(...p)=>log.push(p);await d.writeByte(BASE+3,0xab);assert.deepEqual(log,[[0,0x23000040],[4,BASE+3],[12,0xab000000],[12]]);
});

test('All 99 selected F2/F4 base catalogue entries resolve; no unsupported package inference',()=>{
 assert.equal(Object.keys(SECTOR_BASE_PROFILES).length,99);
 for(const n of Object.keys(SECTOR_BASE_PROFILES)){assert.equal(targetCapability({fi:5,name:n},catalog).state,'both',n);}
 for(const n of ['STM32F429ZIT6','STM32F413ZHT6','STM32F205RBP6','STM32F401CCTx'])assert.equal(swdProfile(n),null,n);
});
test('F2 density-dependent SRAM and F4 IDs, protection and sector geometry',async()=>{
 for(const [name,pid,flash,ram,ccm,count] of [
 ['STM32F205RBT6',0x411,128,64,0,5],['STM32F207VCT6',0x411,256,96,0,6],['STM32F215RET6',0x411,512,128,0,8],
 ['STM32F217VGT6',0x411,1024,128,0,12],['STM32F401RBT6',0x423,128,64,0,5],['STM32F401RET6',0x433,512,96,0,8],
 ['STM32F405RGT6',0x413,1024,128,64,12],['STM32F407VET6',0x413,512,128,64,8],
 ['STM32F410R8T6',0x458,64,32,0,4],['STM32F411CCT6',0x431,256,128,0,6],
 ['STM32F412RGT6',0x441,1024,256,0,12],['STM32F415RGT6',0x413,1024,128,64,12],
 ['STM32F417VGT6',0x413,1024,128,64,12],['STM32F446RET6',0x421,512,128,0,8]]){
  // Some part numbers are sold only in UFBGA/WLCSP: check against exact catalogue.
  const actual=swdProfile(name)?name:name.slice(0,11),s=new Mock(actual),p=s.pr;
  assert.equal(p.pid,pid,name);assert.equal(p.flash,flash*1024,name);assert.equal(p.ram,ram*1024,name);assert.equal(p.ccm,ccm*1024,name);assert.equal(p.sectors.length,count,name);
  const b=image(p);if(ccm)new DataView(b.buffer).setUint32(0,0x10000000+p.ccm,true);
  await s.program(b);assert.deepEqual(s.erased,p.sectors.map((_,i)=>i));assert.deepEqual(s.bytes.slice(0,b.length),b);assert.ok(s.bytes.slice(b.length).every(x=>x===255));
  const protectedPart=new Mock(actual);protectedPart.regs.set(OPT,0x0fffaaec);await assert.rejects(protectedPart.program(image(p)),/protection/);assert.equal(protectedPart.erased.length,0);
 }
});
