// Experimental ROM DFU planning for STM32WB. No USB I/O or activation.
 // AN2606 rev 71 sections 84/85; AN3156; RM0434. The caller must obtain a
 // trustworthy current security snapshot from the same device/session.
 // A descriptor or user-entered size is never a substitute for SFSA.
import {wbProfile,wbFlashLayout} from './stm32-wb.js';
import {validateStmVector} from './programmers.js';
import {readWbRadioInfo} from './wb-radio.js';
import {radioUpdateRequirements,radioOptions,planRadioUpdate} from './wb-radio-plan.js';
import {dfuGeometry,StmDfu} from './extra-programmers.js';
const BASE=0x08000000;
function uint32(n){return Number.isInteger(n)&&n>=0&&n<=0xffffffff;}
export function wbRomDfuCandidate(name){
 const n=String(name).trim().toUpperCase().replace(/TR$/,'');
 // AN5451 table 8: WB30/WB50 have no physical USB; WB10/15 and modules excluded.
 return /^STM32WB(?:35|55)[A-Z][A-Z][A-Z][0-9][A-Z]*$/.test(n)&&!!wbProfile(n);
}
export function wbDfuPlan(name,image,descriptor,snapshot){
 if(!wbRomDfuCandidate(name))throw Error('WB ROM DFU target not reviewed');
 const p=wbProfile(name);
 if(!snapshot||!['sfr','optr','srrvr'].every(k=>uint32(snapshot[k])))throw Error('WB DFU requires live SFSA and option state');
 if(!Array.isArray(snapshot.wrp)||snapshot.wrp.length!==2||!snapshot.wrp.every(uint32)||!Array.isArray(snapshot.pcrop)||snapshot.pcrop.length!==2||!snapshot.pcrop.every(x=>Array.isArray(x)&&x.length===2&&x.every(uint32)))throw Error('WB DFU requires live write/read protection state');
 const {limit}=wbFlashLayout(p,snapshot.sfr,snapshot.optr,snapshot.srrvr);
 validateStmVector(image,p);
 const span=Math.ceil(image.length/p.pageSize)*p.pageSize;
 if(span>limit)throw Error('WB DFU image crosses SFSA');
 for(const v of snapshot.wrp){
  const first=v&p.wrpMask,last=(v>>>16)&p.wrpMask;
  if(first<=last&&first*p.pageSize<span)throw Error('WB DFU WRP intersects application');
 }
 for(const [a,z] of snapshot.pcrop){
  const first=a&p.pcropMask,last=z&p.pcropMask;
  if(first<=last&&first*(p.pageSize/2)<span)throw Error('WB DFU PCROP intersects application');
 }
 const pages=dfuGeometry(descriptor);
 const total=pages.reduce((n,x)=>n+x.size,0);
 if(!pages.length||pages.some((x,i)=>x.size!==p.pageSize||x.address!==BASE+i*p.pageSize)||!(total===limit||total===p.flash))throw Error('WB DFU descriptor geometry mismatch');
 const erasePages=pages.slice(0,span/p.pageSize);
 if(erasePages.length!==span/p.pageSize||erasePages.some(x=>x.address+x.size>BASE+limit))throw Error('WB DFU erase plan exceeds application');
 return Object.freeze({limit,span,physical:p.flash,pageSize:p.pageSize,erasePages:Object.freeze(erasePages.map(x=>Object.freeze({...x})))});
}

// Diagnostic session: only SET_ADDRESS + UPLOAD/ABORT/status. Never erase,
// unprotect, write target bytes, start CPU2 or leave DFU.
export class WbDfuReadOnly extends StmDfu{
 async pointer(a){if(!Number.isInteger(a)||a<0||a>=0xffff0000)throw Error('WB DFU virtual FUS addresses not allowed in diagnostic');return super.pointer(a);}
 async output(req,b=new Uint8Array(),value=0){
  if(!(req===6&&value===0&&b.length===0||req===1&&value===0&&b.length===5&&b[0]===0x21&&new DataView(b.buffer,b.byteOffset+1,4).getUint32(0,true)<0xffff0000))throw Error('WB DFU diagnostic is read-only');
  return super.output(req,b,value);
 }
 async program(){throw Error('WB DFU writing not enabled');}
}
async function wbDfuSnapshot(s){
 const read32=async a=>{const b=await s.read(a,4);if(b.length!==4)throw Error('WB DFU short register read');return new DataView(b.buffer,b.byteOffset,b.byteLength).getUint32(0,true);};
 const F=0x58004000;
 return {sfr:await read32(F+0x80),optr:await read32(F+0x20),srrvr:await read32(F+0x84),wrp:[await read32(F+0x2c),await read32(F+0x30)],pcrop:[[await read32(F+0x24),await read32(F+0x28)],[await read32(F+0x34),await read32(F+0x38)]]};
}
export async function inspectWbDfu(s,name,descriptor){
 if(!wbRomDfuCandidate(name)||s.pr!==wbProfile(name))throw Error('WB DFU target not reviewed');
 const id=await s.identify(),snapshot=await wbDfuSnapshot(s);
 const layout=wbFlashLayout(s.pr,snapshot.sfr,snapshot.optr,snapshot.srrvr);
 const pages=dfuGeometry(descriptor),bytes=pages.reduce((n,x)=>n+x.size,0);
 if(![layout.limit,s.pr.flash].includes(bytes)||pages.some((p,i)=>p.size!==s.pr.pageSize||p.address!==BASE+i*s.pr.pageSize))throw Error('WB DFU descriptor geometry mismatch');
 if(await s.identify()!==id)throw Error('WB DFU device changed');
 let radio=null;try{radio=await readWbRadioInfo(s);}catch{}return {target:name,flashKiB:s.pr.flash/1024,appKiB:layout.limit/1024,pageBytes:s.pr.pageSize,descriptorKiB:bytes/1024,readOnly:true,radio};
}
async function withWbDfu(name,usb,fn,mode='diagnostic'){
 if(!wbRomDfuCandidate(name)||!usb?.requestDevice)throw Error('WB DFU unavailable');
 const d=await usb.requestDevice({filters:[{vendorId:0x0483,productId:0xdf11}]});
 try{
  await d.open();if(!d.configuration)await d.selectConfiguration(1);
  const c=[];for(const i of d.configuration.interfaces)for(const a of i.alternates)if(a.interfaceClass===0xfe&&a.interfaceSubclass===1&&a.interfaceProtocol===2&&/^@Internal Flash/i.test(a.interfaceName||''))c.push({i,a});
  if(c.length!==1)throw Error('WB DFU ambiguous internal Flash');
  const {i,a}=c[0],pages=dfuGeometry(a.interfaceName);
  await d.claimInterface(i.interfaceNumber);await d.selectAlternateInterface(i.interfaceNumber,a.alternateSetting);
  const S=mode==='application'?WbDfuApplication:mode==='radio-start'?WbDfuRadioStart:mode==='radio-stage'?WbDfuRadioStage:WbDfuReadOnly;return await fn(new S(d,i.interfaceNumber,wbProfile(name),pages),a.interfaceName);
 }finally{if(d.opened)await d.close();}
}

export function probeWbDfu(name,usb=navigator.usb){return withWbDfu(name,usb,(s,d)=>inspectWbDfu(s,name,d));}
// Bounded application-only DfuSe driver. No special FUS commands, read unprotect,
// mass erase, option byte writes or manifestation. Fail closed if ROM cannot read
// the relevant registers or valid FUS device info. Hardware validation pending.
const equal=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);
const le=a=>[a&255,a>>>8&255,a>>>16&255,a>>>24&255];
export class WbDfuApplication extends WbDfuReadOnly{
 #allowed=null;
 async output(req,b=new Uint8Array(),value=0){
  if(this.#allowed&&req===1&&value===this.#allowed.value&&equal(b,this.#allowed.data))return StmDfu.prototype.output.call(this,req,b,value);
  return super.output(req,b,value);
 }
 async #write(value,data){
  if(this.#allowed)throw Error('WB DFU concurrent write');
  this.#allowed={value,data:Uint8Array.from(data)};
  try{await this.download(value,this.#allowed.data);}finally{this.#allowed=null;}
 }
 async program(name,image,descriptor,approve,progress=()=>{}){
  if(!wbRomDfuCandidate(name)||this.pr!==wbProfile(name)||!(image instanceof Uint8Array)||typeof approve!=='function')throw Error('WB DFU target / confirmation');
  const bytes=image.slice(),id=await this.identify();
  const snapshot=await wbDfuSnapshot(this),plan=wbDfuPlan(name,bytes,descriptor,snapshot);
  const check=async()=>{
   if(await this.identify()!==id||JSON.stringify(await wbDfuSnapshot(this))!==JSON.stringify(snapshot))throw Error('WB DFU identity/security changed');
   const reg=async a=>{const b=await this.read(a,4);if(b.length!==4)throw Error('WB short status');return new DataView(b.buffer,b.byteOffset,b.byteLength).getUint32(0,true);};
   if((await reg(0x58004010))&0x000de3fa||(await reg(0x58004060))&0x000d0000||(await reg(0x58004064))&0x00050007)throw Error('WB DFU flash busy/error');
   const radio=await readWbRadioInfo(this);if(radio.lastFusState!==0||radio.lastWirelessState!==0)throw Error('WB DFU FUS not reported idle; use SWD instead');
  };
  await check();await this.read(BASE,8);
  if(await approve({appKiB:plan.limit/1024,pages:plan.erasePages.length,bytes:bytes.length})!==true)return {cancelled:true};
  await check();
  for(let i=0;i<plan.erasePages.length;i++){
   await check();await this.idle();await this.#write(0,[0x41,...le(plan.erasePages[i].address)]);progress(.2*(i+1)/plan.erasePages.length);
  }
  for(let i=0;i<bytes.length;i+=256){
   if(i%plan.pageSize===0)await check();
   const raw=bytes.slice(i,i+256),pad=new Uint8Array(Math.ceil(raw.length/8)*8).fill(255);pad.set(raw);
   if(pad.some(x=>x!==255)){await this.pointer(BASE+i);await this.#write(2,pad);}
   progress(.2+.6*(i+raw.length)/bytes.length);
  }
  for(let i=0;i<plan.span;i+=256){const n=Math.min(256,plan.span-i),expected=new Uint8Array(n).fill(255);expected.set(bytes.slice(i,i+n));if(!equal(expected,await this.read(BASE+i,n)))throw Error('WB DFU readback mismatch');progress(.8+.2*(i+n)/plan.span);}
  await check();return {verified:true,bytes:bytes.length,pages:plan.erasePages.length};
 }
}
export function flashWbDfu(name,image,approve,progress,usb=navigator.usb){
 return withWbDfu(name,usb,(s,d)=>s.program(name,image,d,approve,progress),'application');
}

// AN5185 rev15 tables 24/25. A single explicit start request only.
// The read-only info table is distinct from GET_STATE, which can switch CPU2
// back to FUS after repeated commands. No GET_STATE poll after START_WS.
export class WbDfuRadioStart extends WbDfuReadOnly{
 #stateQuery=false;#start=false;#used=false;
 async pointer(a){if(this.#stateQuery&&a===0xffff0054)return StmDfu.prototype.pointer.call(this,a);return super.pointer(a);}
 async output(req,b=new Uint8Array(),value=0){
  if(req===1&&value===0&&(this.#start&&b.length===1&&b[0]===0x5a||this.#stateQuery&&b.length===5&&b[0]===0x21&&new DataView(b.buffer,b.byteOffset+1,4).getUint32(0,true)===0xffff0054))return StmDfu.prototype.output.call(this,req,b,value);
  return super.output(req,b,value);
 }
 async startInstalled(name,descriptor,approve){
  if(this.#used)throw Error('WB start session already used; reconnect and inspect');
  this.#used=true;
  if(typeof approve!=='function')throw Error('WB start requires approval');
  const id=await this.identify(),snapshot=await wbDfuSnapshot(this),info=await inspectWbDfu(this,name,descriptor);
  const radio=info.radio;
  if(!radio||radio.lastFusState!==0||radio.lastWirelessState!==0||!radio.wireless||!radio.stackType)throw Error('WB installed wireless stack and FUS idle not confirmed');
  if(await approve({target:name,version:radio.wireless})!==true)return {cancelled:true};
  if(await this.identify()!==id||JSON.stringify(await wbDfuSnapshot(this))!==JSON.stringify(snapshot)||JSON.stringify(await readWbRadioInfo(this))!==JSON.stringify(radio))throw Error('WB identity or radio state changed');
  this.#stateQuery=true;
  let state;try{state=await this.read(0xffff0054,2);}finally{this.#stateQuery=false;}
  if(state.length!==2||state[0]!==0||state[1]!==0)throw Error('WB FUS not idle / error; start blocked');
  await this.idle();this.#start=true;
  try{await this.download(0,Uint8Array.of(0x5a));}
  catch(e){throw Error('WB START_WS outcome unknown (reset possible). Do not retry blindly; reconnect and verify installed stack.',{cause:e});}
  finally{this.#start=false;}
  return {commandAccepted:true,runningVerified:false};
 }
}
export function startWbWireless(name,approve,usb=navigator.usb){
 return withWbDfu(name,usb,(s,d)=>s.startInstalled(name,d,approve),'radio-start');
}

// First experimental radio/FUS staging path. No erase, FUS upgrade command,
// reset, stack deletion or option-byte changes. Only a blank, reviewed range
// can be written. Stage/readback is NOT an installed firmware result.
export function wbRadioStagingPlan(name,file,applicationEnd,snapshot,descriptor,radio,acknowledge){
 const p=wbProfile(name);
 if(!wbRomDfuCandidate(name)||p.flash!==1048576||!/^STM32WB55/i.test(name))throw Error('WB radio staging: only reviewed 1 MiB WB55 USB targets');
 if(!radio?.fus||radio.lastFusState!==0||radio.lastWirelessState!==0||radio.wireless!==null||radio.stackType!==0)throw Error('WB radio staging requires idle FUS and no installed wireless stack');
 const currentFus=[radio.fus.major,radio.fus.minor,radio.fus.patch].join('.');
 const plan=radioUpdateRequirements({target:name,currentFus,name:file,applicationEnd,acknowledge});
 const option=radioOptions(name).find(e=>e.name===file);
 const start=Number(plan.installAddress),end=Number(plan.stagingEnd);
 if(!snapshot||!['sfr','optr','srrvr'].every(k=>uint32(snapshot[k]))||
 !Array.isArray(snapshot.wrp)||snapshot.wrp.length!==2||!snapshot.wrp.every(uint32)||
 !Array.isArray(snapshot.pcrop)||snapshot.pcrop.length!==2||!snapshot.pcrop.every(x=>Array.isArray(x)&&x.length===2&&x.every(uint32)))throw Error('WB staging requires complete live security state');
 const {limit}=wbFlashLayout(p,snapshot.sfr,snapshot.optr,snapshot.srrvr);
 if(start<BASE||start>=end||end>BASE+limit||start%p.pageSize||end%p.pageSize)throw Error('WB staging crosses live SFSA');
 const overlaps=(a,z,unit)=>a<=z&&BASE+a*unit<end&&BASE+(z+1)*unit>start;
 for(const v of snapshot.wrp)if(overlaps(v&p.wrpMask,(v>>>16)&p.wrpMask,p.pageSize))throw Error('WB staging WRP overlap');
 for(const [a,z] of snapshot.pcrop)if(overlaps(a&p.pcropMask,z&p.pcropMask,p.pageSize/2))throw Error('WB staging PCROP overlap');
 const pages=dfuGeometry(descriptor),total=pages.reduce((n,x)=>n+x.size,0);
 if(![limit,p.flash].includes(total)||pages.some((x,i)=>x.size!==p.pageSize||x.address!==BASE+i*p.pageSize))throw Error('WB staging descriptor mismatch');
 return Object.freeze({...plan,start,end,size:option.size,limit,pageSize:p.pageSize});
}
export class WbDfuRadioStage extends WbDfuReadOnly{
 #allowed=null;#used=false;
 async output(req,b=new Uint8Array(),value=0){
  if(this.#allowed&&req===1&&value===2&&equal(b,this.#allowed))return StmDfu.prototype.output.call(this,req,b,value);
  return super.output(req,b,value);
 }
 async #write(data){
  if(this.#allowed)throw Error('WB staging concurrent write');
  this.#allowed=data.slice();
  try{await this.download(2,this.#allowed);}finally{this.#allowed=null;}
 }
 async stage(name,descriptor,{file,bytes,applicationEnd,acknowledge},approve,progress=()=>{}){
  if(this.#used)throw Error('WB staging session already used');
  this.#used=true;
  if(!wbRomDfuCandidate(name)||this.pr!==wbProfile(name)||!(bytes instanceof Uint8Array)||typeof approve!=='function')throw Error('WB staging target / confirmation');
  const data=bytes.slice(),id=await this.identify(),snapshot=await wbDfuSnapshot(this),radio=await readWbRadioInfo(this);
  const plan=wbRadioStagingPlan(name,file,applicationEnd,snapshot,descriptor,radio,acknowledge);
  const verified=await planRadioUpdate({target:name,currentFus:plan.fromFus,name:file,bytes:data,applicationEnd,acknowledge});
  if(data.length!==plan.size||data.length%4||verified.installAddress!==plan.installAddress)throw Error('WB staging file / plan mismatch');
  const check=async()=>{
   if(await this.identify()!==id||JSON.stringify(await wbDfuSnapshot(this))!==JSON.stringify(snapshot)||JSON.stringify(await readWbRadioInfo(this))!==JSON.stringify(radio))throw Error('WB staging identity/security/radio changed');
   const reg=async a=>{const b=await this.read(a,4);if(b.length!==4)throw Error('WB staging short status');return new DataView(b.buffer,b.byteOffset,b.byteLength).getUint32(0,true);};
   if((await reg(0x58004010))&0x000de3fa||(await reg(0x58004060))&0x000d0000||(await reg(0x58004064))&0x00050007)throw Error('WB staging flash busy/error');
  };
  const blank=async(a,n)=>{const b=await this.read(a,n);if(b.length!==n||b.some(v=>v!==255))throw Error('WB staging range is not blank; no erase or retry');};
  if(await approve({target:name,file,version:plan.version,start:plan.start,end:plan.end,sha256:verified.sha256,stageOnly:true})!==true)return {cancelled:true};
  await check();
  const span=plan.end-plan.start;
  // Scan all affected pages before any write, then recheck each page just
  // before its first write. Do not silently erase user data or a prior stage.
  for(let i=0;i<span;i+=256){await blank(plan.start+i,256);progress(.2*(i+256)/span);}
  for(let page=0;page<span;page+=plan.pageSize){
   await check();
   for(let j=0;j<plan.pageSize;j+=256)await blank(plan.start+page+j,256);
   for(let j=0;j<plan.pageSize&&page+j<data.length;j+=256){
    const i=page+j,raw=data.slice(i,i+256),pad=new Uint8Array(Math.ceil(raw.length/8)*8).fill(255);pad.set(raw);
    if(pad.some(x=>x!==255)){await this.pointer(plan.start+i);await this.#write(pad);}
    progress(.2+.6*(i+raw.length)/data.length);
   }
  }
  for(let i=0;i<span;i+=256){
   const expected=new Uint8Array(256).fill(255);expected.set(data.slice(i,i+256));
   if(!equal(expected,await this.read(plan.start+i,256)))throw Error('WB staging readback mismatch');
   progress(.8+.2*(i+256)/span);
  }
  await check();
  return {staged:true,verified:true,installed:false,activationAllowed:false,target:name,file,start:plan.start,end:plan.end,sha256:verified.sha256};
 }
}
export function stageWbRadio(name,options,approve,progress,usb=navigator.usb){
 return withWbDfu(name,usb,(s,d)=>s.stage(name,d,options,approve,progress),'radio-stage');
}
