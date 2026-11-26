import test from 'node:test';
import assert from 'node:assert/strict';
import {StLinkF0,stLinkProfile} from '../public/extra-programmers.js';
const KEY=0x40022004,SR=0x4002200c,CR=0x40022010,AR=0x40022014,OBR=0x4002201c,WRP=0x40022020,BASE=0x08000000,DH=0xe000edf0;
class Mock extends StLinkF0{
 constructor(){super({productId:0x3748},stLinkProfile('STM32F070F6P6'));this.memory=new Uint8Array(32768).fill(0);this.registers=new Map([[0x40015800,0x10006445],[0xe000ed00,0x410cc200],[CR,0x80],[SR,0],[OBR,0],[WRP,0xff],[DH,0]]);this.writes=[];this.pages=[];this.id='stm32-0102030405060708090a0b0c';}
 async reg(a){if(!this.registers.has(a))throw Error('Unknown register '+a.toString(16));return this.registers.get(a);}
 async read(a,n){if(a===this.pr.sizeReg)return Uint8Array.of(32,0);if(a===this.pr.uid)return Uint8Array.from({length:12},(_,i)=>i+1);if(a<BASE||a+n>BASE+this.memory.length)throw Error('Read range');return this.memory.slice(a-BASE,a-BASE+n);}
 async put(a,v){this.writes.push([a,v]);if(a===KEY){if(v===0xcdef89ab)this.registers.set(CR,0);return;}if(a===DH){this.registers.set(DH,1<<17);return;}if(a===SR){this.registers.set(SR,this.registers.get(SR)&~v);return;}if(a===CR&&v===0x42){let p=this.registers.get(AR)-BASE;assert.equal(p%1024,0);assert.ok(p>=0&&p<32768);this.pages.push(p);this.memory.fill(255,p,p+1024);this.registers.set(SR,0x20);}this.registers.set(a,v);}
 async writeHalfword(a,b){assert.equal(this.registers.get(CR),1);assert.equal(a%2,0);this.memory.set(b,a-BASE);this.registers.set(SR,0x20);}
}
function image(){let b=new Uint8Array(13).fill(0x55),v=new DataView(b.buffer);v.setUint32(0,0x20001800,true);v.setUint32(4,0x08000009,true);return b;}
test('F070 exact profile and TR alias; no generic F0 or F1 regression',()=>{
 assert.equal(stLinkProfile('STM32F070F6P6TR').flash,32768);assert.equal(stLinkProfile('STM32F070F6P6').ram,6144);assert.equal(stLinkProfile('STM32F070CBT6'),null);assert.equal(stLinkProfile('STM32F103CBT6').flash,131072);
});
test('F070 full page erase, halfword program, entire flash verify and lock',async()=>{
 const p=new Mock(),b=image();await p.program(b);assert.deepEqual(p.pages,Array.from({length:32},(_,i)=>i*1024));assert.deepEqual(p.memory.slice(0,b.length),b);assert.ok(p.memory.slice(b.length).every(x=>x===255));assert.equal(p.registers.get(CR),0x80);assert.ok(p.writes.every(([a,v])=>a!==0x40022008&&a!==0x1ffff800&&!(a===CR&&v&0x2030)));
});
test('Wrong ID, RDP or sector protection prevents erase',async()=>{
 for(const [a,v] of [[0x40015800,0x444],[OBR,4],[OBR,1],[WRP,0x7f]]){let p=new Mock();p.registers.set(a,v);await assert.rejects(p.program(image()));assert.equal(p.pages.length,0);}
});
test('Corrupt readback is rejected and flash relocked',async()=>{
 const p=new Mock(),read=p.read.bind(p);p.read=async(a,n)=>{let b=await read(a,n);if(a===BASE+32768-256)b[0]^=1;return b;};await assert.rejects(p.program(image()),/readback/);assert.equal(p.registers.get(CR),0x80);
});
test('Overflow and invalid vector fail before any write',async()=>{
 const p=new Mock();await assert.rejects(p.program(new Uint8Array(32769)),/range/);await assert.rejects(p.program(new Uint8Array(8)),/векторов/);assert.equal(p.writes.length,0);
});
