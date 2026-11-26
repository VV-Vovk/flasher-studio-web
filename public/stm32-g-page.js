// Independent register-level implementation: ST RM0444 rev 6 (single-bank G0x1),
// RM0440 rev 9 chapter 5 (category 2 G431/G441). No vendor code or loader binaries.
import {validateStmVector} from './programmers.js';
const BASE=0x08000000,F=0x40022000,ACR=F,KEY=F+8,SR=F+16,CR=F+20,OPTR=F+32,ECCR=F+24;
const LOCK=0x80000000,OPTLOCK=0x40000000,IRQ=0x03000000,START=0x10000,ERRORS=0xc3fa;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const variants=["STM32G031C4Tx","STM32G031C4Ux","STM32G031F4Px","STM32G031G4Ux","STM32G031J4Mx","STM32G031K4Tx","STM32G031K4Ux","STM32G031C6Tx","STM32G031C6Ux","STM32G031F6Px","STM32G031G6Ux","STM32G031J6Mx","STM32G031K6Tx","STM32G031K6Ux","STM32G031C8Tx","STM32G031C8Ux","STM32G031F8Px","STM32G031G8Ux","STM32G031K8Tx","STM32G031K8Ux","STM32G031Y8Yx","STM32G041C6Tx","STM32G041C6Ux","STM32G041F6Px","STM32G041G6Ux","STM32G041J6Mx","STM32G041K6Tx","STM32G041K6Ux","STM32G041C8Tx","STM32G041C8Ux","STM32G041F8Px","STM32G041G8Ux","STM32G041K8Tx","STM32G041K8Ux","STM32G041Y8Yx","STM32G051C6Tx","STM32G051C6Ux","STM32G051F6Px","STM32G051G6Ux","STM32G051K6Tx","STM32G051K6Ux","STM32G051C8Tx","STM32G051C8Ux","STM32G051G8Ux","STM32G051K8Tx","STM32G051K8Ux","STM32G051F8Yx","STM32G051F8Px","STM32G061C6Tx","STM32G061C6Ux","STM32G061F6Px","STM32G061G6Ux","STM32G061K6Tx","STM32G061K6Ux","STM32G061C8Tx","STM32G061C8Ux","STM32G061F8Yx","STM32G061F8Px","STM32G061G8Ux","STM32G061K8Tx","STM32G061K8Ux","STM32G071C8Tx","STM32G071C8Ux","STM32G071G8Ux","STM32G071G8UxN","STM32G071K8Tx","STM32G071K8TxN","STM32G071K8Ux","STM32G071K8UxN","STM32G071R8Tx","STM32G071CBTx","STM32G071CBUx","STM32G071EBYx","STM32G071GBUx","STM32G071GBUxN","STM32G071KBTx","STM32G071KBTxN","STM32G071KBUx","STM32G071KBUxN","STM32G071RBIx","STM32G071RBTx","STM32G081CBTx","STM32G081CBUx","STM32G081EBYx","STM32G081GBUx","STM32G081GBUxN","STM32G081KBTx","STM32G081KBTxN","STM32G081KBUx","STM32G081KBUxN","STM32G081RBIx","STM32G081RBTx","STM32G431CBTx","STM32G431CBUx","STM32G431CBYx","STM32G431CBTxZ","STM32G431KBTx","STM32G431KBUx","STM32G431RBTx","STM32G431RBIx","STM32G431RBTxZ","STM32G431VBTx","STM32G431MBTx","STM32G431C8Tx","STM32G431C8Ux","STM32G431K8Tx","STM32G431K8Ux","STM32G431M8Tx","STM32G431R8Tx","STM32G431R8Ix","STM32G431V8Tx","STM32G431C6Tx","STM32G431C6Ux","STM32G431K6Tx","STM32G431K6Ux","STM32G431M6Tx","STM32G431R6Tx","STM32G431R6Ix","STM32G431V6Tx","STM32G441CBTx","STM32G441CBUx","STM32G441CBYx","STM32G441KBTx","STM32G441KBUx","STM32G441RBTx","STM32G441RBIx","STM32G441VBTx","STM32G441MBTx"];
const lines={"431":[1128,32],"441":[1128,32],"031":[1126,8],"041":[1126,8],"051":[1110,18],"061":[1110,18],"071":[1120,36],"081":[1120,36]};
const sizes={4:16,6:32,8:64,B:128};
const registry=Object.fromEntries(variants.map(n=>{
 const line=n.slice(6,9),[pid,ram]=lines[line],g4=line[0]==='4';
 const profile=Object.freeze({controller:'g-single-page',g4,pid,flash:sizes[n[10]]*1024,ram:ram*1024,ccm:g4?10240:0,pageSize:2048,idReg:g4?0xe0042000:0x40015800,core:g4?0xc24:0xc60,uid:0x1fff7590,sizeReg:0x1fff75e0});
 return [n,profile];
}));
export const G_PAGE_PROFILES=Object.freeze(registry);
export function gPageProfile(name){
 const n=String(name).toUpperCase().replace(/TR$/,'');
 // Exact package pattern required for non-base order codes. A base selects
 // the same Flash geometry, but does not imply a Builder package match.
 const matches=Object.entries(registry).filter(([p])=>n===p.slice(0,11)||new RegExp('^'+p.replace('x','[0-9]')+'$').test(n));
 return matches[0]?.[1]||null;
}
export async function identifyGPage(s){
 const p=s.pr;
 if((await s.reg(p.idReg)&0xfff)!==p.pid)throw Error('STM32G device ID mismatch');
 if(((await s.reg(0xe000ed00)>>>4)&0xfff)!==p.core)throw Error('STM32G core mismatch');
 const b=await s.read(p.sizeReg,2);
 if(b.length!==2||(b[0]+256*b[1])*1024!==p.flash)throw Error('STM32G Flash size mismatch');
 const uid=await s.read(p.uid,12);
 if(uid.length!==12||uid.every(x=>!x)||uid.every(x=>x===255))throw Error('Invalid UID');
 return 'stm32-'+Array.from(uid,x=>x.toString(16).padStart(2,'0')).join('');
}
async function idle(s){
 const until=Date.now()+20000,mask=s.pr.g4?0x10000:0x70000;
 do{const v=await s.reg(SR);if(!(v&mask))return v;await wait(3);}while(Date.now()<until);
 throw Error('STM32G Flash busy timeout');
}
async function complete(s){
 const v=await idle(s);
 if(v&ERRORS)throw Error('STM32G Flash status 0x'+v.toString(16));
 if(!(v&1))throw Error('STM32G missing EOP');
 await s.put(SR,1);
}
async function checkProtection(s){
 const p=s.pr,op=await s.reg(OPTR),cr=await s.reg(CR),status=await idle(s);
 if((op&255)!==0xaa||(status&0x8000)||!(cr&OPTLOCK)||(cr&0x38078007))throw Error('STM32G option/protection or active operation');
 const wm=p.g4?0x3f:0x7f;
 for(const off of [0x2c,0x30]){
  const v=await s.reg(F+off);
  if((v&wm)<=((v>>>16)&wm))throw Error('STM32G WRP protection present');
 }
 const pm=p.g4?0x7fff:0x1ff;
 for(const [a,b] of p.g4?[[0x24,0x28]]:[[0x24,0x28],[0x34,0x38]]){
  if(((await s.reg(F+a))&pm)<=((await s.reg(F+b))&pm))throw Error('STM32G PCROP protection present');
 }
 if((await s.reg(F+(p.g4?0x70:0x80)))&(p.g4?0x7f:0xff))throw Error('STM32G securable area present');
 if((await s.reg(ECCR))&0xc0000000)throw Error('STM32G existing ECC fault; reset and inspect');
 return op;
}
export async function programGPage(s,b,progress=()=>{}){
 const p=s.pr;
 if(!(b instanceof Uint8Array)||b.length>p.flash||typeof s.writeDoubleword!=='function')throw Error('STM32G Flash range or transport');
 validateStmVector(b,p);
 if(await identifyGPage(s)!==s.id)throw Error('UID changed');
 await s.put(0xe000edf0,0xa05f0003);
 if(!(await s.reg(0xe000edf0)&(1<<17)))throw Error('Core not halted');
 const op=await checkProtection(s);
 // G0 extended parity RAM is optional. Refuse ambiguous stack placement when parity is enabled.
 if(!p.g4&&p.ram>8192&&!(op&(1<<22))){
   const sp=new DataView(b.buffer,b.byteOffset,b.byteLength).getUint32(0,true);
   const usable=p.ram===18432?16384:32768;
   if(sp>0x20000000+usable)throw Error('STM32G parity RAM stack mismatch');
 }
 const acr=await s.reg(ACR),cacheOff=acr&~(p.g4?0x1f00:0xb00);
 // Keep caches disabled until the required reset; never restore stale data.
 try{
  if(await s.reg(CR)&LOCK){await s.put(KEY,0x45670123);await s.put(KEY,0xcdef89ab);}
  if(await s.reg(CR)&LOCK)throw Error('STM32G Flash locked');
  await s.put(ACR,cacheOff);
  if((await s.reg(ACR))&(p.g4?0x700:0x300))throw Error('STM32G cache disable failed');
  await s.put(ACR,cacheOff|(p.g4?0x1800:0x800));await s.put(ACR,cacheOff);
  await s.put(SR,ERRORS|1);
  const pages=p.flash/p.pageSize;
  for(let page=0;page<pages;page++){
   const cmd=OPTLOCK|IRQ|2|(page<<3);
   await s.put(CR,cmd);await s.put(CR,cmd|START);await complete(s);
   progress(.1*(page+1)/pages);
  }
  await s.put(CR,OPTLOCK|IRQ|1);
  for(let i=0;i<b.length;i+=8){
   const data=new Uint8Array(8).fill(255);data.set(b.slice(i,i+8));
   if(data.some(x=>x!==255)){await s.writeDoubleword(BASE+i,data);await complete(s);}
   if(i%256===0)progress(.1+.75*i/b.length);
  }
  await s.put(CR,OPTLOCK);
  for(let i=0;i<p.flash;i+=256){
   const n=Math.min(256,p.flash-i),expected=new Uint8Array(n).fill(255);expected.set(b.slice(i,i+n));
   const got=await s.read(BASE+i,n);
   if(got.length!==n||!got.every((v,k)=>v===expected[k]))throw Error('STM32G Flash readback mismatch @0x'+(BASE+i).toString(16));
   if((await s.reg(ECCR))&0xc0000000)throw Error('STM32G ECC verification fault');
   progress(.85+.15*(i+n)/p.flash);
  }
 }finally{
  await idle(s);
  // No option writes, no unlock of OPTLOCK, no RDP regression.
  await s.put(CR,(LOCK|OPTLOCK)>>>0);
  if(((await s.reg(CR))>>>30)!==3)throw Error('STM32G Flash relock failed');
 }
}
