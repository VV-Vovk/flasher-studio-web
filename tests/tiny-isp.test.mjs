import test from 'node:test';
import assert from 'node:assert/strict';
import {TINY_ISP,TINY_BOARDS,tinyProfile,tinyFqbn,tinyBuildFqbn} from '../public/tiny-profiles.js';
import {targetCapability} from '../public/target-support.js';
import {builderRefForRequest,TINY_BUILDER_REF} from '../public/universal.js';
import {UsbAsp} from '../public/extra-programmers.js';
test('exact ATtiny geometry, clock and compiler routes',()=>{
 assert.equal(Object.keys(TINY_ISP).length,22);
 assert.equal(TINY_ISP.ATtiny13.page,32);assert.equal(TINY_ISP.ATtiny85.limit,8192);
 for(const [name,b] of Object.entries(TINY_BOARDS)){const fqbn=tinyFqbn(name,b.chip);assert.ok(tinyBuildFqbn(fqbn));assert.equal(builderRefForRequest({engine:'arduino',fqbn}),TINY_BUILDER_REF);assert.equal(targetCapability({fi:2,name,chip:b.chip}).state,'both');assert.deepEqual(targetCapability({fi:2,name,chip:b.chip}).methods,['ISP-программатор','Arduino as ISP']);assert.equal(tinyProfile(name,'ATmega328P'),null);}
 assert.throws(()=>builderRefForRequest({engine:'arduino',fqbn:'TinyCore:avr:x5:chip=85,clock=bogus'}));
});
class Fake extends UsbAsp{
 constructor(chip){super({});this.tiny=TINY_ISP[chip];this.expectedSignature=this.tiny.signature;this.mem=new Uint8Array(this.tiny.limit).fill(0);this.calls=[];}
 async signature(){return this.expectedSignature;}
 async spi(a){this.calls.push(a);return 255;}
 async erase(){this.calls.push('erase');this.mem.fill(255);}
 async page(a,b){assert.equal(b.length,this.tiny.page);this.calls.push(['page',a]);this.mem.set(b,a);}
 async read(a,n){return this.mem.slice(a,a+n);}
}
test('ATtiny full erase and readback use exact geometry; no fuse writes',async()=>{
 for(const chip of Object.keys(TINY_ISP)){const s=new Fake(chip);await s.program(Uint8Array.of(1,2,3));assert.deepEqual([...s.mem.slice(0,4)],[1,2,3,255]);assert.ok(s.mem.slice(3).every(v=>v===255));assert.equal(s.calls.filter(v=>v==='erase').length,1);assert.ok(!s.calls.some(v=>Array.isArray(v)&&v[0]===0xac));}
 const f=new Fake('ATtiny13');await assert.rejects(f.program(new Uint8Array(1025)),/bounds/);assert.deepEqual(f.calls,[]);
 f.signature=async()=> '1e930b';await assert.rejects(f.program(Uint8Array.of(1,2)),/signature/);assert.deepEqual(f.calls,[]);
 const l=new Fake('ATtiny85');l.spi=async()=>0;await assert.rejects(l.program(Uint8Array.of(1,2)),/locked/);assert.deepEqual(l.calls,[]);
});

import {TinyArduinoIsp} from '../public/extra-programmers.js';
class FakeArduino{
 constructor(chip){this.p=TINY_ISP[chip];this.mem=new Uint8Array(this.p.limit).fill(0);this.calls=[];this.addr=0;this.active=false;this.buffer=new Uint8Array(this.p.page).fill(255);}
 async send(frame){assert.equal(frame.at(-1),0x20);const a=frame.slice(0,-1);this.calls.push(a);let out=[];
 switch(a[0]){
 case 0x30:break;
 case 0x31:out=[...new TextEncoder().encode(this.badSignon?'BOOT   ':'AVR ISP')];break;
 case 0x42:assert.equal(a[13]*256+a[14],this.p.page);assert.equal(a[17]*16777216+a[18]*65536+a[19]*256+a[20],this.p.limit);break;
 case 0x50:this.active=true;break;
 case 0x51:this.active=false;break;
 case 0x75:assert.ok(this.active);out=(this.wrong?'1e950f':this.p.signature).match(/../g).map(x=>parseInt(x,16));break;
 case 0x55:this.addr=(a[1]+256*a[2])*2;break;
 case 0x74:assert.ok(this.active);out=[...this.mem.slice(this.addr,this.addr+a[1]*256+a[2])];break;
 case 0x64:assert.ok(this.active);assert.equal(a[1]*256+a[2],this.p.page);assert.equal(a[3],70);this.mem.set(a.slice(4),this.addr);break;
 case 0x56:assert.ok(this.active);out=[255];if(a[1]===0xac&&a[2]===0x80)this.mem.fill(255);
 else if(a[1]===0x40||a[1]===0x48)this.buffer[2*a[3]+(a[1]===0x48?1:0)]=a[4];
 else if(a[1]===0x4c){this.mem.set(this.buffer,(a[2]*256+a[3])*2);this.buffer.fill(255);}
 else assert.ok([0x50,0x58].includes(a[1]));break;
 default:throw Error('Unexpected '+a[0]);}
 this.response=Uint8Array.of(0x14,...out,0x10);}
 async read(n){assert.equal(this.response.length,n);return this.response;}
 async close(){}
}
test('ArduinoISP sign-on, target parameters, erase, full readback and release RESET',async()=>{
 for(const chip of ['ATtiny13','ATtiny85','ATtiny441','ATtiny167']){const f=new FakeArduino(chip),a=new TinyArduinoIsp(f,chip);assert.equal(await a.init(),f.p.signature);assert.equal(f.active,false);await a.program(Uint8Array.of(1,2,3));assert.deepEqual([...f.mem.slice(0,4)],[1,2,3,255]);assert.equal(f.active,false);assert.ok(f.mem.slice(3).every(v=>v===255));assert.equal(f.calls.filter(x=>x[0]===0x56&&x[1]===0xac&&x[2]===0x80).length,1);}
 const f=new FakeArduino('ATtiny85'),a=new TinyArduinoIsp(f,'ATtiny85');f.badSignon=true;await assert.rejects(a.program(Uint8Array.of(1,2)),/Require ArduinoISP/);assert.ok(!f.calls.some(x=>x[0]===0x50||x[0]===0x56));
 const g=new FakeArduino('ATtiny85');g.wrong=true;await assert.rejects(new TinyArduinoIsp(g,'ATtiny85').program(Uint8Array.of(1,2)),/signature/);assert.equal(g.active,false);assert.ok(!g.calls.some(x=>x[0]===0x56&&x[1]===0xac));
});

test('ArduinoISP refuses oversized HEX-derived image before serial traffic',async()=>{
 const f=new FakeArduino('ATtiny13');await assert.rejects(new TinyArduinoIsp(f,'ATtiny13').program(new Uint8Array(1025)),/bounds/);assert.deepEqual(f.calls,[]);
});
