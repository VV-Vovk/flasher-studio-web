// Shared STM32 Flash algorithms over an explicit SWD memory transport.
// No USB/HID dependencies: adapter supplies read, reg, put, writeHalfword.
// The exact order code is user selected; device ID/size are geometry checks, not package detection.
import {validateStmVector} from './programmers.js';
import {SECTOR_PROFILES,identifySector,programSector} from './stm32-sector.js';
export {SECTOR_PROFILES};
const u=a=>Uint8Array.from(a),eq=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]),hex=a=>Array.from(a,x=>x.toString(16).padStart(2,'0')).join(''),wait=ms=>new Promise(r=>setTimeout(r,ms));
// RM0360 rev 5: F070x6, 32 KiB main flash, 1 KiB pages, halfword programming.
// Device ID and size identify compatible silicon geometry, not exact package/order code.
// Explicit order-code allowlist, based on RM0360/RM0091 and ST datasheets.
// No inference from family name, and no dynamic selection by ID alone.
function f0Profile(pid,kib,ramKiB,pageSize){
 return Object.freeze({pid,flash:kib*1024,ram:ramKiB*1024,uid:0x1ffff7ac,sizeReg:0x1ffff7cc,idReg:0x40015800,pageSize,wrpMask:Math.min(0xffffffff,2**(kib/4)-1)});
}
export const STLINK_F0_PROFILES=Object.freeze({
 STM32F030F4P6:f0Profile(0x444,16,4,1024),
 STM32F030K6T6:f0Profile(0x444,32,4,1024),
 STM32F030C6T6:f0Profile(0x444,32,4,1024),
 STM32F030C8T6:f0Profile(0x440,64,8,1024),
 STM32F030R8T6:f0Profile(0x440,64,8,1024),
 STM32F042F6P6:f0Profile(0x445,32,6,1024),
 STM32F042C6T6:f0Profile(0x445,32,6,1024),
 STM32F042K6T6:f0Profile(0x445,32,6,1024),
 STM32F070F6P6:f0Profile(0x445,32,6,1024),
 STM32F070C6T6:f0Profile(0x445,32,6,1024),
 STM32F070CBT6:f0Profile(0x448,128,16,2048),
 STM32F070RBT6:f0Profile(0x448,128,16,2048),
 STM32F072RBT6:f0Profile(0x448,128,16,2048),
 STM32F072CBT6:f0Profile(0x448,128,16,2048)
});
export const STLINK_F1_PROFILES=Object.freeze({
 STM32F103C8T6:Object.freeze({pid:0x410,flash:64*1024,ram:20*1024,uid:0x1ffff7e8,sizeReg:0x1ffff7e0}),
 STM32F103CBT6:Object.freeze({pid:0x410,flash:128*1024,ram:20*1024,uid:0x1ffff7e8,sizeReg:0x1ffff7e0}),
 STM32F103R8T6:Object.freeze({pid:0x410,flash:64*1024,ram:20*1024,uid:0x1ffff7e8,sizeReg:0x1ffff7e0}),
 STM32F103RBT6:Object.freeze({pid:0x410,flash:128*1024,ram:20*1024,uid:0x1ffff7e8,sizeReg:0x1ffff7e0}),
 STM32F103V8T6:Object.freeze({pid:0x410,flash:64*1024,ram:20*1024,uid:0x1ffff7e8,sizeReg:0x1ffff7e0}),
 STM32F103VBT6:Object.freeze({pid:0x410,flash:128*1024,ram:20*1024,uid:0x1ffff7e8,sizeReg:0x1ffff7e0})
});
// Exact base-part geometry from the existing ROM profile inventory, not inferred from arbitrary names.
// F030xC and F09x deliberately excluded until their protection maps are separately reviewed.
import {STM32_ROM_PROFILES} from './stm32-rom-profiles.js';
const F0_BASES=["STM32F030C6","STM32F030C8","STM32F030F4","STM32F030K6","STM32F030R8","STM32F031C4","STM32F031C6","STM32F031E6","STM32F031F4","STM32F031F6","STM32F031G4","STM32F031G6","STM32F031K4","STM32F031K6","STM32F051C4","STM32F051C6","STM32F051C8","STM32F051K4","STM32F051K6","STM32F051K8","STM32F051R4","STM32F051R6","STM32F051R8","STM32F051T8","STM32F071C8","STM32F071CB","STM32F071RB","STM32F071V8","STM32F071VB","STM32F072C8","STM32F072CB","STM32F072R8","STM32F072RB","STM32F072V8","STM32F072VB"];
const F1_BASES=["STM32F103C4","STM32F103C6","STM32F103C8","STM32F103CB","STM32F103R4","STM32F103R6","STM32F103R8","STM32F103RB","STM32F103RC","STM32F103RD","STM32F103RE","STM32F103T4","STM32F103T6","STM32F103T8","STM32F103TB","STM32F103V8","STM32F103VB","STM32F103VC","STM32F103VD","STM32F103VE","STM32F103ZC","STM32F103ZD","STM32F103ZE"];
export const F0_BASE_PROFILES=Object.freeze(Object.fromEntries(F0_BASES.map(n=>{const p=STM32_ROM_PROFILES[n];return [n,f0Profile(p.pid,p.flash/1024,p.ram/1024,/^STM32F07[12]/.test(n)?2048:1024)];})));
export const F1_BASE_PROFILES=Object.freeze(Object.fromEntries(F1_BASES.map(n=>{const p=STM32_ROM_PROFILES[n];return [n,Object.freeze({...p,pageSize:p.pid===0x414?2048:1024,wrpMask:p.pid===0x414?0xffffffff:Math.min(0xffffffff,2**(p.flash/4096)-1)})];})));
function basePart(n){const m=/^(STM32F(?:030|031|051|071|072|103)[A-Z][468BCDE])(?:[A-Z][0-9])?$/.exec(n);return m?.[1]||'';}

export function swdProfile(name){
 const n=String(name).toUpperCase().replace(/TR$/,'');
 const key=basePart(n);
 return STLINK_F0_PROFILES[n]||F0_BASE_PROFILES[key]||STLINK_F1_PROFILES[n]||F1_BASE_PROFILES[key]||SECTOR_PROFILES[n]||null;
}

const F0REG=Object.freeze({KEY:0x40022004,SR:0x4002200c,CR:0x40022010,AR:0x40022014,OBR:0x4002201c,WRP:0x40022020,DHCSR:0xe000edf0,CPUID:0xe000ed00,FLASH:0x08000000});

export class Stm32SwdSession {
 constructor(pr){this.pr=pr;}
 async identify(){if(this.pr.controller==='f2f4-sector')return identifySector(this);return this.pr.idReg?this.identifyF0():this.identifyF1();}
 async program(b,progress=()=>{}){if(this.pr.controller==='f2f4-sector')return programSector(this,b,progress);return this.pr.idReg?this.programF0(b,progress):this.programF1(b,progress);}
 async identifyF1(){if((await this.reg(0xe0042000)&0xfff)!==this.pr.pid)throw Error('STM32F103 density ID mismatch');let b=await this.read(this.pr.sizeReg,2);if((b[0]+256*b[1])*1024!==this.pr.flash)throw Error('Flash size mismatch');let uid=await this.read(this.pr.uid,12);if(uid.every(x=>!x)||uid.every(x=>x===255))throw Error('Invalid UID');return 'stm32-'+hex(uid);}

 async ready(){let end=Date.now()+20000;while(Date.now()<end){let s=await this.reg(0x4002200c);if(!(s&1)){if(s&0x14)throw Error('STM32 Flash status '+s.toString(16));return;}await wait(3);}throw Error('Flash busy timeout');}
 async enableHsi(){
   const a=0x40021000,r=await this.reg(a);
   if(!(r&1))await this.put(a,r|1);
   const end=Date.now()+1000;
   do{if((await this.reg(a)&3)===3)return;await wait(2);}while(Date.now()<end);
   throw Error('HSI not ready; Flash untouched');
 }
 async programF1(b,progress=()=>{}){
   validateStmVector(b,this.pr);if(b.length>this.pr.flash)throw Error('Flash range');
   if(await this.identify()!==this.id)throw Error('UID changed');
   await this.put(0xe000edf0,0xa05f0003);
   if(!(await this.reg(0xe000edf0)&(1<<17)))throw Error('Core not halted');
   await this.ready();
   const mask=this.pr.wrpMask??Math.min(0xffffffff,2**(this.pr.flash/4096)-1);
   if(((await this.reg(0x40022020)&mask)>>>0)!==mask||(await this.reg(0x4002201c)&3))throw Error('Write protection present');
   await this.enableHsi();
   if(await this.reg(0x40022010)&0x80){await this.put(0x40022004,0x45670123);await this.put(0x40022004,0xcdef89ab);}
   if(await this.reg(0x40022010)&0x80)throw Error('Flash locked');
   try{
     await this.put(0x4002200c,0x34);await this.put(0x40022010,4);await this.put(0x40022010,0x44);await this.ready();
     await this.put(0x40022010,1);
     for(let i=0;i<b.length;i+=2){const p=u([b[i],b[i+1]??255]);if(p[0]!==255||p[1]!==255){await this.writeHalfword(0x08000000+i,p);await this.ready();}if(i%256===0)progress(i/b.length*.9);}
     await this.put(0x40022010,0);
     for(let i=0;i<this.pr.flash;i+=256){const n=Math.min(256,this.pr.flash-i),expected=new Uint8Array(n).fill(255);expected.set(b.slice(i,i+n));if(!eq(expected,await this.read(0x08000000+i,n)))throw Error('SWD readback mismatch');progress(.9+.1*(i+n)/this.pr.flash);}
   }finally{await this.ready();await this.put(0x40022010,0x80);if(!(await this.reg(0x40022010)&0x80))throw Error('Flash relock failed');}
 }

 async identifyF0(){
   if((await this.reg(this.pr.idReg)&0xfff)!==this.pr.pid)throw Error('STM32F0 device ID mismatch');
   if(((await this.reg(F0REG.CPUID)>>>4)&0xfff)!==0xc20)throw Error('Cortex-M0 required');
   const b=await this.read(this.pr.sizeReg,2);
   if((b[0]+256*b[1])*1024!==this.pr.flash)throw Error('STM32F0 Flash size mismatch');
   const uid=await this.read(this.pr.uid,12);
   if(uid.length!==12||uid.every(x=>x===0)||uid.every(x=>x===255))throw Error('Invalid UID');
   return 'stm32-'+hex(uid);
 }
 async idleF0(){
   const end=Date.now()+10000;
   do{const s=await this.reg(F0REG.SR);if(!(s&1))return s;await wait(3);}while(Date.now()<end);
   throw Error('STM32F0 Flash busy timeout');
 }
 async completeF0(){
   const s=await this.idleF0();
   if(s&0x14)throw Error('STM32F0 Flash status '+s.toString(16));
   if(!(s&0x20))throw Error('STM32F0 missing EOP');
   await this.put(F0REG.SR,0x20);
 }
 async programF0(b,progress=()=>{}){
   if(!(b instanceof Uint8Array)||b.length>this.pr.flash)throw Error('STM32F0 Flash range');
   validateStmVector(b,this.pr);
   if(await this.identify()!==this.id)throw Error('UID changed');
   await this.put(F0REG.DHCSR,0xa05f0003);
   if(!(await this.reg(F0REG.DHCSR)&(1<<17)))throw Error('Core not halted');
   await this.idleF0();
   // Reject all read-protection levels except 0, any option-byte error, and any
   // protected sector among the implemented 4 KiB sectors.
   if((await this.reg(F0REG.OBR)&7)!==0||((await this.reg(F0REG.WRP)&this.pr.wrpMask)>>>0)!==this.pr.wrpMask)throw Error('STM32F0 Flash protection present');
   await this.enableHsi();
   if(await this.reg(F0REG.CR)&0x80){
     await this.put(F0REG.KEY,0x45670123);await this.put(F0REG.KEY,0xcdef89ab);
   }
   if(await this.reg(F0REG.CR)&0x80)throw Error('STM32F0 Flash locked');
   try{
     await this.put(F0REG.SR,0x34);
     // Existing UI explicitly confirms a complete main-flash erase. Never
     // erase/alter option bytes or system memory.
     for(let i=0;i<this.pr.flash;i+=this.pr.pageSize){
       await this.put(F0REG.CR,2);await this.put(F0REG.AR,F0REG.FLASH+i);
       await this.put(F0REG.CR,0x42);await this.completeF0();
     }
     await this.put(F0REG.CR,1);
     for(let i=0;i<b.length;i+=2){
       const p=u([b[i],b[i+1]??255]);
       if(p[0]!==255||p[1]!==255){await this.writeHalfword(F0REG.FLASH+i,p);await this.completeF0();}
       if(i%256===0)progress(i/b.length*0.9);
     }
     await this.put(F0REG.CR,0);
     // Verify the whole main flash including erased tail and odd-byte padding.
     for(let i=0;i<this.pr.flash;i+=256){
       const n=Math.min(256,this.pr.flash-i),expected=new Uint8Array(n).fill(255);
       expected.set(b.slice(i,i+n));
       if(!eq(expected,await this.read(F0REG.FLASH+i,n)))throw Error('STM32F0 SWD readback mismatch @0x'+(F0REG.FLASH+i).toString(16));
       progress(0.9+0.1*(i+n)/this.pr.flash);
     }
   }finally{
     // If the device is still busy or lost, report the failure rather than
     // attempting option reload/unprotect. User power-cycles after programming.
     await this.idleF0();await this.put(F0REG.CR,0x80);
     if(!(await this.reg(F0REG.CR)&0x80))throw Error('STM32F0 Flash relock failed');
   }
 }
}
