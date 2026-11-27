import test from 'node:test';
import assert from 'node:assert/strict';
import {TINY_ISP,TINY_BOARDS,tinyProfile,tinyFqbn,tinyBuildFqbn} from '../public/tiny-profiles.js';
import {targetCapability} from '../public/target-support.js';
import {builderRefForRequest,TINY_BUILDER_REF} from '../public/universal.js';
import {UsbAsp} from '../public/extra-programmers.js';
test('exact ATtiny geometry, clock and compiler routes',()=>{
 assert.equal(Object.keys(TINY_ISP).length,9);
 assert.equal(TINY_ISP.ATtiny13.page,32);assert.equal(TINY_ISP.ATtiny85.limit,8192);
 for(const [name,b] of Object.entries(TINY_BOARDS)){const fqbn=tinyFqbn(name,b.chip);assert.ok(tinyBuildFqbn(fqbn));assert.equal(builderRefForRequest({engine:'arduino',fqbn}),TINY_BUILDER_REF);assert.equal(targetCapability({fi:2,name,chip:b.chip}).state,'both');assert.deepEqual(targetCapability({fi:2,name,chip:b.chip}).methods,['ISP-программатор']);assert.equal(tinyProfile(name,'ATmega328P'),null);}
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
