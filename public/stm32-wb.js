// CPU1 application Flash only. Independent implementation from RM0434 and AN5451.
// No CPU2 firmware, FUS, option byte writes, or mass erase.
import {validateStmVector} from './programmers.js';
const BASE=0x08000000,F=0x58004000,PWR=0x58000400,ID=0xe0042000,DHCSR=0xe000edf0;
const ACR=F,KEY=F+8,SR=F+16,CR=F+20,ECCR=F+24,OPT=F+32,C2SR=F+0x60,C2CR=F+0x64,SFR=F+0x80,SRRVR=F+0x84;
const LOCK=0x80000000,OPTLOCK=0x40000000,IRQ=0x07000000,START=0x10000,ERR=0xc3fa,BUSY=0xd0000;
const patterns=["STM32WB55CGUx","STM32WB55RGVx","STM32WB55VGYx","STM32WB55VGQx","STM32WB55VYYx","STM32WB55CEUx","STM32WB55REVx","STM32WB55VEYx","STM32WB55VEQx","STM32WB55CCUx","STM32WB55RCVx","STM32WB55VCYx","STM32WB55VCQx","STM32WB50CGUx","STM32WB5MMGHx","STM32WB35CEUxA","STM32WB35CCUxA","STM32WB30CEUxA","STM32WB15CCUx","STM32WB15CCUxE","STM32WB15CCYx","STM32WB10CCUx","STM32WB1MMCHx"],sizes={C:256,E:512,G:1024,Y:640};
export const WB_PROFILES=Object.freeze(Object.fromEntries(patterns.map(n=>{
 const line=n.slice(5,9),small=['WB15','WB10','WB1M'].includes(line),ram=small?12:line==='WB35'||line==='WB30'?32:line==='WB50'||n[10]==='C'?64:192;
 return [n,Object.freeze({controller:'wb-app',pid:small?0x494:0x495,core:0xc24,idReg:ID,uid:0x1fff7590,sizeReg:0x1fff75e0,flash:(small?320:sizes[n[10]])*1024,ram:ram*1024,pageSize:small?2048:4096,sbrvMask:small?0x1ffff:0x3ffff,wrpMask:['WB35','WB30'].includes(line)?0x7f:0xff,pcropMask:['WB35','WB30'].includes(line)?0xff:0x1ff,applicationOnly:true})];
})));
export function wbProfile(name){
 const n=String(name).trim().toUpperCase().replace(/TR$/,'');
 for(const [pattern,p] of Object.entries(WB_PROFILES))if(n===pattern.slice(0,11)||new RegExp('^'+pattern.replace('x','[0-9]')+'$').test(n))return p;
 return null;
}
// Exact order-code templates tested by Builder; do not treat a base name as a full code.
export function wbCpu1CompileTarget(name){
 const n=String(name||'').trim().toUpperCase().replace(/TR$/,'');
 return Object.keys(WB_PROFILES).some(pattern=>new RegExp('^'+pattern.replace('x','[0-9]')+'$').test(n));
}
export async function identifyWB(s){
 const p=s.pr;
 if((await s.reg(ID)&0xfff)!==p.pid)throw Error('STM32WB device ID mismatch');
 if(((await s.reg(0xe000ed00)>>>4)&0xfff)!==p.core)throw Error('STM32WB CPU1 Cortex-M4 required');
 const b=await s.read(p.sizeReg,2);
 if(b.length!==2||(b[0]+256*b[1])*1024!==p.flash)throw Error('STM32WB Flash size mismatch');
 const uid=await s.read(p.uid,12);
 if(uid.length!==12||uid.every(x=>x===0)||uid.every(x=>x===255))throw Error('Invalid STM32WB UID');
 return 'stm32-'+Array.from(uid,x=>x.toString(16).padStart(2,'0')).join('');
}
// AN5185 table 6: smaller WB5x/3x dies can expose the factory FUS
// at the fixed high address, outside the advertised application density.
// Treat only the documented FUS vectors as exceptions; never extend the
// application address range to include that fixed FUS mapping.
export function wbFlashLayout(p,sfr,op,rv){
 if((op&255)!==0xaa||!(op&0x100)||(sfr&0x100))throw Error('STM32WB: RDP or CPU2 security configuration unsupported; no security changes');
 const limit=(sfr&255)*p.pageSize,boot=(rv&p.sbrvMask)*4;
 const factoryHigh=p.pageSize===4096&&p.flash<1048576&&(boot===0xf4000||boot===0xf6000);
 if(!limit||limit>p.flash||limit===p.flash&&!factoryHigh)throw Error('STM32WB invalid secure Flash boundary (SFSA)');
 if(!(rv>>>31)||boot<limit||boot>=p.flash&&!factoryHigh)throw Error('STM32WB nonstandard CPU2 boot vector');
 return Object.freeze({limit,physical:p.flash,pageSize:p.pageSize,secureStart:BASE+limit,cpu2Boot:BASE+boot,factoryHigh});
}
export async function wbApplicationLimit(s){
 const p=s.pr;
 if((await s.reg(SR))&0xe000)throw Error('STM32WB invalid option or read status');
 return wbFlashLayout(p,await s.reg(SFR),await s.reg(OPT),await s.reg(SRRVR)).limit;
}
// A fresh system reset with CPU1 vector catch prevents the old application
// from launching CPU2 before programming. Merely seeing C2BOOT=0 is not proof
// of a previous reset. Never alter CPU2's boot controls or security.
export async function resetHaltWB(s,timeout=3000){
 const DEMCR=0xe000edfc,AIRCR=0xe000ed0c,old=await s.reg(DEMCR);
 await s.put(DHCSR,0xa05f0003);
 if(!(await s.reg(DHCSR)&(1<<17)))throw Error('STM32WB CPU1 halt failed');
 try{
  await s.put(DEMCR,old|1);
  if(!(await s.reg(DEMCR)&1))throw Error('STM32WB reset vector catch unavailable');
  await s.reg(DHCSR); // clear prior sticky reset indication
  await s.put(AIRCR,0x05fa0004);
  const end=Date.now()+timeout;let resetSeen=false;
  do{
   const st=await s.reg(DHCSR);
   resetSeen||=!!(st&(1<<25));
   if(resetSeen&&(st&(1<<17))){await checkCPU2(s);await s.reg(DHCSR);return;}
   await new Promise(r=>setTimeout(r,5));
  }while(Date.now()<end);
  throw Error('STM32WB reset/halt not confirmed; connect with reset support');
 }finally{await s.put(DEMCR,old);}
}
async function checkHalted(s){
 const state=await s.reg(DHCSR);
 if(!(state&(1<<17))||state&(1<<25))throw Error('STM32WB CPU1 left halt or reset during Flash operation');
 await checkCPU2(s);
}
async function checkCPU2(s){
 if((await s.reg(PWR+12))&0x8000)throw Error('STM32WB CPU2 started: reset target and halt CPU1 before starting radio');
 if((await s.reg(C2SR))&BUSY||(await s.reg(C2CR))&0x50007)throw Error('STM32WB CPU2 Flash active or suspended');
}
async function idle(s){
 const until=Date.now()+15000;
 do{const st=await s.reg(SR);if(st&0x80000)throw Error('STM32WB Flash suspended (PESD)');if(!(st&0x50000))return st;await new Promise(r=>setTimeout(r,3));}while(Date.now()<until);
 throw Error('STM32WB Flash busy timeout; reset required');
}
async function complete(s){
 const st=await idle(s);
 if(st&(ERR|0x2000)||!(st&1))throw Error('STM32WB Flash status 0x'+st.toString(16));
 await s.put(SR,1);
}
async function preflight(s,b){
 const p=s.pr,limit=await wbApplicationLimit(s),span=Math.ceil(b.length/p.pageSize)*p.pageSize;
 if(span>limit)throw Error('STM32WB image overlaps secure CPU2 Flash (SFSA)');
 await checkHalted(s);
 const st=await idle(s),cr=await s.reg(CR);
 if(st&(ERR|0x2000)||!(cr&OPTLOCK)||cr&0x080707ff)throw Error('STM32WB active Flash operation or option error');
 for(const off of [0x2c,0x30]){
  const v=await s.reg(F+off),a=v&p.wrpMask,z=(v>>>16)&p.wrpMask;
  if(a<=z&&a*p.pageSize<span)throw Error('STM32WB WRP intersects application');
 }
 for(const [a,z] of [[0x24,0x28],[0x34,0x38]]){
  const first=(await s.reg(F+a))&p.pcropMask,last=(await s.reg(F+z))&p.pcropMask;
  if(first<=last&&first*(p.pageSize/2)<span)throw Error('STM32WB PCROP intersects application');
 }
 if((await s.reg(ECCR))&0xc0000000)throw Error('STM32WB ECC fault');
 return {limit,span};
}
export async function programWB(s,b,progress=()=>{}){
 const p=s.pr;
 if(!(b instanceof Uint8Array)||b.length>p.flash||typeof s.writeDoubleword!=='function')throw Error('STM32WB image or transport');
 validateStmVector(b,p);
 if(await identifyWB(s)!==s.id)throw Error('STM32WB UID changed');
 await resetHaltWB(s);
 if(await identifyWB(s)!==s.id)throw Error('STM32WB UID changed after reset');
 const {limit,span}=await preflight(s,b),acr=await s.reg(ACR),off=acr&~0x1f00;
 if(acr&0x8000)throw Error('STM32WB Flash suspend requested');
 try{
  if(await s.reg(CR)&LOCK){await s.put(KEY,0x45670123);await s.put(KEY,0xcdef89ab);}
  if(await s.reg(CR)&LOCK)throw Error('STM32WB Flash locked');
  await s.put(ACR,off);if((await s.reg(ACR))&0x700)throw Error('STM32WB cache disable failed');
  await s.put(ACR,off|0x1800);await s.put(ACR,off);
  await s.put(SR,1);
  // Only pages occupied by the incoming application. Never erase the tail of
  // the nonsecure area, which may contain persistent application data.
  for(let i=0;i<span;i+=p.pageSize){
   await checkHalted(s);if(await wbApplicationLimit(s)!==limit)throw Error('STM32WB secure boundary changed');
   const cmd=OPTLOCK|IRQ|2|((i/p.pageSize)<<3);
   await s.put(CR,cmd);await s.put(CR,cmd|START);await complete(s);await checkHalted(s);
   progress(.2*(i+p.pageSize)/span);
  }
  await s.put(CR,OPTLOCK|IRQ|1);
  for(let i=0;i<b.length;i+=8){
   if(i%p.pageSize===0){await checkHalted(s);if(await wbApplicationLimit(s)!==limit)throw Error('STM32WB secure boundary changed');}
   const data=new Uint8Array(8).fill(255);data.set(b.slice(i,i+8));
   if(data.some(x=>x!==255)){await s.writeDoubleword(BASE+i,data);await complete(s);await checkHalted(s);}
   if(i%1024===0)progress(.2+.6*Math.min(i+8,b.length)/b.length);
  }
  await s.put(CR,OPTLOCK);
  for(let i=0;i<span;i+=256){
   const n=Math.min(256,span-i),expected=new Uint8Array(n).fill(255);expected.set(b.slice(i,i+n));
   const got=await s.read(BASE+i,n);
   if(got.length!==n||!got.every((v,k)=>v===expected[k]))throw Error('STM32WB readback mismatch @0x'+(BASE+i).toString(16));
   if((await s.reg(SR))&(ERR|0x2000)||(await s.reg(ECCR))&0xc0000000)throw Error('STM32WB readback status/ECC');
   progress(.8+.2*(i+n)/span);
  }
 }finally{
  await idle(s);
  await s.put(CR,(LOCK|OPTLOCK)>>>0);
  if(((await s.reg(CR))>>>30)!==3)throw Error('STM32WB relock failed');
 }
}
