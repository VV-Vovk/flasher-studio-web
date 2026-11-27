import test from 'node:test';
import assert from 'node:assert/strict';
import {NrfSwd,nrfGeometry,nrfImage} from '../public/nrf-swd.js';
const info={part:0x52832,page:4096,pages:128,flashKiB:512,ramKiB:64,uid:[1,2],cpuid:0x410fc241};
const p=nrfGeometry('nRF52832',info);
function image(){const b=new Uint8Array(12),v=new DataView(b.buffer);v.setUint32(0,0x20001000,true);v.setUint32(4,9,true);return [{address:0,data:b}];}
test('nRF geometry and standalone contiguous flash image only',()=>{
 assert.equal(p.flash,524288);assert.equal(nrfImage(image(),p).pages,1);
 for(const x of [{part:0x52840},{page:2048},{pages:64},{ramKiB:32},{uid:[0,0]}])assert.throws(()=>nrfGeometry('nRF52832',{...info,...x}));
 assert.throws(()=>nrfImage([{address:0x1000,data:new Uint8Array(16)}],p));
 assert.throws(()=>nrfImage([...image(),{address:0x10001000,data:new Uint8Array(4)}],p));
 assert.throws(()=>nrfImage([...image(),{address:16,data:new Uint8Array(4)}],p));
});
class Fake{
 constructor(){this.regs=new Map([[0x10000100,info.part],[0x10000010,info.page],[0x10000014,info.pages],[0x1000010c,info.ramKiB],[0x10000110,info.flashKiB],[0x10000060,1],[0x10000064,2],[0xe000ed00,info.cpuid],[0xe000edf0,0],[0x4001e400,1],[0x4001e504,0]]);this.memory=new Uint32Array(524288/4).fill(0xffffffff);this.calls=[];}
 async readWord(a){return a<524288?this.memory[a/4]:this.regs.get(a)??0;}
 async writeWord(a,w){this.calls.push([a,w]);if(a===0xe000edf0)this.regs.set(a,0x20000);else if(a===0x4001e504)this.regs.set(a,w);else if(a===0x4001e508){assert.equal(this.regs.get(0x4001e504),2);assert.equal(w%4096,0);if(!this.eraseFails)this.memory.fill(0xffffffff,w/4,w/4+1024);}else{assert.ok(a<4096);assert.equal(this.regs.get(0x4001e504),1);this.memory[a/4]&=w;if(this.corrupt)this.memory[a/4]^=1;}}
}
test('nRF blank-only write, verify, relock, reject occupied or protected pages',async()=>{
 let f=new Fake(),s=new NrfSwd(f,'nRF52832'),r=await s.program(image(),()=>true);
 assert.equal(r.verified,true);assert.equal(r.executionVerified,false);assert.equal(f.memory[0],0x20001000);assert.equal(f.memory[1024],0xffffffff);assert.equal(f.regs.get(0x4001e504),0);assert.ok(f.calls.every(([a])=>a===0xe000edf0||a===0x4001e504||a<4096));
 f=new Fake();s=new NrfSwd(f,'nRF52832');assert.equal((await s.program(image(),()=>false)).cancelled,true);assert.deepEqual(f.calls,[]);
 f=new Fake();f.memory[10]=0;s=new NrfSwd(f,'nRF52832');await assert.rejects(s.program(image(),()=>true),/not blank/);assert.ok(f.calls.every(([a])=>a===0xe000edf0));
 f=new Fake();f.regs.set(0x40000600,1);s=new NrfSwd(f,'nRF52832');await assert.rejects(s.program(image(),()=>true),/BPROT/);
 f=new Fake();f.corrupt=true;s=new NrfSwd(f,'nRF52832');await assert.rejects(s.program(image(),()=>true),/readback/);assert.equal(f.regs.get(0x4001e504),0);
});

test('nRF52840 exact geometry and ACL reject; reset during write never reports success',async()=>{
 const x={...info,part:0x52840,flashKiB:1024,ramKiB:256,pages:256};
 assert.equal(nrfGeometry('nRF52840',x).flash,1048576);
 const f=new Fake();for(const [a,v] of [[0x10000100,x.part],[0x10000014,x.pages],[0x1000010c,x.ramKiB],[0x10000110,x.flashKiB],[0x4001e808,1]])f.regs.set(a,v);
 await assert.rejects(new NrfSwd(f,'nRF52840').program(image(),()=>true),/ACL/);assert.ok(f.calls.every(([a])=>a===0xe000edf0));
 const r=new Fake(),write=r.writeWord.bind(r);r.writeWord=async(a,w)=>{await write(a,w);if(a===0)r.regs.set(0xe000edf0,0x02020000);};
 await assert.rejects(new NrfSwd(r,'nRF52832').program(image(),()=>true),/reset detected/);
 assert.equal(r.regs.get(0x4001e504),0);assert.equal(r.memory[1],0xffffffff);
});

test('all seven physical nRF52 identities and RAM/Flash variants',()=>{
 for(const [chip,f,r] of [['nRF52805',192,24],['nRF52810',192,24],['nRF52811',192,24],['nRF52820',256,32],['nRF52832',256,32],['nRF52832',512,64],['nRF52833',512,128],['nRF52840',1024,256]]){
  const q=nrfGeometry(chip,{...info,part:parseInt(chip.slice(3),16),flashKiB:f,ramKiB:r,pages:f/4});assert.equal(q.flash,f*1024);assert.equal(q.ram,r*1024);
 }
});
test('reflash requires exact backup, separate approval, only page erase and readback',async()=>{
 const fresh=()=>{const f=new Fake();f.memory[10]=0;f.memory[1024]=0x12345678;return f;};
 const saved=f=>new Uint8Array(f.memory.buffer.slice(0,4096));
 let f=fresh(),s=new NrfSwd(f,'nRF52832'),b=await s.backup(image(),()=>true);
 assert.deepEqual(b.bytes,saved(f));assert.ok(f.calls.every(([a])=>a===0xe000edf0));
 f=fresh();s=new NrfSwd(f,'nRF52832');const options={erase:true,backup:saved(f),confirmErase:()=>true};
 const r=await s.program(image(),()=>true,()=>{},options);assert.equal(r.verified,true);assert.equal(r.erasedPages,1);assert.deepEqual(f.calls.filter(([a])=>a===0x4001e508),[[0x4001e508,0]]);assert.equal(f.memory[10],0xffffffff);assert.equal(f.memory[1024],0x12345678);
 f=fresh();s=new NrfSwd(f,'nRF52832');await assert.rejects(s.program(image(),()=>true,()=>{},{erase:true}),/backup/);assert.deepEqual(f.calls,[]);
 f=fresh();s=new NrfSwd(f,'nRF52832');await assert.rejects(s.program(image(),()=>true,()=>{},{...options,backup:new Uint8Array(4096)}),/backup differs/);assert.ok(f.calls.every(([a])=>a===0xe000edf0));
 f=fresh();s=new NrfSwd(f,'nRF52832');assert.equal((await s.program(image(),()=>true,()=>{},{...options,confirmErase:()=>false})).cancelled,true);assert.ok(f.calls.every(([a])=>a===0xe000edf0));
 f=fresh();f.eraseFails=true;s=new NrfSwd(f,'nRF52832');await assert.rejects(s.program(image(),()=>true,()=>{},options),/erase verification/);assert.equal(f.regs.get(0x4001e504),0);assert.equal(f.memory[0],0xffffffff);
});
