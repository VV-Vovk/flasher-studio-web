// Original register-level implementation based on ST RM0451, RM0377,
// RM0376 and RM0367. No vendor implementation or Flash loader binaries.
import {validateStmVector} from './programmers.js';
const BASE=0x08000000,F=0x40022000,ACR=F,PECR=F+4,PEKEY=F+12,PRGKEY=F+16,SR=F+24,OPT=F+28,WRP1=F+32,WRP2=F+128;
const RCC=0x40021034,SYS=0x40010000,DHCSR=0xe000edf0,ERR=0x32f00;
const names=["STM32L010C6Tx","STM32L010F4Px","STM32L010K4Tx","STM32L010K8Tx","STM32L010R8Tx","STM32L010RBTx","STM32L011D3Px","STM32L011D4Px","STM32L011E3Yx","STM32L011E4Yx","STM32L011F3Px","STM32L011F3Ux","STM32L011F4Px","STM32L011F4Ux","STM32L011G3Ux","STM32L011G4Ux","STM32L011K3Tx","STM32L011K3Ux","STM32L011K4Tx","STM32L011K4Ux","STM32L021D4Px","STM32L021F4Ux","STM32L021G4Ux","STM32L021K4Tx","STM32L031C4Tx","STM32L031C4Ux","STM32L031C6Tx","STM32L031C6Ux","STM32L031E4Yx","STM32L031E6Yx","STM32L031F4Px","STM32L031F6Px","STM32L031G4Ux","STM32L031G6Ux","STM32L031G6UxS","STM32L031K4Ux","STM32L031K6Tx","STM32L031K6Ux","STM32L041C6Tx","STM32L041C6Ux","STM32L041F6Px","STM32L041G6Ux","STM32L041G6UxS","STM32L041K6Tx","STM32L041K6Ux","STM32L041E6Yx","STM32L051C6Tx","STM32L051C6Ux","STM32L051C8Tx","STM32L051C8Ux","STM32L051K6Tx","STM32L051K6Ux","STM32L051K8Tx","STM32L051K8Ux","STM32L051R6Hx","STM32L051R6Tx","STM32L051R8Hx","STM32L051R8Tx","STM32L051T6Yx","STM32L051T8Yx","STM32L052C6Tx","STM32L052C6Ux","STM32L052C8Tx","STM32L052C8Ux","STM32L052K6Tx","STM32L052K6Ux","STM32L052K8Tx","STM32L052K8Ux","STM32L052R6Hx","STM32L052R6Tx","STM32L052R8Hx","STM32L052R8Tx","STM32L052T6Yx","STM32L052T8Yx","STM32L052T8Fx","STM32L053C6Tx","STM32L053C6Ux","STM32L053C8Tx","STM32L053C8Ux","STM32L053R6Hx","STM32L053R6Tx","STM32L053R8Hx","STM32L053R8Tx","STM32L062K8Tx","STM32L062K8Ux","STM32L062C8Ux","STM32L063C8Tx","STM32L063C8Ux","STM32L063R8Tx","STM32L071C8Tx","STM32L071C8Ux","STM32L071CBTx","STM32L071CBUx","STM32L071CBYx","STM32L071CZTx","STM32L071CZUx","STM32L071CZYx","STM32L071K8Ux","STM32L071KBTx","STM32L071KBUx","STM32L071KZTx","STM32L071KZUx","STM32L071RBHx","STM32L071RBTx","STM32L071RZHx","STM32L071RZTx","STM32L071V8Tx","STM32L071VBTx","STM32L071VZTx","STM32L072CBTx","STM32L072CBUx","STM32L072CBYx","STM32L072CZEx","STM32L072CZTx","STM32L072CZUx","STM32L072CZYx","STM32L072KBUx","STM32L072KZTx","STM32L072KZUx","STM32L072RBHx","STM32L072RBIx","STM32L072RBTx","STM32L072RZIx","STM32L072RZTx","STM32L072RZHx","STM32L072V8Ix","STM32L072V8Tx","STM32L072VBTx","STM32L072VBIx","STM32L072VZIx","STM32L072VZTx","STM32L073CBTx","STM32L073CBUx","STM32L073CZTx","STM32L073CZUx","STM32L073CZYx","STM32L073RBHx","STM32L073RBTx","STM32L073RZHx","STM32L073RZIx","STM32L073RZTx","STM32L073V8Tx","STM32L073VBTx","STM32L073VZIx","STM32L073VZTx","STM32L081CBTx","STM32L081CZTx","STM32L081CZUx","STM32L081KZTx","STM32L081KZUx","STM32L082KZTx","STM32L082KZUx","STM32L082CZYx","STM32L082CZUx","STM32L082KBUx","STM32L083CBTx","STM32L083CZTx","STM32L083CZUx","STM32L083RBHx","STM32L083RBTx","STM32L083RZHx","STM32L083RZTx","STM32L083V8Tx","STM32L083VBTx","STM32L083VZIx","STM32L083VZTx"];
const densities={3:8,4:16,6:32,8:64,B:128,Z:192};
const catId={1:0x457,2:0x425,3:0x417,5:0x447},catRam={1:2,2:8,3:8,5:20};
function profile(n){
 const d=n[10],line=n.slice(5,9),flash=densities[d]*1024;
 let cat=line==='L010'?({3:1,4:1,6:2,8:3,B:5}[d]):/^L0[12]1$/.test(line)?1:/^L0[34]1$/.test(line)?2:/^L0[56][123]$/.test(line)?3:/^L0[78][123]$/.test(line)?5:0;
 if(!cat||!flash)throw Error('Unknown L0 geometry '+n);
 return Object.freeze({controller:'l0-pecr',cat,pid:catId[cat],flash,ram:catRam[cat]*1024,pageSize:128,idReg:0x40015800,core:0xc60,uid:0x1ff80050,uidTail:0x1ff80064,sizeReg:0x1ff8007c});
}
export const L0_PROFILES=Object.freeze(Object.fromEntries(names.map(n=>[n,profile(n)])));
export function l0Profile(name){
 const n=String(name).toUpperCase().replace(/TR$/,'');
 if(!/^STM32L0[0-9]{2}[A-Z][3468BZ][A-Z][0-9][A-Z]*$/.test(n))return null;
 return L0_PROFILES[n.slice(0,12)+'x'+n.slice(13)]||null;
}
export async function identifyL0(s){
 const p=s.pr;
 if(((await s.reg(0xe000ed00)>>>4)&0xfff)!==p.core)throw Error('Cortex-M0+ required');
 let id=await s.reg(p.idReg);
 if((id&0xfff)!==p.pid)throw Error('STM32L0 device ID mismatch');
 const b=await s.read(p.sizeReg,2);
 if(b.length!==2||(b[0]+256*b[1])*1024!==p.flash)throw Error('STM32L0 Flash size mismatch');
 const a=await s.read(p.uid,8),z=await s.read(p.uidTail,4);
 if(a.length!==8||z.length!==4)throw Error('STM32L0 UID length');
 const uid=Uint8Array.from([...a,...z]);
 if(uid.every(x=>x===0)||uid.every(x=>x===255))throw Error('STM32L0 invalid UID');
 return 'stm32-'+Array.from(uid,x=>x.toString(16).padStart(2,'0')).join('');
}
async function idle(s){
 const until=Date.now()+10000;
 do{const st=await s.reg(SR);if(!(st&1)){if(!(st&8))throw Error('STM32L0 Flash not ready');return st;}}while(Date.now()<until);
 throw Error('STM32L0 Flash busy timeout');
}
async function finish(s){
 const st=await idle(s);
 if((st&ERR)||!(st&2))throw Error('STM32L0 Flash status 0x'+st.toString(16));
 await s.put(SR,2);
}
export async function programL0(s,b,progress=()=>{}){
 const p=s.pr;
 if(!b.length||b.length>p.flash)throw Error('STM32L0 image size');
 validateStmVector(b,p);
 if(await identifyL0(s)!==s.id)throw Error('STM32L0 target changed');
 await s.put(DHCSR,0xa05f0003);
 if(!(await s.reg(DHCSR)&(1<<17)))throw Error('STM32L0 halt failed');
 const st=await idle(s),opt=await s.reg(OPT),pe=await s.reg(PECR),acr=await s.reg(ACR);
 if((st&0x800)||(opt&255)!==0xaa||(opt&0x100))throw Error('STM32L0 option or read protection');
 if(!(pe&4)||pe&0x3f08)throw Error('STM32L0 unexpected PECR state');
 if(acr&16)throw Error('STM32L0 NVM power down: reset and halt');
 if(await s.reg(WRP1)||p.cat===5&&await s.reg(WRP2))throw Error('STM32L0 write protection');
 if(p.cat>=3){
  const clk=await s.reg(RCC);
  try{
   if(!(clk&1)){await s.put(RCC,clk|1);if(!(await s.reg(RCC)&1))throw Error('STM32L0 SYSCFG clock');}
   if(!(await s.reg(SYS+4)&1))throw Error('STM32L0 firewall active: reset and halt');
   if(p.cat===5&&((await s.reg(SYS)&8)||(opt&0x800000)))throw Error('STM32L0 alternate bank mapping/boot');
  }finally{if(!(clk&1))await s.put(RCC,clk);}
 }
 // Bypass read buffering so verification reads the physical memory.
 const safeAcr=(acr&~0x42)|0x20;
 try{
  await s.put(ACR,safeAcr);
  if((await s.reg(ACR)&0x62)!==0x20)throw Error('STM32L0 Flash buffer control');
  if(pe&1){await s.put(PEKEY,0x89abcdef);await s.put(PEKEY,0x02030405);}
  if(await s.reg(PECR)&1)throw Error('STM32L0 PE unlock');
  if(await s.reg(PECR)&2){await s.put(PRGKEY,0x8c9daebf);await s.put(PRGKEY,0x13141516);}
  if((await s.reg(PECR)&7)!==4)throw Error('STM32L0 program unlock');
  await s.put(SR,ERR|2);
  await s.put(PECR,0x20c);
  for(let i=0;i<p.flash;i+=p.pageSize){
   await s.put(BASE+i,0);
   await finish(s);
   if(i%2048===0)progress(0.35*(i+p.pageSize)/p.flash);
  }
  await s.put(PECR,4);
  for(let i=0;i<b.length;i+=4){
   let word=((b[i]||0)|((b[i+1]||0)<<8)|((b[i+2]||0)<<16)|((b[i+3]||0)<<24))>>>0;
   if(word){await s.put(BASE+i,word);await finish(s);}
   if(i%1024===0)progress(0.35+0.45*Math.min(i+4,b.length)/b.length);
  }
  for(let i=0;i<p.flash;i+=1024){
   const n=Math.min(1024,p.flash-i),r=await s.read(BASE+i,n);
   if(r.length!==n||r.some((v,j)=>v!==(b[i+j]||0)))throw Error('STM32L0 verify mismatch at '+(BASE+i).toString(16));
   if((await idle(s))&ERR)throw Error('STM32L0 verify status');
   progress(0.8+0.2*(i+n)/p.flash);
  }
 }finally{
  await idle(s);
  await s.put(PECR,7);
  if((await s.reg(PECR)&7)!==7)throw Error('STM32L0 relock failed');
 }
}
