// Shared STM32 Flash algorithms over an explicit SWD memory transport.
// No USB/HID dependencies: adapter supplies read, reg, put, writeHalfword.
// The exact order code is user selected; device ID/size are geometry checks, not package detection.
import {validateStmVector} from './programmers.js';
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
export function swdProfile(name){
 const n=String(name).toUpperCase().replace(/TR$/,'');
 return Object.hasOwn(STLINK_F0_PROFILES,n)?STLINK_F0_PROFILES[n]:Object.hasOwn(STLINK_F1_PROFILES,n)?STLINK_F1_PROFILES[n]:null;
}

const F0REG=Object.freeze({KEY:0x40022004,SR:0x4002200c,CR:0x40022010,AR:0x40022014,OBR:0x4002201c,WRP:0x40022020,DHCSR:0xe000edf0,CPUID:0xe000ed00,FLASH:0x08000000});

export class Stm32SwdSession {
 constructor(pr){this.pr=pr;}
 async identify(){return this.pr.idReg?this.identifyF0():this.identifyF1();}
 async program(b,progress=()=>{}){return this.pr.idReg?this.programF0(b,progress):this.programF1(b,progress);}
 async identifyF1(){if((await this.reg(0xe0042000)&0xfff)!==0x410)throw Error('STM32F103 medium-density ID required');let b=await this.read(this.pr.sizeReg,2);if((b[0]+256*b[1])*1024!==this.pr.flash)throw Error('Flash size mismatch');let uid=await this.read(this.pr.uid,12);if(uid.every(x=>!x)||uid.every(x=>x===255))throw Error('Invalid UID');return 'stm32-'+hex(uid);}

 async ready(){let end=Date.now()+20000;while(Date.now()<end){let s=await this.reg(0x4002200c);if(!(s&1)){if(s&0x14)throw Error('STM32 Flash status '+s.toString(16));return;}await wait(3);}throw Error('Flash busy timeout');}
 async programF1(b,progress=()=>{}){validateStmVector(b,this.pr);if(b.length>this.pr.flash)throw Error('Flash range');if(await this.identify()!==this.id)throw Error('UID changed');await this.put(0xe000edf0,0xa05f0003);if(!(await this.reg(0xe000edf0)&(1<<17)))throw Error('Core not halted');if((await this.reg(0x40022020))!==0xffffffff||(await this.reg(0x4002201c)&2))throw Error('Write protection present');await this.ready();await this.put(0x40022004,0x45670123);await this.put(0x40022004,0xcdef89ab);if(await this.reg(0x40022010)&0x80)throw Error('Flash locked');try{await this.put(0x4002200c,0x34);await this.put(0x40022010,4);await this.put(0x40022010,0x44);await this.ready();await this.put(0x40022010,1);for(let i=0;i<b.length;i+=2){let p=u([b[i],b[i+1]??255]);if(p[0]!==255||p[1]!==255){await this.writeHalfword(0x08000000+i,p);await this.ready();}if(i%256===0)progress(i/b.length);}for(let i=0;i<b.length;i+=256){let p=b.slice(i,i+256);if(!eq(p,await this.read(0x08000000+i,p.length)))throw Error('SWD readback mismatch');}progress(1);}finally{await this.put(0x40022010,0x80).catch(()=>{});} }

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
