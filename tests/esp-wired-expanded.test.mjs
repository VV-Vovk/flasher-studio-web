import test from 'node:test';
import assert from 'node:assert/strict';
import {chipFromDescription,checkImageHeader,validateEsp8266Arduino} from '../public/safety.js';
import {espProgram,avrProfile} from '../public/programmers.js';
import {selectedEsp8266Bin} from '../public/universal.js';
function sample(){
 const b=new Uint8Array(0x1040),v=new DataView(b.buffer);
 function img(p,n){
   b.set([0xe9,1,2,0x40],p);v.setUint32(p+4,0x40100000,true);
   v.setUint32(p+8,0x40100000,true);v.setUint32(p+12,n,true);
   b.fill(0x55,p+16,p+16+n);let x=0xef;for(let i=p+16;i<p+16+n;i++)x^=b[i];
   const end=p+Math.ceil((16+n+1)/16)*16;b[end-1]=x;return end;
 }
 b.fill(0xaa,img(0,16),4096);img(4096,32);
 v.setUint32(0x1010,0,true);v.setUint32(0x1014,0,true);
 // Independent reference CRC32/MPEG2 using a table.
 const table=Array.from({length:256},(_,i)=>{let r=i<<24;for(let j=0;j<8;j++)r=(r<<1)^((r<0)?0x04c11db7:0);return r>>>0;});
 let r=0xffffffff;for(let c of b)r=((r<<8)^table[(r>>>24)^c])>>>0;
 v.setUint32(0x1010,b.length,true);v.setUint32(0x1014,r,true);return b;
}
test('ESP8266 Arduino image: exact flash size, CRC, boot/app boundary',()=>{
 const b=sample();assert.equal(validateEsp8266Arduino(b,4194304).offset,0);
 assert.throws(()=>validateEsp8266Arduino(b,2097152),/размер Flash/);
 const bad=b.slice();bad[0x1030]^=1;assert.throws(()=>validateEsp8266Arduino(bad,4194304),/CRC32/);
 assert.throws(()=>validateEsp8266Arduino(b.slice(0x1000),4194304));assert.throws(()=>validateEsp8266Arduino(new Uint8Array(65536),4194304));
});
test('ESP8266 only exact Arduino core and unique binary from verified archive',()=>{
 const r={m:{build:{engine:'arduino',core:'esp8266:esp8266',coreVersion:'3.1.2',fqbn:'esp8266:esp8266:nodemcuv2'},files:[{file:'Blink.ino.bin',format:'bin'}]}};
 assert.equal(selectedEsp8266Bin(r).file,'Blink.ino.bin');r.m.build.coreVersion='3.0.0';assert.equal(selectedEsp8266Bin(r),null);r.m.build.coreVersion='3.1.2';r.m.files.push({file:'fs.bin',format:'bin'});assert.equal(selectedEsp8266Bin(r),null);
});
test('ESP8266 writes only after validation, at zero, never mass erases',async()=>{
 const b=sample(),calls=[],s={chip:'esp8266',flash:4194304,loader:{IS_STUB:true,readFlash:async()=>{},writeFlash:async a=>calls.push(a)}};
 await espProgram(s,b,{},()=>{});assert.equal(calls.length,1);assert.equal(calls[0].fileArray[0].address,0);assert.equal(calls[0].eraseAll,false);
 const bad=b.slice();bad[0]^=1;await assert.rejects(espProgram(s,bad,{},()=>{}));assert.equal(calls.length,1);
});
test('S2 and H2 use distinct chip IDs and exact bootloader offsets',async()=>{
 for(const [chip,desc,id,offset] of [['esp32s2','ESP32-S2',2,4096],['esp32h2','ESP32-H2',16,0]]){
   assert.equal(chipFromDescription(desc),chip);const b=new Uint8Array(0x10018);for(const off of [offset,0x10000]){b[off]=0xe9;b[off+1]=1;b[off+12]=id;}
   assert.equal(checkImageHeader(b.subarray(offset),chip).kind,'esp-image');let n=0;const s={chip,flash:4194304,loader:{writeFlash:async()=>n++}};await espProgram(s,b,{},()=>{});assert.equal(n,1);
   b[0x1000c]=5;await assert.rejects(espProgram(s,b,{},()=>{}));assert.equal(n,1);
 }
 assert.equal(chipFromDescription('ESP8266EX'),'esp8266');assert.equal(chipFromDescription('ESP32-C5'),null);
});
test('Classic Nano and old bootloader, no false Nano Every route',()=>{
 assert.deepEqual(avrProfile('Arduino Nano'),{baud:115200,signature:'1e950f',limit:30720});assert.equal(avrProfile('Arduino Nano (старый загрузчик)').baud,57600);assert.equal(avrProfile('Arduino Nano Every'),null);
});
