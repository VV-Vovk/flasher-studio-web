// STM32F2/F4 single-bank sector Flash, RM0033 / RM0368 / RM0383 / RM0090 / RM0401 / RM0402 / RM0390.
// Independent implementation, no vendor or third-party flash-loader binaries.
import {validateStmVector} from './programmers.js';
const BASE=0x08000000,ACR=0x40023c00,KEY=0x40023c04,SR=0x40023c0c,CR=0x40023c10,OPT=0x40023c14;
const LOCK=0x80000000,BSY=0x10000,START=0x10000,IRQ=0x03000000;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function profile(pid,flashKiB,ramKiB,part,pcrop=false,ccmKiB=0){
 const sectors=[16,16,16,16];if(flashKiB>=128)sectors.push(64);while(sectors.reduce((a,b)=>a+b,0)<flashKiB)sectors.push(128);
 if(sectors.reduce((a,b)=>a+b,0)!==flashKiB)throw Error('Unsupported sector geometry');
 return Object.freeze({controller:'f2f4-sector',pid,flash:flashKiB*1024,ram:ramKiB*1024,ccm:ccmKiB*1024,uid:0x1fff7a10,sizeReg:0x1fff7a22,part,pcrop,sectors:Object.freeze(sectors.map(s=>s*1024))});
}
export const SECTOR_PROFILES=Object.freeze({
 STM32F205RGT6:profile(0x411,1024,128,0xc23),
 STM32F207VGT6:profile(0x411,1024,128,0xc23),
 STM32F401CCU6:profile(0x423,256,64,0xc24,true),
 STM32F401RCT6:profile(0x423,256,64,0xc24,true),
 STM32F411CEU6:profile(0x431,512,128,0xc24,true),
 STM32F411RET6:profile(0x431,512,128,0xc24,true),
 STM32F407VGT6:profile(0x413,1024,128,0xc24,false,64)
});
// Catalogue allowlist for exact order codes, not a family-prefix guess.
const SECTOR_NAMES=["STM32F205RB","STM32F205RBTx","STM32F205RC","STM32F205RCTx","STM32F205RE","STM32F205RETx","STM32F205REYx","STM32F205RF","STM32F205RFTx","STM32F205RG","STM32F205RGTx","STM32F205RGYx","STM32F205RGEx","STM32F205VB","STM32F205VBTx","STM32F205VC","STM32F205VCTx","STM32F205VE","STM32F205VETx","STM32F205VF","STM32F205VFTx","STM32F205VG","STM32F205VGTx","STM32F205ZC","STM32F205ZCTx","STM32F205ZE","STM32F205ZETx","STM32F205ZF","STM32F205ZFTx","STM32F205ZG","STM32F205ZGTx","STM32F207VC","STM32F207VCTx","STM32F207VE","STM32F207VETx","STM32F207VF","STM32F207VFTx","STM32F207VG","STM32F207VGTx","STM32F207ZC","STM32F207ZCTx","STM32F207ZE","STM32F207ZETx","STM32F207ZF","STM32F207ZFTx","STM32F207ZG","STM32F207ZGTx","STM32F207IC","STM32F207ICTx","STM32F207ICHx","STM32F207IE","STM32F207IETx","STM32F207IEHx","STM32F207IF","STM32F207IFTx","STM32F207IFHx","STM32F207IG","STM32F207IGTx","STM32F207IGHx","STM32F215RE","STM32F215RETx","STM32F215RG","STM32F215RGTx","STM32F215VE","STM32F215VETx","STM32F215VG","STM32F215VGTx","STM32F215ZE","STM32F215ZETx","STM32F215ZG","STM32F215ZGTx","STM32F217VE","STM32F217VETx","STM32F217VG","STM32F217VGTx","STM32F217ZE","STM32F217ZETx","STM32F217ZG","STM32F217ZGTx","STM32F217IE","STM32F217IETx","STM32F217IEHx","STM32F217IG","STM32F217IGTx","STM32F217IGHx","STM32F401CB","STM32F401CBUx","STM32F401CBYx","STM32F401RB","STM32F401RBTx","STM32F401VB","STM32F401VBTx","STM32F401VBHx","STM32F401CC","STM32F401CCUx","STM32F401CCYx","STM32F401CCFx","STM32F401RC","STM32F401RCTx","STM32F401VC","STM32F401VCTx","STM32F401VCHx","STM32F401CD","STM32F401CDUx","STM32F401CDYx","STM32F401RD","STM32F401RDTx","STM32F401VD","STM32F401VDTx","STM32F401VDHx","STM32F401CE","STM32F401CEUx","STM32F401CEYx","STM32F401RE","STM32F401RETx","STM32F401VE","STM32F401VETx","STM32F401VEHx","STM32F410CB","STM32F410CBUx","STM32F410CBTx","STM32F410RB","STM32F410RBTx","STM32F410RBIx","STM32F410TB","STM32F410TBYx","STM32F410C8","STM32F410C8Ux","STM32F410C8Tx","STM32F410R8","STM32F410R8Tx","STM32F410R8Ix","STM32F410T8","STM32F410T8Yx","STM32F411CC","STM32F411CCUx","STM32F411CCYx","STM32F411RC","STM32F411RCTx","STM32F411VC","STM32F411VCTx","STM32F411VCHx","STM32F411CE","STM32F411CEUx","STM32F411CEYx","STM32F411RE","STM32F411RETx","STM32F411VE","STM32F411VETx","STM32F411VEHx","STM32F412CE","STM32F412CEUx","STM32F412CG","STM32F412CGUx","STM32F412RE","STM32F412RETx","STM32F412REYx","STM32F412REYxP","STM32F412RG","STM32F412RGTx","STM32F412RGYx","STM32F412RGYxP","STM32F412VE","STM32F412VEHx","STM32F412VETx","STM32F412VG","STM32F412VGHx","STM32F412VGTx","STM32F412ZE","STM32F412ZEJx","STM32F412ZETx","STM32F412ZG","STM32F412ZGJx","STM32F412ZGTx","STM32F405RG","STM32F405RGTx","STM32F405VG","STM32F405VGTx","STM32F405ZG","STM32F405ZGTx","STM32F405OG","STM32F405OGYx","STM32F405OE","STM32F405OEYx","STM32F407VG","STM32F407VGTx","STM32F407IG","STM32F407IGTx","STM32F407IGHx","STM32F407ZG","STM32F407ZGTx","STM32F407VE","STM32F407VETx","STM32F407ZE","STM32F407ZETx","STM32F407IE","STM32F407IETx","STM32F407IEHx","STM32F415RG","STM32F415RGTx","STM32F415VG","STM32F415VGTx","STM32F415ZG","STM32F415ZGTx","STM32F415OG","STM32F415OGYx","STM32F417VG","STM32F417VGTx","STM32F417IG","STM32F417IGTx","STM32F417IGHx","STM32F417ZG","STM32F417ZGTx","STM32F417VE","STM32F417VETx","STM32F417ZE","STM32F417ZETx","STM32F417IE","STM32F417IETx","STM32F417IEHx","STM32F446MC","STM32F446MCYx","STM32F446RC","STM32F446RCTx","STM32F446VC","STM32F446VCTx","STM32F446ZC","STM32F446ZCHx","STM32F446ZCJx","STM32F446ZCTx","STM32F446ME","STM32F446MEYx","STM32F446RE","STM32F446RETx","STM32F446VE","STM32F446VETx","STM32F446ZE","STM32F446ZEHx","STM32F446ZEJx","STM32F446ZETx"];
const sizes={8:64,B:128,C:256,D:384,E:512,F:768,G:1024};
function makeBase(n){
 const line=n.slice(6,9),d=n[10],k=sizes[d];
 if(['205','207','215','217'].includes(line))return profile(0x411,k,k===128?64:k===256?96:128,0xc23);
 if(line==='401')return profile(/[BC]/.test(d)?0x423:0x433,k,/[BC]/.test(d)?64:96,0xc24,true);
 if(['405','407','415','417'].includes(line))return profile(0x413,k,128,0xc24,false,64);
 if(line==='410')return profile(0x458,k,32,0xc24,true);
 if(line==='411')return profile(0x431,k,128,0xc24,true);
 if(line==='412')return profile(0x441,k,256,0xc24,true);
 if(line==='446')return profile(0x421,k,128,0xc24,true);
 throw Error('Unsupported sector part '+n);
}
export const SECTOR_BASE_PROFILES=Object.freeze(Object.fromEntries([...new Set(SECTOR_NAMES.map(n=>n.slice(0,11)))].map(n=>[n,makeBase(n)])));
export function sectorProfile(name){
 const n=String(name).toUpperCase().replace(/TR$/,'');
 if(SECTOR_PROFILES[n])return SECTOR_PROFILES[n];
 const base=n.slice(0,11),p=SECTOR_BASE_PROFILES[base];
 if(!p)return null;
 if(n===base)return p;
 return SECTOR_NAMES.some(x=>x.startsWith(base)&&x.includes('x')&&new RegExp('^'+x.replace('x','[0-9]')+'
 const p=s.pr;
 if((await s.reg(0xe0042000)&0xfff)!==p.pid)throw Error('STM32F2/F4 device ID mismatch');
 if(((await s.reg(0xe000ed00)>>>4)&0xfff)!==p.part)throw Error('STM32F2/F4 CPU mismatch');
 const b=await s.read(p.sizeReg,2);
 if(b.length!==2||(b[0]+256*b[1])*1024!==p.flash)throw Error('STM32F2/F4 Flash size mismatch');
 const uid=await s.read(p.uid,12);
 if(uid.length!==12||uid.every(x=>x===0)||uid.every(x=>x===255))throw Error('Invalid UID');
 return 'stm32-'+Array.from(uid,x=>x.toString(16).padStart(2,'0')).join('');
}
async function idle(s){
 const until=Date.now()+60000;
 do{const r=await s.reg(SR);if(!(r&BSY))return r;await wait(3);}while(Date.now()<until);
 throw Error('STM32 sector Flash busy timeout');
}
async function complete(s,mask){
 const status=await idle(s);
 if(status&(mask&~1))throw Error('STM32 sector Flash status 0x'+status.toString(16));
 if(!(status&1))throw Error('STM32 sector Flash missing EOP');
 await s.put(SR,1);
}
export async function programSector(s,b,progress=()=>{}){
 const p=s.pr;
 if(!(b instanceof Uint8Array)||b.length>p.flash||typeof s.writeByte!=='function')throw Error('STM32 sector Flash range or transport');
 validateStmVector(b,p);
 if(await identifySector(s)!==s.id)throw Error('UID changed');
 await s.put(0xe000edf0,0xa05f0003);
 if(!(await s.reg(0xe000edf0)&(1<<17)))throw Error('Core not halted');
 await idle(s);
 const opt=await s.reg(OPT),wrpMask=(1<<p.sectors.length)-1;
 if(!(opt&1)||((opt>>>8)&255)!==0xaa||((opt>>>16)&wrpMask)!==wrpMask||(p.pcrop&&(opt>>>31)))throw Error('STM32 sector Flash protection present');
 // x8 programming/erase parallelism for the lowest specified programming voltage range.
 // Avoid assuming 3.3V or using a probe-specific voltage reading.
 const mask=p.pcrop?0x1f3:0xf3;
 const acr=await s.reg(ACR),cacheOff=acr&~0x1e00;
 try{
   if(await s.reg(CR)&LOCK){await s.put(KEY,0x45670123);await s.put(KEY,0xcdef89ab);}
   if(await s.reg(CR)&LOCK)throw Error('STM32 sector Flash locked');
   await s.put(ACR,cacheOff);await s.put(ACR,cacheOff|0x1800);await s.put(ACR,cacheOff);
   await s.put(SR,mask);
   for(let i=0;i<p.sectors.length;i++){
     const cmd=IRQ|2|(i<<3);
     await s.put(CR,cmd);await s.put(CR,cmd|START);await complete(s,mask);
     progress(.1*(i+1)/p.sectors.length);
   }
   await s.put(CR,IRQ|1);
   for(let i=0;i<b.length;i++){
     if(b[i]!==255){await s.writeByte(BASE+i,b[i]);await complete(s,mask);}
     if(i%256===0)progress(.1+.75*i/b.length);
   }
   await s.put(CR,0);
   for(let i=0;i<p.flash;i+=256){
     const n=Math.min(256,p.flash-i),expected=new Uint8Array(n).fill(255);
     expected.set(b.slice(i,i+n));
     const got=await s.read(BASE+i,n);
     if(got.length!==n||!got.every((v,k)=>v===expected[k]))throw Error('STM32 sector Flash readback mismatch @0x'+(BASE+i).toString(16));
     progress(.85+.15*(i+n)/p.flash);
   }
 }finally{
   await idle(s);
   await s.put(CR,LOCK);
   if(!(await s.reg(CR)&LOCK))throw Error('STM32 sector Flash relock failed');
   await s.put(ACR,cacheOff|0x1800);await s.put(ACR,cacheOff);await s.put(ACR,acr&~0x1800);
 }
}
).test(n))?p:null;
}
export async function identifySector(s){
 const p=s.pr;
 if((await s.reg(0xe0042000)&0xfff)!==p.pid)throw Error('STM32F2/F4 device ID mismatch');
 if(((await s.reg(0xe000ed00)>>>4)&0xfff)!==p.part)throw Error('STM32F2/F4 CPU mismatch');
 const b=await s.read(p.sizeReg,2);
 if(b.length!==2||(b[0]+256*b[1])*1024!==p.flash)throw Error('STM32F2/F4 Flash size mismatch');
 const uid=await s.read(p.uid,12);
 if(uid.length!==12||uid.every(x=>x===0)||uid.every(x=>x===255))throw Error('Invalid UID');
 return 'stm32-'+Array.from(uid,x=>x.toString(16).padStart(2,'0')).join('');
}
async function idle(s){
 const until=Date.now()+60000;
 do{const r=await s.reg(SR);if(!(r&BSY))return r;await wait(3);}while(Date.now()<until);
 throw Error('STM32 sector Flash busy timeout');
}
async function complete(s,mask){
 const status=await idle(s);
 if(status&(mask&~1))throw Error('STM32 sector Flash status 0x'+status.toString(16));
 if(!(status&1))throw Error('STM32 sector Flash missing EOP');
 await s.put(SR,1);
}
export async function programSector(s,b,progress=()=>{}){
 const p=s.pr;
 if(!(b instanceof Uint8Array)||b.length>p.flash||typeof s.writeByte!=='function')throw Error('STM32 sector Flash range or transport');
 validateStmVector(b,p);
 if(await identifySector(s)!==s.id)throw Error('UID changed');
 await s.put(0xe000edf0,0xa05f0003);
 if(!(await s.reg(0xe000edf0)&(1<<17)))throw Error('Core not halted');
 await idle(s);
 const opt=await s.reg(OPT),wrpMask=(1<<p.sectors.length)-1;
 if(((opt>>>8)&255)!==0xaa||((opt>>>16)&wrpMask)!==wrpMask||(p.pcrop&&(opt>>>31)))throw Error('STM32 sector Flash protection present');
 // x8 programming/erase parallelism for the lowest specified programming voltage range.
 // Avoid assuming 3.3V or using a probe-specific voltage reading.
 const mask=p.pcrop?0x1f3:0xf3;
 const acr=await s.reg(ACR),cacheOff=acr&~0x1e00;
 if(await s.reg(CR)&LOCK){await s.put(KEY,0x45670123);await s.put(KEY,0xcdef89ab);}
 if(await s.reg(CR)&LOCK)throw Error('STM32 sector Flash locked');
 try{
   await s.put(ACR,cacheOff);await s.put(ACR,cacheOff|0x1800);await s.put(ACR,cacheOff);
   await s.put(SR,mask);
   for(let i=0;i<p.sectors.length;i++){
     const cmd=IRQ|2|(i<<3);
     await s.put(CR,cmd);await s.put(CR,cmd|START);await complete(s,mask);
     progress(.1*(i+1)/p.sectors.length);
   }
   await s.put(CR,IRQ|1);
   for(let i=0;i<b.length;i++){
     if(b[i]!==255){await s.writeByte(BASE+i,b[i]);await complete(s,mask);}
     if(i%256===0)progress(.1+.75*i/b.length);
   }
   await s.put(CR,0);
   for(let i=0;i<p.flash;i+=256){
     const n=Math.min(256,p.flash-i),expected=new Uint8Array(n).fill(255);
     expected.set(b.slice(i,i+n));
     const got=await s.read(BASE+i,n);
     if(got.length!==n||!got.every((v,k)=>v===expected[k]))throw Error('STM32 sector Flash readback mismatch @0x'+(BASE+i).toString(16));
     progress(.85+.15*(i+n)/p.flash);
   }
 }finally{
   await idle(s);
   await s.put(CR,LOCK);
   if(!(await s.reg(CR)&LOCK))throw Error('STM32 sector Flash relock failed');
   await s.put(ACR,cacheOff|0x1800);await s.put(ACR,cacheOff);await s.put(ACR,acr&~0x1800);
 }
}
