// Original single-bank STM32H72x/73x driver, RM0468 chapter 4.
// No vendor source, compiled loader, or third-party implementation.
import {validateStmVector} from './programmers.js';
const F=0x52002000,BASE=0x08000000,ID=0x5c001000,CPUID=0xe000ed00,DHCSR=0xe000edf0,CCR=0xe000ed14;
const KEY=F+4,CR=F+12,SR=F+16,CLEAR=F+20,OPTCR=F+24,OPTSR=F+28,PRAR=F+40,SCAR=F+48,WPSN=F+56,BOOT=F+64;
const LOCK=1,PG=2,SER=4,START=128,EOP=0x10000,ERR=0x17ee0000,SECTOR=128*1024;
const patterns=["STM32H723VGHx","STM32H723VGTx","STM32H723ZGIx","STM32H723ZGTx","STM32H723VETx","STM32H723VEHx","STM32H723ZETx","STM32H723ZEIx","STM32H733VGHx","STM32H733VGTx","STM32H733ZGIx","STM32H733ZGTx","STM32H725VGHx","STM32H725IGKx","STM32H725IGTx","STM32H725AGIx","STM32H725RGVx","STM32H725ZGTx","STM32H725VGTx","STM32H725VGYx","STM32H725REVx","STM32H725VETx","STM32H725VEHx","STM32H725ZETx","STM32H725AEIx","STM32H725IETx","STM32H725IEKx","STM32H735VGHx","STM32H735ZGTx","STM32H735VGTx","STM32H735VGYx","STM32H735AGIx","STM32H735IGKx","STM32H735IGTx","STM32H735RGVx","STM32H730VBHx","STM32H730VBTx","STM32H730IBTxQ","STM32H730IBKxQ","STM32H730ZBTx","STM32H730ZBIx","STM32H730ABIxQ"],sizes={B:128,E:512,G:1024};
export const H72_PROFILES=Object.freeze(Object.fromEntries(patterns.map(n=>[n,Object.freeze({controller:'h72-sector',pid:0x483,core:0xc27,idReg:ID,uid:0x1ff1e800,sizeReg:0x1ff1e880,flash:sizes[n[10]]*1024,ram:128*1024,stackRegions:Object.freeze([Object.freeze([0x20000000,0x20020000]),Object.freeze([0x24000000,0x24050000])]),stackAlign:8,sectorSize:SECTOR,wordSize:32})])));
export function h72Profile(name){
 const n=String(name).trim().toUpperCase().replace(/TR$/,'');
 for(const [pattern,p] of Object.entries(H72_PROFILES))if(n===pattern.slice(0,11)||new RegExp('^'+pattern.replace('x','[0-9]')+'$').test(n))return p;
 return null;
}
export async function identifyH72(s){
 const p=s.pr;
 if((await s.reg(ID)&0xfff)!==p.pid)throw Error('STM32H72/H73 device ID mismatch');
 if(((await s.reg(CPUID)>>>4)&0xfff)!==p.core)throw Error('STM32H72/H73 CPU mismatch');
 const b=await s.read(p.sizeReg,2);
 if(b.length!==2||(b[0]+256*b[1])*1024!==p.flash)throw Error('STM32H72/H73 Flash size mismatch');
 const uid=await s.read(p.uid,12);
 if(uid.length!==12||uid.every(x=>x===0)||uid.every(x=>x===255))throw Error('Invalid H7 UID');
 return 'stm32-'+Array.from(uid,x=>x.toString(16).padStart(2,'0')).join('');
}
function validateImage(b,p){if(!(b instanceof Uint8Array)||b.length>p.flash)throw Error('STM32H72/H73 Flash range');validateStmVector(b,p);}
async function idle(s){
 const deadline=Date.now()+60000;
 do{const st=await s.reg(SR);if(!(st&15))return st;await new Promise(r=>setTimeout(r,3));}while(Date.now()<deadline);
 throw Error('STM32H72/H73 Flash busy timeout');
}
async function complete(s){
 const st=await idle(s);
 if(st&ERR||!(st&EOP))throw Error('STM32H72/H73 Flash status 0x'+st.toString(16));
 await s.put(CLEAR,EOP);
}
async function preflight(s,b){
 const opt=await s.reg(OPTSR),oc=await s.reg(OPTCR),cr=await s.reg(CR),st=await idle(s);
 if(((opt>>>8)&255)!==0xaa||(opt&0x40200001)||!(oc&1)||(oc&2))throw Error('STM32H72/H73 option or security protection');
 // TCM_AXI_SHARED bits 1:0 in OPTSR2_CUR (RM0468). AXI SRAM is
 // 320/256/192/128 KiB respectively, and the flash code never changes it.
 const sharing=(await s.reg(F+0x70))&3;
 const sp=new DataView(b.buffer,b.byteOffset,b.byteLength).getUint32(0,true);
 if(sp>=0x24000000&&sp>0x24000000+(320-64*sharing)*1024)throw Error('STM32H72/H73 AXI SRAM size does not match image');
 if(cr&0x000087ce||st&ERR)throw Error('STM32H72/H73 active Flash operation or error: reset and inspect');
 if((await s.reg(BOOT)&0xffff)!==0x0800)throw Error('STM32H72/H73 nonstandard boot address');
 // Refuse all protected ranges; never unlock option bytes or remove protection.
 for(const a of [PRAR,SCAR]){
  const v=await s.reg(a);
  if((v&0xfff)<=((v>>>16)&0xfff))throw Error('STM32H72/H73 protected Flash area');
 }
 const mask=(1<<(s.pr.flash/SECTOR))-1;
 if(((await s.reg(WPSN))&mask)!==mask)throw Error('STM32H72/H73 WRP present');
 if((await s.reg(CCR))&0x30000)throw Error('STM32H72/H73 CPU caches enabled: reset and halt');
}
export async function programH72(s,b,progress=()=>{}){
 const p=s.pr;
 validateImage(b,p);
 if(typeof s.writeFlashWord32!=='function')throw Error('STM32H72/H73 32-byte transport unavailable');
 if(await identifyH72(s)!==s.id)throw Error('STM32H72/H73 UID changed');
 await s.put(DHCSR,0xa05f0003);
 if(!(await s.reg(DHCSR)&(1<<17)))throw Error('STM32H72/H73 core not halted');
 await preflight(s,b);
 // Byte parallelism (PSIZE=0), but exactly 32 bytes per programming row.
 // Keep existing ACR timing and never use forced write or bank mass erase.
 try{
  if(await s.reg(CR)&LOCK){await s.put(KEY,0x45670123);await s.put(KEY,0xcdef89ab);}
  if(await s.reg(CR)&LOCK)throw Error('STM32H72/H73 Flash locked');
  await s.put(CLEAR,EOP);
  const count=p.flash/SECTOR;
  for(let n=0;n<count;n++){
   const cmd=SER|(n<<8);
   await s.put(CR,cmd);await s.put(CR,cmd|START);await complete(s);
   progress(.2*(n+1)/count);
  }
  await s.put(CR,PG);
  for(let i=0;i<b.length;i+=32){
   const data=new Uint8Array(32).fill(255);data.set(b.slice(i,i+32));
   if(data.some(x=>x!==255)){await s.writeFlashWord32(BASE+i,data);await complete(s);}
   if(i%1024===0)progress(.2+.6*Math.min(i+32,b.length)/b.length);
  }
  await s.put(CR,0);
  for(let i=0;i<p.flash;i+=1024){
   const n=Math.min(1024,p.flash-i),expected=new Uint8Array(n).fill(255);expected.set(b.slice(i,i+n));
   const got=await s.read(BASE+i,n);
   if(got.length!==n||!got.every((v,k)=>v===expected[k]))throw Error('STM32H72/H73 readback mismatch @0x'+(BASE+i).toString(16));
   if((await s.reg(SR))&ERR)throw Error('STM32H72/H73 readback ECC/status error');
   progress(.8+.2*(i+n)/p.flash);
  }
 }finally{
  // Never force or clear PG with an incomplete buffered ECC row. A target
  // power cycle is required if WBNE remains after transport failure.
  const deadline=Date.now()+60000;
  let st;
  do{st=await s.reg(SR);if(!(st&13))break;await new Promise(r=>setTimeout(r,3));}while(Date.now()<deadline);
  if(st&13)throw Error('STM32H72/H73 relock blocked by active Flash operation');
  if(st&2)throw Error('STM32H72/H73 incomplete Flash row: power-cycle target before retry');
  if(!(await s.reg(CR)&LOCK)){await s.put(CR,0);await s.put(CR,LOCK);}
  if(!(await s.reg(CR)&LOCK))throw Error('STM32H72/H73 relock failed');
 }
}
