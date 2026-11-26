import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {swdProfile,Stm32SwdSession} from '../public/stm32-swd.js';
import {H7AB_PROFILES,h7abBanks} from '../public/stm32-h7ab.js';
import {stmFirmwareImage,stmSessionIdentity} from '../public/programmers.js';
import {targetCapability} from '../public/target-support.js';
import {DapStm32} from '../public/cmsis-dap.js';
import {StLinkF1} from '../public/extra-programmers.js';
const cat=JSON.parse(readFileSync(new URL('../public/stm32-targets.json',import.meta.url)));
const F=0x52002000,B=0x08000000,UID=Uint8Array.from({length:12},(_,i)=>i+1);
class Fake extends Stm32SwdSession{
 constructor(name){super(swdProfile(name));const p=this.pr;this.banks=h7abBanks(p);this.id='stm32-0102030405060708090a0b0c';this.mem=new Uint8Array(p.flash);this.erased=[];this.written=[];this.regs=new Map([[p.idReg,p.pid],[0xe000ed00,p.core<<4],[0xe000ed14,0],[F+0x18,1],[F+0x1c,0xaa00],[F+0x40,0x1ff00800]]);
 for(const bank of this.banks){const r=bank.reg;for(const [off,v] of [[0xc,1],[0x10,0],[0x28,0xfff],[0x30,0xfff],[0x38,0xffffffff]])this.regs.set(r+off,v);}}
 async reg(a){if(!this.regs.has(a))throw Error('Unknown register '+a.toString(16));return this.regs.get(a);}
 async put(a,v){
  if(a===0xe000edf0){this.regs.set(a,1<<17);return;}
  const bank=this.banks.find(b=>a>=b.reg&&a<b.reg+0x100);assert.ok(bank,'valid bank register only');const r=bank.reg,o=a-r;
  assert.ok([4,0xc,0x14].includes(o),'no option writes');
  if(o===4){if(v===0xcdef89ab&&!(this.failUnlock===r))this.regs.set(r+0xc,0);return;}
  if(o===0x14){this.regs.set(r+0x10,this.regs.get(r+0x10)&~v);return;}
  if(v&32){assert.equal(v&15,4);const n=(v>>>6)&127;assert.ok(n<bank.size/8192);const start=bank.base-B+n*8192;this.erased.push([r,n]);this.mem.fill(255,start,start+8192);this.regs.set(r+0x10,this.failErase===r?0x20000:0x10000);}
  this.regs.set(a,v);
 }
 async read(a,n){if(a===this.pr.sizeReg)return Uint8Array.of(this.pr.flash/1024&255,this.pr.flash/1024>>>8);if(a===this.pr.uid)return UID.slice();assert.ok(a>=B&&a+n<=B+this.pr.flash);const b=this.mem.slice(a-B,a-B+n);if(this.corrupt&&a>=B+this.pr.flash-1024)b[0]^=1;return b;}
 async writeFlashWord16(a,b){
  assert.equal(a%16,0);assert.equal(b.length,16);const bank=this.banks.find(x=>a>=x.base&&a+16<=x.base+x.size);assert.ok(bank);assert.equal(this.regs.get(bank.reg+0xc),2);
  if(this.partial===bank.reg){this.regs.set(bank.reg+0x10,2);throw Error('link error');}
  this.written.push([bank.reg,a]);this.mem.set(b,a-B);this.regs.set(bank.reg+0x10,0x10000);
 }
}
function image(p,cross=false){const b=new Uint8Array(cross?1048576+17:33).fill(255),v=new DataView(b.buffer);v.setUint32(0,0x24100000,true);v.setUint32(4,B+9,true);b[8]=42;b[b.length-1]=7;if(cross)b[1048576]=12;return b;}
test('RM0455 exact safe-density profiles; flash-only and ambiguous 1 MiB rejected',()=>{
 assert.equal(Object.keys(H7AB_PROFILES).length,36);
 for(const n of Object.keys(H7AB_PROFILES)){const name=n.replace('x','6'),p=swdProfile(name);assert.equal(p.pid,0x480);assert.equal(p.wordSize,16);assert.equal(p.sectorSize,8192);assert.equal(targetCapability({fi:5,name},cat).state,'flash');assert.equal(swdProfile(n),null);}
 for(const n of ['STM32H7A3ZGT6','STM32H7A3VGT6','STM32H7A3ZIX6','STM32H745ZIT6'])assert.equal(swdProfile(n),null);
});
test('RM0455 single bank and both contiguous banks; 16-byte row, final tail and locks',async()=>{
 for(const [n,cross] of [['STM32H7B0VBT6',false],['STM32H7A3ZIT6',true],['STM32H7B3VIT6',false]]){
  const s=new Fake(n),b=image(s.pr,cross);await s.program(b);assert.equal(s.erased.length,s.pr.flash/8192);assert.deepEqual(s.mem.slice(0,b.length),b);assert.ok(s.mem.slice(b.length).every(x=>x===255));
  for(const bank of s.banks)assert.equal(s.regs.get(bank.reg+0xc),1);
  if(cross){assert.ok(s.written.some(([r,a])=>r===F+0x100&&a===B+1048576));assert.ok(s.erased.some(([r,n])=>r===F+0x100&&n===127));}
 }
});
test('H7A/B second-bank protection and unlock failures are blocked before erase',async()=>{
 for(const [a,v] of [[F+0x1c,0x8000aa00],[F+0x18,0x80000001],[F+0x128,0],[F+0x130,0],[F+0x138,0x7fffffff],[F+0x110,0x4000000],[0xe000ed14,0x20000]]){
  const s=new Fake('STM32H7A3ZIT6');s.regs.set(a,v);await assert.rejects(s.program(image(s.pr)));assert.deepEqual(s.erased,[]);
 }
 const s=new Fake('STM32H7A3ZIT6');s.failUnlock=F+0x100;await assert.rejects(s.program(image(s.pr)),/locked/);assert.equal(s.erased.length,0);assert.equal(s.regs.get(F+0xc),1);
});
test('H7A/B failed programming never forces partial ECC row; other bank relocks',async()=>{
 const s=new Fake('STM32H7A3ZIT6');s.partial=F+0x100;await assert.rejects(s.program(image(s.pr,true)),/power-cycle/);assert.equal(s.regs.get(F+0xc),1);assert.equal(s.regs.get(F+0x10c),2);
 for(const flag of ['failErase','corrupt']){const a=new Fake('STM32H7A3ZIT6');a[flag]=flag==='failErase'?F+0x100:true;await assert.rejects(a.program(image(a.pr)));assert.equal(a.regs.get(F+0xc),1);assert.equal(a.regs.get(F+0x10c),1);}
});
test('16-byte transport: DAP four words and ST-LINK exact block',async()=>{
 const b=Uint8Array.from({length:16},(_,i)=>i),calls=[],d=new DapStm32({device:{},writeWord:async(...a)=>calls.push(a)},{});
 await d.writeFlashWord16(B,b);assert.equal(calls.length,4);for(let i=0;i<4;i++)assert.deepEqual(calls[i],[B+i*4,new DataView(b.buffer).getUint32(i*4,true)]);
 const s=new StLinkF1({productId:0x3748},{});s.cmd=async(...a)=>calls.push(a);s.rwStatus=async()=>{};await s.writeFlashWord16(B,b);assert.deepEqual(calls[4][0],[0xf2,8,0,0,0,8,16,0]);assert.deepEqual(calls[4][2],b);await assert.rejects(d.writeFlashWord16(B+4,b));await assert.rejects(s.writeFlashWord16(B,new Uint8Array(32)));
});
test('browser preparation shares H7 stack validation, uses L0 zero-filled HEX gaps, delegates split UID',async()=>{
 const h=swdProfile('STM32H723VGT6'),v=new Uint8Array(16).fill(255);new DataView(v.buffer).setUint32(0,0x24020000,true);new DataView(v.buffer).setUint32(4,B+9,true);
 assert.deepEqual(stmFirmwareImage([{address:B,data:v}],h),v);
 const p=swdProfile('STM32L011D3P6'),a=new Uint8Array(12);new DataView(a.buffer).setUint32(0,0x20000800,true);new DataView(a.buffer).setUint32(4,B+9,true);const out=stmFirmwareImage([{address:B,data:a},{address:B+16,data:Uint8Array.of(7)}],p);assert.deepEqual([...out.slice(12)],[0,0,0,0,7]);
 assert.equal(await stmSessionIdentity({identify:async()=> 'split-uid',read:()=>{throw Error('wrong UID read');}},p),'split-uid');
});
