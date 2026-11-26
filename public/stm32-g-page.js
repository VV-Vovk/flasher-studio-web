// Independent register-level implementation: ST RM0444 rev 6 (single-bank G0x1),
// RM0454 rev 5 (G0x0 single-bank), RM0444 rev 6 (G0B1/C1 bank modes),
// RM0440 rev 9 chapters 3–5 (G4 categories 2, 3, 4). No vendor code or loader binaries.
import {validateStmVector} from './programmers.js';
const BASE=0x08000000,F=0x40022000,ACR=F,KEY=F+8,SR=F+16,CR=F+20,OPTR=F+32,ECCR=F+24;
const LOCK=0x80000000,OPTLOCK=0x40000000,IRQ=0x03000000,START=0x10000,ERRORS=0xc3fa;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const variants=["STM32G031C4Tx","STM32G031C4Ux","STM32G031F4Px","STM32G031G4Ux","STM32G031J4Mx","STM32G031K4Tx","STM32G031K4Ux","STM32G031C6Tx","STM32G031C6Ux","STM32G031F6Px","STM32G031G6Ux","STM32G031J6Mx","STM32G031K6Tx","STM32G031K6Ux","STM32G031C8Tx","STM32G031C8Ux","STM32G031F8Px","STM32G031G8Ux","STM32G031K8Tx","STM32G031K8Ux","STM32G031Y8Yx","STM32G041C6Tx","STM32G041C6Ux","STM32G041F6Px","STM32G041G6Ux","STM32G041J6Mx","STM32G041K6Tx","STM32G041K6Ux","STM32G041C8Tx","STM32G041C8Ux","STM32G041F8Px","STM32G041G8Ux","STM32G041K8Tx","STM32G041K8Ux","STM32G041Y8Yx","STM32G051C6Tx","STM32G051C6Ux","STM32G051F6Px","STM32G051G6Ux","STM32G051K6Tx","STM32G051K6Ux","STM32G051C8Tx","STM32G051C8Ux","STM32G051G8Ux","STM32G051K8Tx","STM32G051K8Ux","STM32G051F8Yx","STM32G051F8Px","STM32G061C6Tx","STM32G061C6Ux","STM32G061F6Px","STM32G061G6Ux","STM32G061K6Tx","STM32G061K6Ux","STM32G061C8Tx","STM32G061C8Ux","STM32G061F8Yx","STM32G061F8Px","STM32G061G8Ux","STM32G061K8Tx","STM32G061K8Ux","STM32G071C8Tx","STM32G071C8Ux","STM32G071G8Ux","STM32G071G8UxN","STM32G071K8Tx","STM32G071K8TxN","STM32G071K8Ux","STM32G071K8UxN","STM32G071R8Tx","STM32G071CBTx","STM32G071CBUx","STM32G071EBYx","STM32G071GBUx","STM32G071GBUxN","STM32G071KBTx","STM32G071KBTxN","STM32G071KBUx","STM32G071KBUxN","STM32G071RBIx","STM32G071RBTx","STM32G081CBTx","STM32G081CBUx","STM32G081EBYx","STM32G081GBUx","STM32G081GBUxN","STM32G081KBTx","STM32G081KBTxN","STM32G081KBUx","STM32G081KBUxN","STM32G081RBIx","STM32G081RBTx","STM32G431CBTx","STM32G431CBUx","STM32G431CBYx","STM32G431CBTxZ","STM32G431KBTx","STM32G431KBUx","STM32G431RBTx","STM32G431RBIx","STM32G431RBTxZ","STM32G431VBTx","STM32G431MBTx","STM32G431C8Tx","STM32G431C8Ux","STM32G431K8Tx","STM32G431K8Ux","STM32G431M8Tx","STM32G431R8Tx","STM32G431R8Ix","STM32G431V8Tx","STM32G431C6Tx","STM32G431C6Ux","STM32G431K6Tx","STM32G431K6Ux","STM32G431M6Tx","STM32G431R6Tx","STM32G431R6Ix","STM32G431V6Tx","STM32G441CBTx","STM32G441CBUx","STM32G441CBYx","STM32G441KBTx","STM32G441KBUx","STM32G441RBTx","STM32G441RBIx","STM32G441VBTx","STM32G441MBTx"];
variants.push(...["STM32G030C6Tx","STM32G030F6Px","STM32G030J6Mx","STM32G030K6Tx","STM32G030C8Tx","STM32G030K8Tx","STM32G050C6Tx","STM32G050K6Tx","STM32G050F6Px","STM32G050C8Tx","STM32G050K8Tx","STM32G070CBTx","STM32G070KBTx","STM32G070RBTx","STM32G0B1CBUx","STM32G0B1CBUxN","STM32G0B1CBTx","STM32G0B1CBTxN","STM32G0B1KBUx","STM32G0B1KBTx","STM32G0B1KBTxN","STM32G0B1KBUxN","STM32G0B1RBTx","STM32G0B1RBTxN","STM32G0B1RBIxN","STM32G0B1VBTx","STM32G0B1VBIx","STM32G0B1MBTx","STM32G0B1KCUx","STM32G0B1KCUxN","STM32G0B1KCTx","STM32G0B1KCTxN","STM32G0B1CCUx","STM32G0B1CCUxN","STM32G0B1CCTx","STM32G0B1CCTxN","STM32G0B1RCTx","STM32G0B1RCTxN","STM32G0B1RCIxN","STM32G0B1VCTx","STM32G0B1VCIx","STM32G0B1MCTx","STM32G0B1KEUx","STM32G0B1KEUxN","STM32G0B1KETx","STM32G0B1KETxN","STM32G0B1CEUx","STM32G0B1CEUxN","STM32G0B1CETx","STM32G0B1CETxN","STM32G0B1RETx","STM32G0B1RETxN","STM32G0B1REIxN","STM32G0B1VETx","STM32G0B1VEIx","STM32G0B1METx","STM32G0B1NEYx","STM32G0C1KCUx","STM32G0C1KCTx","STM32G0C1KCUxN","STM32G0C1KCTxN","STM32G0C1CCUx","STM32G0C1CCUxN","STM32G0C1CCTx","STM32G0C1CCTxN","STM32G0C1RCTx","STM32G0C1RCTxN","STM32G0C1RCIxN","STM32G0C1VCTx","STM32G0C1VCIx","STM32G0C1MCTx","STM32G0C1KEUx","STM32G0C1KETx","STM32G0C1KEUxN","STM32G0C1KETxN","STM32G0C1CEUx","STM32G0C1CEUxN","STM32G0C1CETx","STM32G0C1CETxN","STM32G0C1RETx","STM32G0C1RETxN","STM32G0C1REIxN","STM32G0C1VETx","STM32G0C1VEIx","STM32G0C1METx","STM32G0C1NEYx"]);
variants.push(...["STM32G0B0CETx","STM32G0B0KETx","STM32G0B0RETx","STM32G0B0VETx","STM32G471CETx","STM32G471CEUx","STM32G471METx","STM32G471MEYx","STM32G471RETx","STM32G471VETx","STM32G471VEHx","STM32G471VEIx","STM32G471QETx","STM32G471CCTx","STM32G471CCUx","STM32G471MCTx","STM32G471QCTx","STM32G471RCTx","STM32G471VCTx","STM32G471VCHx","STM32G471VCIx","STM32G473CETx","STM32G473CEUx","STM32G473METx","STM32G473MEYx","STM32G473RETx","STM32G473RETxZ","STM32G473VETx","STM32G473VEHx","STM32G473QETx","STM32G473QETxZ","STM32G473PEIx","STM32G473CCTx","STM32G473CCUx","STM32G473MCTx","STM32G473QCTx","STM32G473RCTx","STM32G473VCTx","STM32G473VCHx","STM32G473PCIx","STM32G473CBTx","STM32G473CBUx","STM32G473MBTx","STM32G473QBTx","STM32G473RBTx","STM32G473VBTx","STM32G473VBHx","STM32G473PBIx","STM32G474CETx","STM32G474CEUx","STM32G474RETx","STM32G474VETx","STM32G474VEHx","STM32G474METx","STM32G474MEYx","STM32G474QETx","STM32G474PEIx","STM32G474CCTx","STM32G474CCUx","STM32G474MCTx","STM32G474QCTx","STM32G474RCTx","STM32G474VCTx","STM32G474VCHx","STM32G474PCIx","STM32G474CBTx","STM32G474CBUx","STM32G474RBTx","STM32G474VBHx","STM32G474VBTx","STM32G474QBTx","STM32G474MBTx","STM32G474PBIx","STM32G483CETx","STM32G483CEUx","STM32G483METx","STM32G483MEYx","STM32G483RETx","STM32G483VETx","STM32G483VEHx","STM32G483QETx","STM32G483PEIx","STM32G484CETx","STM32G484CEUx","STM32G484RETx","STM32G484VETx","STM32G484VEHx","STM32G484METx","STM32G484MEYx","STM32G484QETx","STM32G484PEIx","STM32G491CETx","STM32G491CETxZ","STM32G491CEUx","STM32G491KEUx","STM32G491METx","STM32G491MESx","STM32G491RETx","STM32G491REIx","STM32G491REYx","STM32G491RETxZ","STM32G491VETx","STM32G491CCTx","STM32G491CCUx","STM32G491KCUx","STM32G491MCTx","STM32G491MCSx","STM32G491RCTx","STM32G491RCIx","STM32G491VCTx","STM32G4A1KEUx","STM32G4A1CETx","STM32G4A1CEUx","STM32G4A1METx","STM32G4A1MESx","STM32G4A1RETx","STM32G4A1REIx","STM32G4A1REYx","STM32G4A1VETx"]);
const lines={"431":[1128,32],"441":[1128,32],"031":[1126,8],"041":[1126,8],"051":[1110,18],"061":[1110,18],"071":[1120,36],"081":[1120,36],"030":[1126,8],"050":[1110,18],"070":[1120,36],"0B1":[1127,144],"0C1":[1127,144],"0B0":[1127,144],"471":[1129,128],"473":[1129,128],"474":[1129,128],"483":[1129,128],"484":[1129,128],"491":[1145,112],"4A1":[1145,112]};
const sizes={4:16,6:32,8:64,B:128,C:256,E:512};
const registry=Object.fromEntries(variants.map(n=>{
 const line=n.slice(6,9),[pid,ram]=lines[line],g4=line[0]==='4';
 const valueLine=['030','050','070','0B0'].includes(line),bankCapable=['0B0','0B1','0C1'].includes(line),category=g4?(pid===0x469?3:pid===0x479?4:2):0;
 const profile=Object.freeze({controller:'g-single-page',g4,valueLine,bankCapable,category,pid,flash:sizes[n[10]]*1024,ram:ram*1024,ccm:category===3?32768:category===4?16384:category===2?10240:0,pageSize:2048,idReg:g4?0xe0042000:0x40015800,core:g4?0xc24:0xc60,uid:0x1fff7590,sizeReg:0x1fff75e0});
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
async function checkG4BankSwap(s){
 // RCC_APB2ENR.SYSCFGEN must be enabled for a meaningful MEMRMP read.
 const a=0x40021060,old=await s.reg(a);
 try{if(!(old&1))await s.put(a,(old|1)>>>0);if(!(await s.reg(a)&1))throw Error('SYSCFG clock unavailable');if((await s.reg(0x40010000))&0x100)throw Error('STM32G swapped banks not supported');}
 finally{if(!(old&1))await s.put(a,old);}
}
async function eccCheck(s,dual){
 const p=s.pr,mask=p.category===3&&!dual?0xf0000000:0xc0000000;
 if((await s.reg(ECCR))&mask||!p.g4&&dual&&((await s.reg(F+0x1c))&0xc0000000))throw Error('STM32G ECC fault');
}
async function checkProtection(s){
 const p=s.pr,op=await s.reg(OPTR),cr=await s.reg(CR),status=await idle(s);
 if((op&255)!==0xaa||(status&0xc000)||!(cr&OPTLOCK)||(cr&0x3807a007))throw Error('STM32G option/protection or active operation');
 const dual=p.category===3?!!(op&(1<<22)):p.bankCapable&&(p.flash===524288||(p.flash===262144&&!!(op&(1<<21))));
 // G4 lower-density dual-bank parts have a gap before bank 2 at 0x08040000.
 // The current dense image representation cannot safely describe that layout.
 if(p.category===3&&dual&&p.flash<524288)throw Error('STM32G4 dual-bank address gap requires a segmented firmware image');
 if(p.category===3&&dual){if(op&(1<<20))throw Error('STM32G4 alternate boot bank not supported');await checkG4BankSwap(s);}
 // The two physical banks may be swapped. Reject instead of changing option bytes.
 if(!p.g4&&dual&&!(op&(1<<20)))throw Error('STM32G swapped banks not supported');
 const wm=p.category===4?0xff:p.category===2?0x3f:0x7f;
 for(const off of dual||p.category===3?[0x2c,0x30,0x4c,0x50]:[0x2c,0x30]){
  const v=await s.reg(F+off);
  if((v&wm)<=((v>>>16)&wm))throw Error('STM32G WRP protection present');
 }
 const pm=p.category===4?0xffff:p.g4?0x7fff:0x1ff;
 for(const [a,b] of p.valueLine?[]:p.category===3?[[0x24,0x28],[0x44,0x48]]:p.g4?[[0x24,0x28]]:dual?[[0x24,0x28],[0x34,0x38],[0x44,0x48],[0x54,0x58]]:[[0x24,0x28],[0x34,0x38]]){
  if(((await s.reg(F+a))&pm)<=((await s.reg(F+b))&pm))throw Error('STM32G PCROP protection present');
 }
 if(!p.valueLine&&((await s.reg(F+(p.g4?0x70:0x80)))&(p.category===4?0x1ff:p.g4?0xff:dual?0x0ff000ff:0xff)))throw Error('STM32G securable area present');
 if(p.category===3&&dual&&((await s.reg(F+0x74))&0xff))throw Error('STM32G bank 2 securable area present');
 await eccCheck(s,dual);
 // x0 and x1 share device IDs. Do not ignore implemented x1-only protection registers
 // if a user accidentally selects an x0 geometry: reserved fields on x0 read zero.
 if(p.valueLine){
  for(const off of dual?[0x24,0x28,0x34,0x38,0x44,0x48,0x54,0x58,0x80]:[0x24,0x28,0x34,0x38,0x80])if(await s.reg(F+off))throw Error('STM32G value-line profile mismatch or protected device');
  // Read every 512-byte subpage before erase to catch a read-protected x1 with zero
  // start/end values. No read-unprotect or option byte changes are attempted.
  for(let off=0;off<p.flash;off+=512){const probe=await s.read(BASE+off,4);if(probe.length!==4||((await s.reg(SR))&0xc000)||((await s.reg(ECCR))&0xc0000000))throw Error('STM32G pre-erase protection read failed');}
 }
 return {op,dual};
}
export async function programGPage(s,b,progress=()=>{}){
 const p=s.pr;
 if(!(b instanceof Uint8Array)||b.length>p.flash||typeof s.writeDoubleword!=='function')throw Error('STM32G Flash range or transport');
 validateStmVector(b,p);
 if(await identifyGPage(s)!==s.id)throw Error('UID changed');
 await s.put(0xe000edf0,0xa05f0003);
 if(!(await s.reg(0xe000edf0)&(1<<17)))throw Error('Core not halted');
 const {op,dual}=await checkProtection(s);
 // G0 extended parity RAM is optional. Refuse ambiguous stack placement when parity is enabled.
 if(!p.g4&&p.ram>8192&&!(op&(1<<22))){
   const sp=new DataView(b.buffer,b.byteOffset,b.byteLength).getUint32(0,true);
   const usable=p.ram===18432?16384:p.ram===147456?131072:32768;
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
  if(p.bankCapable||p.category===3||p.category===4){
   // Explicit full-main-flash erase was already confirmed in the UI. MER1/MER2
   // avoid ambiguous PNB numbering between manual revisions; no system/OTP erase.
   const cmd=OPTLOCK|IRQ|4|(dual||p.category===3?0x8000:0);
   await s.put(CR,cmd);await s.put(CR,cmd|START);await complete(s);progress(.1);
  }else for(let page=0;page<pages;page++){
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
   await eccCheck(s,dual);if((await s.reg(SR))&ERRORS)throw Error('STM32G status verification fault');
   progress(.85+.15*(i+n)/p.flash);
  }
 }finally{
  await idle(s);
  // No option writes, no unlock of OPTLOCK, no RDP regression.
  await s.put(CR,(LOCK|OPTLOCK)>>>0);
  if(((await s.reg(CR))>>>30)!==3)throw Error('STM32G Flash relock failed');
 }
}
