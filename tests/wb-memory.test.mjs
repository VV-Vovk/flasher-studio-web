import test from 'node:test';
import assert from 'node:assert/strict';
import {auditWbElf,wbSharedBounds,wbCheckMemoryFit,wbConfigFromLimit} from '../public/wb-memory.js';
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

test('WB config export uses live SFSA and reserves a page for factory high FUS',()=>{const p={applicationOnly:true,flash:256*1024,pageSize:4096};assert.deepEqual(wbConfigFromLimit(p,128*1024),{wbAppFlashKiB:128});assert.deepEqual(wbConfigFromLimit(p,p.flash),{wbAppFlashKiB:252});assert.throws(()=>wbConfigFromLimit(p,p.flash+4096));assert.throws(()=>wbConfigFromLimit(p,4097));});

test('WB downloaded config is valid JSON',async()=>{const {readFileSync}=await import('node:fs');const h=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');const expr=h.match(/new Blob\(\[(JSON\.stringify\(cfg,null,2\)\+'[^']+')\],\{type:'application\/json'\}\)/)?.[1];assert.ok(expr);assert.deepEqual(JSON.parse(new Function('cfg','return '+expr)({wbAppFlashKiB:128})),{wbAppFlashKiB:128});});

test('WB3x/5x lower SRAM1 limit rejects address gap while preserving SRAM2 mapping',()=>{const {bytes,hex}=fixture(),audit=auditWbElf(bytes,32,hex,0x08000000,32);assert.equal(audit.layout,'wb3x5x-sram32-an5451');const p={audit,flashKiB:32};assert.doesNotThrow(()=>wbCheckMemoryFit(p,65536,(0x80000000|(10<<18))>>>0,0,32));assert.throws(()=>wbCheckMemoryFit(p,65536,0xffffffff,0,64),/geometry|audit/);p.audit.sections.push({name:'.bad',area:'sram1',start:0x20008000,endExclusive:0x20008004,loadStart:null});assert.throws(()=>wbCheckMemoryFit(p,65536,(0x80000000|(10<<18))>>>0,0,32),/boundary/);});

test('WB1x SRAM2b is four KiB, uses only two SBRSA_B bits',()=>{const {bytes,hex}=fixture();const a=auditWbElf(bytes,32,hex,0x08000000,12);assert.equal(a.layout,'wb1x-sram12-rm0473');assert.equal(wbSharedBounds(0xffffffff,0,12).bEnd,0x20039000);assert.equal(wbSharedBounds((0x80000000|(31<<25))>>>0,0,12).bEnd,0x20038c00);const p={audit:a,flashKiB:32};a.sections.push({name:'invalid',area:'sram2b',start:0x20039000,endExclusive:0x20039004,loadStart:null});assert.throws(()=>wbCheckMemoryFit(p,65536,0xffffffff,0,12),/boundary/);});
