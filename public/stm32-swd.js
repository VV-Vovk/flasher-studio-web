// Shared STM32 Flash algorithms over an explicit SWD memory transport.
// No USB/HID dependencies: adapter supplies read, reg, put, writeHalfword.
// The exact order code is user selected; device ID/size are geometry checks, not package detection.
import {validateStmVector} from './programmers.js';
import {SECTOR_PROFILES,sectorProfile,identifySector,programSector} from './stm32-sector.js';
export {SECTOR_PROFILES};
import {gPageProfile,identifyGPage,programGPage} from './stm32-g-page.js';
import {clPageProfile,identifyCL,programCL} from './stm32-cl-page.js';
import {l0Profile,identifyL0,programL0} from './stm32-l0.js';
import {h72Profile,identifyH72,programH72} from './stm32-h72.js';
import {h7abProfile,identifyH7AB,programH7AB} from './stm32-h7ab.js';
import {wbProfile,identifyWB,programWB,wbApplicationLimit,wbProjectMemory} from './stm32-wb.js';
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
// Independent factual register/geometry table. DFP inventory from Builder run 45701467875,
// ST RM0091/RM0360, PM0075/PM0063, and CMSIS device register definitions.
// For 256 KiB F0 and high-density F1, WRP bit 31 covers the remaining pages.
// XL F101/F103: PM0068 dual-bank Flash, 512 KiB bank 1, 256/512 KiB bank 2.
const extraF0=[[1090,256,32,2048,"STM32F030CC STM32F030RC"],[1092,32,4,1024,"STM32F038C6 STM32F038E6 STM32F038F6 STM32F038G6 STM32F038K6"],[1093,16,6,1024,"STM32F042C4 STM32F042F4 STM32F042G4 STM32F042K4"],[1093,32,6,1024,"STM32F042C6 STM32F042F6 STM32F042G6 STM32F042K6 STM32F042T6 STM32F048C6 STM32F048G6 STM32F048T6 STM32F070C6 STM32F070F6"],[1088,64,8,1024,"STM32F058C8 STM32F058R8 STM32F058T8"],[1096,128,16,2048,"STM32F070CB STM32F070RB STM32F078CB STM32F078RB STM32F078VB"],[1090,128,32,2048,"STM32F091CB STM32F091RB STM32F091VB"],[1090,256,32,2048,"STM32F091CC STM32F091RC STM32F091VC STM32F098CC STM32F098RC STM32F098VC"]];
const extraF1=[[1056,16,4,1024,"STM32F100C4 STM32F100R4"],[1056,32,4,1024,"STM32F100C6 STM32F100R6"],[1056,64,8,1024,"STM32F100C8 STM32F100R8 STM32F100V8"],[1056,128,8,1024,"STM32F100CB STM32F100RB STM32F100VB"],[1064,256,24,2048,"STM32F100RC STM32F100VC STM32F100ZC"],[1064,384,32,2048,"STM32F100RD STM32F100VD STM32F100ZD"],[1064,512,32,2048,"STM32F100RE STM32F100VE STM32F100ZE"],[1042,16,4,1024,"STM32F101C4 STM32F101R4 STM32F101T4 STM32F102C4 STM32F102R4"],[1042,32,6,1024,"STM32F101C6 STM32F101R6 STM32F101T6 STM32F102C6 STM32F102R6"],[1040,64,10,1024,"STM32F101C8 STM32F101R8 STM32F101T8 STM32F101V8 STM32F102C8 STM32F102R8"],[1040,128,16,1024,"STM32F101CB STM32F101RB STM32F101TB STM32F101VB STM32F102CB STM32F102RB"],[1044,256,32,2048,"STM32F101RC STM32F101VC STM32F101ZC"],[1044,384,48,2048,"STM32F101RD STM32F101VD STM32F101ZD"],[1044,512,48,2048,"STM32F101RE STM32F101VE STM32F101ZE"],[1048,64,64,2048,"STM32F105R8 STM32F105V8"],[1048,128,64,2048,"STM32F105RB STM32F105VB STM32F107RB STM32F107VB"],[1048,256,64,2048,"STM32F105RC STM32F105VC STM32F107RC STM32F107VC"]];
function expandGroups(groups,make){return Object.fromEntries(groups.flatMap(([pid,kib,ram,page,names])=>names.split(' ').map(n=>[n,make(pid,kib,ram,page)])));}
function f1Profile(pid,kib,ramKiB,pageSize){return Object.freeze({pid,flash:kib*1024,ram:ramKiB*1024,uid:0x1ffff7e8,sizeReg:0x1ffff7e0,pageSize,wrpMask:Math.min(0xffffffff,2**(kib/4)-1)});}
// Existing ROM geometry for F0 and F103 is retained.
import {STM32_ROM_PROFILES} from './stm32-rom-profiles.js';
const F0_BASES=["STM32F030C6","STM32F030C8","STM32F030F4","STM32F030K6","STM32F030R8","STM32F031C4","STM32F031C6","STM32F031E6","STM32F031F4","STM32F031F6","STM32F031G4","STM32F031G6","STM32F031K4","STM32F031K6","STM32F051C4","STM32F051C6","STM32F051C8","STM32F051K4","STM32F051K6","STM32F051K8","STM32F051R4","STM32F051R6","STM32F051R8","STM32F051T8","STM32F071C8","STM32F071CB","STM32F071RB","STM32F071V8","STM32F071VB","STM32F072C8","STM32F072CB","STM32F072R8","STM32F072RB","STM32F072V8","STM32F072VB"];
const F1_BASES=["STM32F103C4","STM32F103C6","STM32F103C8","STM32F103CB","STM32F103R4","STM32F103R6","STM32F103R8","STM32F103RB","STM32F103RC","STM32F103RD","STM32F103RE","STM32F103T4","STM32F103T6","STM32F103T8","STM32F103TB","STM32F103V8","STM32F103VB","STM32F103VC","STM32F103VD","STM32F103VE","STM32F103ZC","STM32F103ZD","STM32F103ZE"];
export const F0_BASE_PROFILES=Object.freeze({...Object.fromEntries(F0_BASES.map(n=>{const p=STM32_ROM_PROFILES[n];return [n,f0Profile(p.pid,p.flash/1024,p.ram/1024,/^STM32F07[12]/.test(n)?2048:1024)];})),...expandGroups(extraF0,f0Profile)});
const XL_PROFILES=Object.fromEntries([101,103].flatMap(line=>['R','V','Z'].flatMap(pkg=>['F','G'].map(d=>['STM32F'+line+pkg+d,Object.freeze({...f1Profile(0x430,d==='F'?768:1024,line===101?80:96,2048),controller:'f1-xl',bankBoundary:512*1024})]))));
export const F1_BASE_PROFILES=Object.freeze({...XL_PROFILES,...Object.fromEntries(F1_BASES.map(n=>{const p=STM32_ROM_PROFILES[n];return [n,f1Profile(p.pid,p.flash/1024,p.ram/1024,p.pid===0x414?2048:1024)];})),...expandGroups(extraF1,f1Profile)});
// F3 main Flash: independent geometry from ST RM0316/RM0365/RM0366/RM0364/RM0313 and datasheets.
 // Same page/halfword controller as F0, but Cortex-M4 and DBGMCU at 0xe0042000.
const F3_GROUPS=[[1081,32,16,0,"STM32F301C6 STM32F301K6 STM32F301R6 STM32F302C6 STM32F302K6 STM32F302R6"],[1081,64,16,0,"STM32F301C8 STM32F301K8 STM32F301R8 STM32F302C8 STM32F302K8 STM32F302R8 STM32F318C8 STM32F318K8"],[1058,128,32,0,"STM32F302CB STM32F302RB STM32F302VB"],[1058,256,40,0,"STM32F302CC STM32F302RC STM32F302VC"],[1094,384,64,0,"STM32F302RD STM32F302VD STM32F302ZD"],[1094,512,64,0,"STM32F302RE STM32F302VE STM32F302ZE"],[1080,32,12,4,"STM32F303C6 STM32F303K6 STM32F303R6 STM32F334C6 STM32F334K6 STM32F334R6"],[1080,64,12,4,"STM32F303C8 STM32F303K8 STM32F303R8 STM32F334C8 STM32F334K8 STM32F334R8 STM32F328C8"],[1058,128,32,8,"STM32F303CB STM32F303RB STM32F303VB"],[1058,256,40,8,"STM32F303CC STM32F303RC STM32F303VC STM32F358CC STM32F358RC STM32F358VC"],[1094,384,64,16,"STM32F303RD STM32F303VD STM32F303ZD"],[1094,512,64,16,"STM32F303RE STM32F303VE STM32F303ZE STM32F398VE"],[1074,64,16,0,"STM32F373C8 STM32F373R8 STM32F373V8"],[1074,128,24,0,"STM32F373CB STM32F373RB STM32F373VB"],[1074,256,32,0,"STM32F373CC STM32F373RC STM32F373VC STM32F378CC STM32F378RC STM32F378VC"],[1080,16,12,4,"STM32F334C4 STM32F334K4"]];
export const F3_BASE_PROFILES=Object.freeze(Object.fromEntries(F3_GROUPS.flatMap(([pid,kib,ram,ccm,names])=>names.split(' ').map(n=>[n,Object.freeze({...f0Profile(pid,kib,ram,2048),controller:'f3-page',idReg:0xe0042000,core:0xc24,ccm:ccm*1024})]))));
function basePart(n){const m=/^(STM32F(?:030|031|038|042|048|051|058|070|071|072|078|091|098|100|101|102|103|105|107|301|302|303|318|328|334|358|373|378|398)[A-Z][468BCDEFG])(?:[A-Z][0-9])?$/.exec(n);return m?.[1]||'';}

export function swdProfile(name){
 const n=String(name).toUpperCase().replace(/TR$/,'');
 const key=basePart(n);
 return STLINK_F0_PROFILES[n]||F0_BASE_PROFILES[key]||STLINK_F1_PROFILES[n]||F1_BASE_PROFILES[key]||F3_BASE_PROFILES[key]||sectorProfile(n)||gPageProfile(n)||clPageProfile(n)||l0Profile(n)||h72Profile(n)||h7abProfile(n)||wbProfile(n)||null;
}

const F0REG=Object.freeze({KEY:0x40022004,SR:0x4002200c,CR:0x40022010,AR:0x40022014,OBR:0x4002201c,WRP:0x40022020,DHCSR:0xe000edf0,CPUID:0xe000ed00,FLASH:0x08000000});

export class Stm32SwdSession {
 constructor(pr){this.pr=pr;}
 async applicationLimit(){return this.pr.applicationOnly?wbApplicationLimit(this):this.pr.flash;}
 async wbProjectMemory(project=null){return wbProjectMemory(this,project);}
 async identify(){if(this.pr.controller==='wb-app')return identifyWB(this);if(this.pr.controller==='h7ab-sector')return identifyH7AB(this);if(this.pr.controller==='h72-sector')return identifyH72(this);if(this.pr.controller==='l0-pecr')return identifyL0(this);if(this.pr.controller==='cl-page')return identifyCL(this);if(this.pr.controller==='g-single-page')return identifyGPage(this);if(this.pr.controller==='f2f4-sector')return identifySector(this);return this.pr.idReg?this.identifyF0():this.identifyF1();}
 async program(b,progress=()=>{},project=null){if(this.pr.controller==='wb-app')return programWB(this,b,progress,project);if(project)throw Error('WB project requires WB SWD');if(this.pr.controller==='h7ab-sector')return programH7AB(this,b,progress);if(this.pr.controller==='h72-sector')return programH72(this,b,progress);if(this.pr.controller==='l0-pecr')return programL0(this,b,progress);if(this.pr.controller==='cl-page')return programCL(this,b,progress);if(this.pr.controller==='g-single-page')return programGPage(this,b,progress);if(this.pr.controller==='f2f4-sector')return programSector(this,b,progress);if(this.pr.controller==='f1-xl')return this.programF1XL(b,progress);return this.pr.idReg?this.programF0(b,progress):this.programF1(b,progress);}
 async identifyF1(){if((await this.reg(0xe0042000)&0xfff)!==this.pr.pid)throw Error('STM32F1 device ID mismatch');if(((await this.reg(0xe000ed00)>>>4)&0xfff)!==0xc23)throw Error('Cortex-M3 required');let b=await this.read(this.pr.sizeReg,2);if(b.length!==2||(b[0]+256*b[1])*1024!==this.pr.flash)throw Error('Flash size mismatch');let uid=await this.read(this.pr.uid,12);if(uid.length!==12||uid.every(x=>!x)||uid.every(x=>x===255))throw Error('Invalid UID');return 'stm32-'+hex(uid);}

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
   }finally{await this.idleF0();await this.put(0x40022010,0x80);if(!(await this.reg(0x40022010)&0x80))throw Error('Flash relock failed');}
 }

 // PM0068 rev 2 §§2.3–2.4, 3.9–3.12. Each bank has separate KEYR/SR/CR.
 async programF1XL(b,progress=()=>{}){
   if(!(b instanceof Uint8Array)||b.length>this.pr.flash)throw Error('STM32F1 XL Flash range');
   validateStmVector(b,this.pr);
   if(await this.identify()!==this.id)throw Error('UID changed');
   await this.put(0xe000edf0,0xa05f0003);
   if(!(await this.reg(0xe000edf0)&(1<<17)))throw Error('Core not halted');
   const boundary=this.pr.bankBoundary,base=0x08000000;
   const banks=[{key:0x40022004,sr:0x4002200c,cr:0x40022010,start:0,end:boundary},{key:0x40022044,sr:0x4002204c,cr:0x40022050,start:boundary,end:this.pr.flash}];
   const idle=async bank=>{const end=Date.now()+20000;do{const s=await this.reg(bank.sr);if(!(s&1))return s;await wait(3);}while(Date.now()<end);throw Error('STM32F1 XL bank busy timeout');};
   const complete=async bank=>{const s=await idle(bank);if(s&0x14)throw Error('STM32F1 XL Flash status '+s.toString(16));if(!(s&0x20))throw Error('STM32F1 XL missing EOP');await this.put(bank.sr,0x20);};
   for(const bank of banks)await idle(bank);
   // WRP[31] covers pages 62 onward, including bank 2. Never change option bytes.
   if((await this.reg(0x4002201c)&3)||(await this.reg(0x40022020)>>>0)!==0xffffffff)throw Error('STM32F1 XL Flash protection present');
   await this.enableHsi();
   let failure;
   try{
     // Unlock/check both banks before the first destructive operation.
     for(const bank of banks){
       if(await this.reg(bank.cr)&0x80){await this.put(bank.key,0x45670123);await this.put(bank.key,0xcdef89ab);}
       if(await this.reg(bank.cr)&0x80)throw Error('STM32F1 XL bank locked');
       await this.put(bank.sr,0x34);
     }
     // Existing user confirmation covers full main Flash, not option/system memory.
     for(const bank of banks){await this.put(bank.cr,4);await this.put(bank.cr,0x44);await complete(bank);await this.put(bank.cr,0);}
     for(const bank of banks){
       await this.put(bank.cr,1);
       for(let i=bank.start;i<Math.min(bank.end,b.length);i+=2){
         const p=u([b[i],b[i+1]??255]);
         if(p[0]!==255||p[1]!==255){await this.writeHalfword(base+i,p);await complete(bank);}
         if(i%256===0)progress(i/b.length*.9);
       }
       await this.put(bank.cr,0);
     }
     for(let i=0;i<this.pr.flash;i+=256){
       const n=Math.min(256,this.pr.flash-i),expected=new Uint8Array(n).fill(255);
       expected.set(b.slice(i,i+n));
       if(!eq(expected,await this.read(base+i,n)))throw Error('STM32F1 XL SWD readback mismatch @0x'+(base+i).toString(16));
       progress(.9+.1*(i+n)/this.pr.flash);
     }
   }catch(e){failure=e;throw e;}finally{
     // Attempt both locks independently; a failure on one bank must not skip the other.
     const errors=[];
     for(const bank of banks){try{await idle(bank);await this.put(bank.cr,0x80);if(!(await this.reg(bank.cr)&0x80))throw Error('STM32F1 XL bank relock failed');}catch(e){errors.push(e);}}
     if(errors.length)throw new AggregateError(failure?[failure,...errors]:errors,'STM32F1 XL Flash relock failed');
   }
 }

 async identifyF0(){
   if((await this.reg(this.pr.idReg)&0xfff)!==this.pr.pid)throw Error('STM32 page-controller device ID mismatch');
   if(((await this.reg(F0REG.CPUID)>>>4)&0xfff)!==(this.pr.core??0xc20))throw Error('STM32 Cortex core mismatch');
   const b=await this.read(this.pr.sizeReg,2);
   if(b.length!==2||(b[0]+256*b[1])*1024!==this.pr.flash)throw Error('STM32F0 Flash size mismatch');
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
   try{
     if(await this.reg(F0REG.CR)&0x80){
       await this.put(F0REG.KEY,0x45670123);await this.put(F0REG.KEY,0xcdef89ab);
     }
     if(await this.reg(F0REG.CR)&0x80)throw Error('STM32 page Flash locked');
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
