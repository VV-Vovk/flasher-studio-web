import test from 'node:test';
import assert from 'node:assert/strict';
import {auditWbElf,wbSharedBounds,wbCheckMemoryFit} from '../public/wb-memory.js';
const F=0x08000000,A=0x20030000,B=0x20038000;
function fixture(){
 const bytes=new Uint8Array(512),v=new DataView(bytes.buffer),h=(o,x)=>v.setUint16(o,x,true),w=(o,x)=>v.setUint32(o,x,true);
 bytes.set([127,69,76,70,1,1,1]);h(16,2);h(18,40);w(20,1);w(24,F+1);w(28,52);w(32,256);h(40,52);h(42,32);h(44,2);h(46,40);h(48,4);h(50,3);
 [1,128,F,F,8,8,5,4].forEach((x,i)=>w(52+i*4,x));[1,136,A,A,0,32,6,4].forEach((x,i)=>w(84+i*4,x));
 bytes.set([0,0,3,32,1,0,0,8],128);const names=new TextEncoder().encode('\0.text\0MAPPING_TABLE\0.shstrtab\0');bytes.set(names,160);
 [1,1,6,F,128,8,0,0,4,0].forEach((x,i)=>w(296+i*4,x));[7,8,3,A,136,32,0,0,4,0].forEach((x,i)=>w(336+i*4,x));[21,3,0,0,160,names.length,0,0,1,0].forEach((x,i)=>w(376+i*4,x));
 return {bytes,v,hex:[{address:F,data:bytes.slice(128,136)}]};
}
test('WB audit independently matches ELF and HEX including NOLOAD shared table',()=>{const {bytes,hex}=fixture(),audit=auditWbElf(bytes,32,hex);assert.equal(audit.sections.length,2);assert.equal(audit.sections[1].area,'sram2a');assert.equal(audit.sections[1].name,'MAPPING_TABLE');assert.equal(audit.sections[1].loadStart,null);hex[0].data[0]^=1;assert.throws(()=>auditWbElf(bytes,32,hex),/bytes differ/);});
test('WB rejects ELF allocations outside reviewed RAM and initialized shared RAM',()=>{let x=fixture();x.v.setUint32(84+8,0x20040000,true);assert.throws(()=>auditWbElf(x.bytes,32,x.hex),/outside CPU1/);x=fixture();x.v.setUint32(84+12,F+8,true);x.v.setUint32(84+16,4,true);assert.throws(()=>auditWbElf(x.bytes,32,x.hex),/NOLOAD/);});
test('WB live secure RAM bounds and default mapping table required',()=>{const x=fixture(),audit=auditWbElf(x.bytes,32,x.hex),p={audit,flashKiB:32};const rv=(0x80000000|(10<<18)|(15<<25))>>>0;assert.deepEqual(wbSharedBounds(rv,0),{aEnd:A+10240,bEnd:B+15360,ipccDefault:true});assert.doesNotThrow(()=>wbCheckMemoryFit(p,65536,rv,0));assert.throws(()=>wbCheckMemoryFit(p,16384,rv,0),/budget/);assert.throws(()=>wbCheckMemoryFit(p,65536,0x80000000,0),/boundary/);assert.throws(()=>wbCheckMemoryFit(p,65536,rv,1),/IPCCDBA/);assert.throws(()=>wbCheckMemoryFit({...p,audit:{...audit,sections:audit.sections.map(y=>({...y,name:'wrong'}))}},65536,rv,0),/MAPPING_TABLE/);});
