// Experimental ROM DFU planning and bounded USB I/O for STM32WB.
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
 let outcome;
 try{
  await d.open();if(!d.configuration)await d.selectConfiguration(1);
  const c=[];for(const i of d.configuration.interfaces)for(const a of i.alternates)if(a.interfaceClass===0xfe&&a.interfaceSubclass===1&&a.interfaceProtocol===2&&/^@Internal Flash/i.test(a.interfaceName||''))c.push({i,a});
  if(c.length!==1)throw Error('WB DFU ambiguous internal Flash');
  const {i,a}=c[0],pages=dfuGeometry(a.interfaceName);
  await d.claimInterface(i.interfaceNumber);await d.selectAlternateInterface(i.interfaceNumber,a.alternateSetting);
  const S=mode==='application'?WbDfuApplication:mode==='radio-start'?WbDfuRadioStart:mode==='radio-stage'?WbDfuRadioStage:mode==='radio-delete'?WbDfuRadioDelete:mode==='radio-enter'?WbDfuRadioEnter:WbDfuReadOnly;outcome=await fn(new S(d,i.interfaceNumber,wbProfile(name),pages),a.interfaceName);return outcome;
 }finally{if(d.opened)try{await d.close();}catch(e){if((mode==='radio-stage'||mode==='radio-delete'||mode==='radio-enter')&&outcome)outcome.cleanupWarning='USB close failed; reconnect manually: '+e.message;else throw e;}}
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
export function wbRadioWriteCandidate(name){return wbRomDfuCandidate(name)&&[262144,524288,655360,1048576].includes(wbProfile(name)?.flash);}
export function wbRadioStagingPlan(name,file,applicationEnd,snapshot,descriptor,radio,acknowledge,directImage=null){
 const p=wbProfile(name);
 if(!wbRadioWriteCandidate(name))throw Error('WB radio staging: only reviewed WB35/WB55 USB targets');
 if(!radio?.fus||radio.lastFusState!==0||radio.lastWirelessState!==0||(!directImage&&(radio.wireless!==null||radio.stackType!==0)))throw Error('WB radio staging requires idle FUS and no installed wireless stack (unless direct update)');
 const currentFus=[radio.fus.major,radio.fus.minor,radio.fus.patch].join('.');
 const plan=radioUpdateRequirements({target:name,currentFus,name:file,applicationEnd,acknowledge});
 const option=radioOptions(name).find(e=>e.name===file);
 let start=Number(plan.installAddress),end=Number(plan.stagingEnd),footer=null;
 if(!snapshot||!['sfr','optr','srrvr'].every(k=>uint32(snapshot[k]))||
 !Array.isArray(snapshot.wrp)||snapshot.wrp.length!==2||!snapshot.wrp.every(uint32)||
 !Array.isArray(snapshot.pcrop)||snapshot.pcrop.length!==2||!snapshot.pcrop.every(x=>Array.isArray(x)&&x.length===2&&x.every(uint32)))throw Error('WB staging requires complete live security state');
 const {limit}=wbFlashLayout(p,snapshot.sfr,snapshot.optr,snapshot.srrvr);
 if(directImage){
  if(plan.kind!=='wireless'||!radio.wireless||!radio.stackType||currentFus!=='2.2.0')throw Error('WB direct upgrade requires FUS 2.2.0 and installed wireless stack');
  const old=versionString(radio.wireless),oldParts=old.split('.').map(Number),newParts=plan.version.split('.').map(Number);
  const cmp=newParts.findIndex((v,i)=>v!==oldParts[i]);
  if(cmp<0||newParts[cmp]<oldParts[cmp])throw Error('WB direct upgrade requires strictly newer version; same-version or downgrade use separate deletion');
  footer=wbWirelessFooter(directImage,plan.version);
  if(footer.format!==2||!option.fus2)throw Error('WB direct upgrade requires new-format FUSv2 stack');
  start=wbDirectAddress(p,limit,directImage.length,footer.nvmPages);
  end=start+Math.ceil(directImage.length/p.pageSize)*p.pageSize;
  if(start<applicationEnd)throw Error('WB direct upgrade overlaps CPU1');
 }
 if(start<BASE||start>=end||end>BASE+limit||start%p.pageSize||end%p.pageSize)throw Error('WB staging crosses live SFSA');
 const overlaps=(a,z,unit)=>a<=z&&BASE+a*unit<end&&BASE+(z+1)*unit>start;
 for(const v of snapshot.wrp)if(overlaps(v&p.wrpMask,(v>>>16)&p.wrpMask,p.pageSize))throw Error('WB staging WRP overlap');
 for(const [a,z] of snapshot.pcrop)if(overlaps(a&p.pcropMask,z&p.pcropMask,p.pageSize/2))throw Error('WB staging PCROP overlap');
 const pages=dfuGeometry(descriptor),total=pages.reduce((n,x)=>n+x.size,0);
 if(![limit,p.flash].includes(total)||pages.some((x,i)=>x.size!==p.pageSize||x.address!==BASE+i*p.pageSize))throw Error('WB staging descriptor mismatch');
 return Object.freeze({...plan,start,end,size:option.size,limit,pageSize:p.pageSize,direct:!!directImage,footer});
}
export class WbDfuRadioStage extends WbDfuReadOnly{
 #allowed=null;#used=false;#query=false;#upgrade=false;
 async pointer(a){if(this.#query&&a===0xffff0054)return StmDfu.prototype.pointer.call(this,a);return super.pointer(a);}
 async output(req,b=new Uint8Array(),value=0){
  if(req===1&&value===0&&(this.#upgrade&&b.length===1&&b[0]===0x53||this.#query&&b.length===5&&b[0]===0x21&&new DataView(b.buffer,b.byteOffset+1,4).getUint32(0,true)===0xffff0054))return StmDfu.prototype.output.call(this,req,b,value);
  if(this.#allowed&&req===1&&value===2&&equal(b,this.#allowed))return StmDfu.prototype.output.call(this,req,b,value);
  return super.output(req,b,value);
 }
 async #write(data){
  if(this.#allowed)throw Error('WB staging concurrent write');
  this.#allowed=data.slice();
  try{await this.download(2,this.#allowed);}finally{this.#allowed=null;}
 }
 async stage(name,descriptor,{file,bytes,applicationEnd,acknowledge,backup=null,direct=false},approve,progress=()=>{},activate=null){
  if(this.#used)throw Error('WB staging session already used');
  this.#used=true;
  if(activate!==null&&(typeof activate!=='function'||(applicationEnd!==BASE&&(!(backup instanceof Uint8Array)||backup.length!==applicationEnd-BASE))))throw Error('WB upgrade requires a blank CPU1 area or an exact CPU1 backup and separate activation approval');
  if(direct&&(!activate||applicationEnd<BASE))throw Error('WB direct upgrade requires separate activation');
  if(!wbRomDfuCandidate(name)||this.pr!==wbProfile(name)||!(bytes instanceof Uint8Array)||typeof approve!=='function')throw Error('WB staging target / confirmation');
  const data=bytes.slice(),id=await this.identify(),snapshot=await wbDfuSnapshot(this),radio=await readWbRadioInfo(this);
  const saved=backup instanceof Uint8Array?backup.slice():null;
  const plan=wbRadioStagingPlan(name,file,applicationEnd,snapshot,descriptor,radio,acknowledge,direct?data:null);
  const verified=await planRadioUpdate({target:name,currentFus:plan.fromFus,name:file,bytes:data,applicationEnd,acknowledge});
  if(data.length!==plan.size||data.length%4||(!direct&&verified.installAddress!==plan.installAddress))throw Error('WB staging file / plan mismatch');
  const check=async()=>{
   if(await this.identify()!==id||JSON.stringify(await wbDfuSnapshot(this))!==JSON.stringify(snapshot)||JSON.stringify(await readWbRadioInfo(this))!==JSON.stringify(radio))throw Error('WB staging identity/security/radio changed');
   const reg=async a=>{const b=await this.read(a,4);if(b.length!==4)throw Error('WB staging short status');return new DataView(b.buffer,b.byteOffset,b.byteLength).getUint32(0,true);};
   if((await reg(0x58004010))&0x000de3fa||(await reg(0x58004060))&0x000d0000||(await reg(0x58004064))&0x00050007)throw Error('WB staging flash busy/error');
  };
  const blank=async(a,n)=>{const b=await this.read(a,n);if(b.length!==n||b.some(v=>v!==255))throw Error('WB staging range is not blank; no erase or retry');};
  if(await approve({target:name,file,version:plan.version,start:plan.start,end:plan.end,sha256:verified.sha256,stageOnly:true})!==true)return {cancelled:true};
  await check();
  const span=plan.end-plan.start;
  const expectedBlock=i=>{const b=new Uint8Array(256).fill(255);b.set(data.slice(i,i+256));return b;};
  const preserveBytes=activate?applicationEnd-BASE:0;
  if(activate&&snapshot.pcrop.some(([a,z])=>(a&this.pr.pcropMask)<=(z&this.pr.pcropMask)&&(a&this.pr.pcropMask)*this.pr.pageSize/2<plan.limit))throw Error('WB activation scan intersects PCROP');
  const preserveSha=preserveBytes?await wbDigest(saved):null;
  const scanOutside=async()=>{
   for(let a=BASE;a<BASE+plan.limit;a+=256){
    if(a<BASE+preserveBytes){if(!equal(saved.slice(a-BASE,a-BASE+256),await this.read(a,256)))throw Error('WB CPU1 backup differs from target');}
    else if(a<plan.start||a>=plan.end)await blank(a,256);
   }
  };
  // FUS_FW_UPGRADE scans for an image without an explicit address. Initially
  // enable it only for a completely blank nonsecure region apart from this
  // exact reviewed image. No application/NVM relocation is promised.
  // Resume only from a byte-for-byte identical previous stage; never from
  // a partial image and never by erasing it.
  let resume=false;
  if(activate){
   await scanOutside();
   let allBlank=true,allExact=true;
   for(let i=0;i<span;i+=256){
    const b=await this.read(plan.start+i,256);
    allBlank&&=b.length===256&&b.every(x=>x===255);
    allExact&&=equal(b,expectedBlock(i));
   }
   if(!allBlank&&!allExact)throw Error('WB staging range is neither blank nor an exact verified prior stage');
   resume=allExact&&!allBlank;
   progress(.2);
  }else for(let i=0;i<span;i+=256){await blank(plan.start+i,256);progress(.2*(i+256)/span);}
  for(let page=0;!resume&&page<span;page+=plan.pageSize){
   await check();
   for(let j=0;j<plan.pageSize;j+=256)await blank(plan.start+page+j,256);
   for(let j=0;j<plan.pageSize&&page+j<data.length;j+=256){
    const i=page+j,raw=data.slice(i,i+256),pad=new Uint8Array(Math.ceil(raw.length/8)*8).fill(255);pad.set(raw);
    if(pad.some(x=>x!==255)){await this.pointer(plan.start+i);await this.#write(pad);}
    progress(.2+.6*(i+raw.length)/data.length);
   }
  }
  for(let i=0;i<span;i+=256){
   if(!equal(expectedBlock(i),await this.read(plan.start+i,256)))throw Error('WB staging readback mismatch');
   progress(.8+.2*(i+256)/span);
  }
  await check();
  const result={staged:true,verified:true,installed:false,activationAllowed:false,target:name,file,start:plan.start,end:plan.end,sha256:verified.sha256};
  if(!activate)return result;
  const pending={...result,uid:id,expectedVersion:plan.version,kind:plan.kind,resumed:resume,commandAttempted:false,preserveBytes,preserveSha,direct:plan.direct,previousVersion:versionString(radio.wireless),previousFus:versionString(radio.fus)};
  if(await activate({...pending,blankCpu1:preserveBytes===0})!==true)return {...pending,activationCancelled:true};
  // Separate approval is not permission to write a changed device or image.
  try{
   await check();await scanOutside();
   for(let i=0;i<span;i+=256)if(!equal(expectedBlock(i),await this.read(plan.start+i,256)))throw Error('WB staged image changed before activation');
   await check();
   this.#query=true;
   let state;try{state=await this.read(0xffff0054,2);}finally{this.#query=false;}
   if(state.length!==2||state[0]!==0||state[1]!==0)throw Error('WB FUS not idle / error; upgrade blocked');
   await this.idle();
  }catch(e){return {...pending,activationBlocked:true,reason:e.message};}
  this.#upgrade=true;
  try{
   await this.download(0,Uint8Array.of(0x53));
   return {...pending,commandAttempted:true,commandAccepted:true};
  }catch(e){
   // A system reset/disconnect is normal during FUS work; it does not prove
   // either success or failure. Never resend 0x53 automatically.
   return {...pending,commandAttempted:true,outcomeUnknown:true,reason:e.message};
  }finally{this.#upgrade=false;}
 }
}
export function stageWbRadio(name,options,approve,progress,usb=navigator.usb){
 return withWbDfu(name,usb,(s,d)=>s.stage(name,d,options,approve,progress),'radio-stage');
}

// AN5185 rev15 tables 24/25. Experimental, first installation on blank CPU1
// only; no automatic polling, deletion, security changes or command retry.
export function installWbRadioBlank(name,options,approve,activate,progress,usb=navigator.usb){
 if(typeof activate!=='function')throw Error('WB upgrade requires separate activation approval');
 return withWbDfu(name,usb,(s,d)=>s.stage(name,d,options,approve,progress,activate),'radio-stage');
}
export function verifyWbRadioAfterUpgrade(name,pending,usb=navigator.usb){
 if(!pending?.commandAttempted||pending.target!==name||typeof pending.uid!=='string')throw Error('WB previous upgrade request required');
 const entry=radioOptions(name).find(e=>e.name===pending.file);
 if(!entry||entry.version!==pending.expectedVersion||entry.kind!==pending.kind||!['fus','wireless'].includes(entry.kind))throw Error('WB upgrade expectation mismatch');
 return withWbDfu(name,usb,async(s,d)=>{
  if(await s.identify()!==pending.uid)throw Error('WB different device after upgrade');
  const info=await inspectWbDfu(s,name,d);
  if(await s.identify()!==pending.uid||!info.radio)throw Error('WB radio info unavailable after upgrade');
  const v=entry.kind==='fus'?info.radio.fus:info.radio.wireless;
  const reportedVersion=v?[v.major,v.minor,v.patch].join('.'):null;
  const versionMatched=reportedVersion===entry.version&&(entry.kind==='fus'||!!info.radio.stackType);
  const settled=entry.kind==='fus'?info.radio.lastFusState===0||info.radio.lastFusState===4:info.radio.lastFusState===4&&info.radio.lastWirelessState===1||info.radio.lastFusState===0&&info.radio.lastWirelessState===0;
  let cpu1Verified=null;
  if(pending.preserveBytes){
   if(!Number.isInteger(pending.preserveBytes)||pending.preserveBytes<0||pending.preserveBytes%info.pageBytes||pending.preserveBytes>info.appKiB*1024||!/^[a-f0-9]{64}$/.test(pending.preserveSha||''))cpu1Verified=false;
   else cpu1Verified=await wbDigest(await wbReadRange(s,pending.preserveBytes))===pending.preserveSha;
  }
  const finalInfo=await inspectWbDfu(s,name,d);
  if(await s.identify()!==pending.uid||JSON.stringify(finalInfo)!==JSON.stringify(info))throw Error('WB state changed during verification');
  return {versionMatched,completed:versionMatched&&settled&&cpu1Verified!==false,cpu1Verified,reportedVersion,expectedVersion:entry.version,appKiB:info.appKiB,radio:info.radio,reportedOnly:true};
 });
}

// AN5185 rev15, sections 1.3, 2.2, 7.2 and tables 9, 15, 16, 24/25.
// Separate deletion session, never automatically chained to an installation.
// The first implementation supports an already idle FUS only. It never uses
// the two GET_STATE commands that intentionally switch a running stack to FUS.
function versionString(v){return v?[v.major,v.minor,v.patch].join('.'):null;}
export function wbFusReply(b){
 if(!(b instanceof Uint8Array)||b.length!==2)throw Error('WB FUS response length');
 const [state,error]=b;
 const phase=state===0&&error===0?'idle':error===0xfe?'not-running':error!==0?'error':state>=0x10&&state<=0x3f?'busy':'unknown';
 return {state,error,phase};
}
export function wbDeleteCompletion(pending,radio,reply,appKiB){
 if(pending?.kind!=='delete'||!pending.commandAttempted||!radio?.fus||!Number.isInteger(appKiB))throw Error('WB deletion verification input');
 const noStack=radio.wireless===null&&radio.stackType===0;
 const completed=reply.phase==='idle'&&noStack&&radio.lastFusState===0&&radio.lastWirelessState===0&&versionString(radio.fus)===pending.expectedVersion&&appKiB>=pending.oldAppKiB;
 return {completed,noStack,reply,appKiB,reportedVersion:versionString(radio.fus),reportedOnly:true};
}
export class WbDfuRadioDelete extends WbDfuReadOnly{
 #query=false;#delete=false;#used=false;
 async pointer(a){if(this.#query&&a===0xffff0054)return StmDfu.prototype.pointer.call(this,a);return super.pointer(a);}
 async output(req,b=new Uint8Array(),value=0){
  if(req===1&&value===0&&(this.#delete&&b.length===1&&b[0]===0x52||this.#query&&b.length===5&&b[0]===0x21&&new DataView(b.buffer,b.byteOffset+1,4).getUint32(0,true)===0xffff0054))return StmDfu.prototype.output.call(this,req,b,value);
  return super.output(req,b,value);
 }
 async #state(){this.#query=true;try{return wbFusReply(await this.read(0xffff0054,2));}finally{this.#query=false;}}
 async #check(name,descriptor){
  if(!wbRadioWriteCandidate(name)||this.pr!==wbProfile(name))throw Error('WB deletion target unsupported');
  const id=await this.identify(),snapshot=await wbDfuSnapshot(this),info=await inspectWbDfu(this,name,descriptor);
  if(!info.radio||await this.identify()!==id||JSON.stringify(await wbDfuSnapshot(this))!==JSON.stringify(snapshot))throw Error('WB deletion identity/security/radio unavailable');
  return {id,snapshot,info};
 }
 async deleteInstalled(name,descriptor,{file,bytes,acknowledge},approve){
  if(this.#used)throw Error('WB deletion session already used');
  this.#used=true;
  if(typeof approve!=='function'||!(bytes instanceof Uint8Array))throw Error('WB deletion needs verified replacement and approval');
  const data=bytes.slice(),before=await this.#check(name,descriptor),radio=before.info.radio;
  if(!radio.wireless||!radio.stackType||radio.lastFusState!==0||radio.lastWirelessState!==0)throw Error('WB installed stack with idle FUS required; use CubeProgrammer to switch to FUS first');
  // Require a genuine replacement, valid for this density and current FUS,
  // before making the old stack unavailable. Recalculate placement after delete.
  const currentFus=versionString(radio.fus);
  const plan=await planRadioUpdate({target:name,currentFus,name:file,bytes:data,applicationEnd:BASE,acknowledge});
  if(plan.kind!=='wireless')throw Error('WB delete requires a wireless replacement BIN');
  const pending={kind:'delete',target:name,uid:before.id,file,sha256:plan.sha256,expectedVersion:currentFus,oldVersion:versionString(radio.wireless),oldType:radio.stackType,oldAppKiB:before.info.appKiB,commandAttempted:false};
  if(await approve({...pending})!==true)return {cancelled:true};
  const again=await this.#check(name,descriptor);
  if(JSON.stringify(again)!==JSON.stringify(before))return {...pending,activationBlocked:true,reason:'WB identity/security/radio changed'};
  let reply;
  try{reply=await this.#state();await this.idle();}catch(e){return {...pending,activationBlocked:true,reason:e.message};}
  if(reply.phase!=='idle')return {...pending,activationBlocked:true,reason:'WB FUS not idle: '+reply.phase};
  this.#delete=true;
  try{await this.download(0,Uint8Array.of(0x52));return {...pending,commandAttempted:true,commandAccepted:true};}
  catch(e){return {...pending,commandAttempted:true,outcomeUnknown:true,reason:e.message};}
  finally{this.#delete=false;}
 }
 async verifyDelete(name,descriptor,pending){
  if(this.#used)throw Error('WB deletion verification session already used');
  this.#used=true;
  if(pending?.target!==name||pending.kind!=='delete'||pending.commandAttempted!==true||typeof pending.uid!=='string')throw Error('WB previous deletion required');
  const before=await this.#check(name,descriptor);
  if(before.id!==pending.uid)throw Error('WB different device after deletion');
  const radio=before.info.radio;
  // Never send a query to a known running wireless stack. A repeated query
  // would switch CPU2 back into FUS. Report that official inspection is needed.
  if(radio.lastFusState===4||radio.lastWirelessState===1)return {completed:false,reply:{phase:'not-running'},reportedOnly:true,appKiB:before.info.appKiB};
  const reply=await this.#state();
  if(reply.phase!=='idle')return {completed:false,reply,reportedOnly:true,appKiB:before.info.appKiB};
  const after=await this.#check(name,descriptor);
  if(after.id!==pending.uid)throw Error('WB different device after deletion query');
  return wbDeleteCompletion(pending,after.info.radio,reply,after.info.appKiB);
 }
}
export function deleteWbWireless(name,options,approve,usb=navigator.usb){
 return withWbDfu(name,usb,(s,d)=>s.deleteInstalled(name,d,options,approve),'radio-delete');
}
export function verifyWbWirelessDeleted(name,pending,usb=navigator.usb){
 return withWbDfu(name,usb,(s,d)=>s.verifyDelete(name,d,pending),'radio-delete');
}

// AN5185 rev15 tables 17–20. Only parse the footer directly preceding the
// ST signature, rather than searching arbitrary magic values in the image.
export function wbWirelessFooter(b,expected){
 if(!(b instanceof Uint8Array)||b.length<44||b.length%4)throw Error('WB wireless footer length');
 const v=new DataView(b.buffer,b.byteOffset,b.byteLength),g=o=>v.getUint32(o,true),tag=b.length-20;
 if(g(tag+16)!==0xd3a12c5e)throw Error('WB ST signature footer not found');
 const sm=g(tag+8),size=sm&255;
 if((sm>>>8&255)!==0||!size||size%4||tag-size<20)throw Error('WB ST signature footer invalid');
 const body=tag-size-20,m=g(body+8),kind=m>>>8&255,magic=g(body+16),ver=g(body+12);
 const version=[ver>>>24,ver>>>16&255,ver>>>8&255].join('.');
 if(version!==expected||!(kind===2&&magic===0xb10c8b99||kind===255&&magic===0x23372991))throw Error('WB wireless footer type/version mismatch');
 const nvmPages=kind===2?g(body)>>>8&255:0;
 if(kind===2&&!nvmPages)throw Error('WB NVM size unavailable');
 return {format:kind===2?2:1,nvmPages,version,flashPages:m&255};
}
export function wbDirectAddress(p,limit,bytes,nvmPages){
 if(!Number.isInteger(bytes)||bytes<4||bytes%4||!Number.isInteger(nvmPages)||nvmPages<1||nvmPages>255||!Number.isInteger(limit)||limit<=0||limit>p.flash)throw Error('WB direct placement parameters');
 const start=BASE+Math.floor((limit-bytes-nvmPages*p.pageSize)/p.pageSize)*p.pageSize;
 if(start<BASE||start>=BASE+limit)throw Error('WB direct placement has insufficient free Flash');
 return start;
}
async function wbDigest(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');}
async function wbReadRange(s,bytes,progress=()=>{}){
 if(!Number.isInteger(bytes)||bytes<0||bytes>s.pr.flash||bytes%256)throw Error('WB backup range');
 const data=new Uint8Array(bytes);
 for(let i=0;i<bytes;i+=256){const b=await s.read(BASE+i,256);if(b.length!==256)throw Error('WB backup short read');data.set(b,i);progress((i+256)/bytes);}
 return data;
}
export async function readWbCpu1Backup(s,name,descriptor,bytes,progress=()=>{}){
 const id=await s.identify(),snapshot=await wbDfuSnapshot(s),info=await inspectWbDfu(s,name,descriptor);
 if(!Number.isInteger(bytes)||bytes<=0||bytes%info.pageBytes||bytes>info.appKiB*1024)throw Error('WB backup exceeds live SFSA or page alignment');
 for(const [a,z] of snapshot.pcrop){const first=a&s.pr.pcropMask,last=z&s.pr.pcropMask;if(first<=last&&first*s.pr.pageSize/2<bytes)throw Error('WB backup intersects PCROP');}
 const data=await wbReadRange(s,bytes,p=>progress(p/2));
 const again=await wbReadRange(s,bytes,p=>progress(.5+p/2));
 if(!equal(data,again)||await s.identify()!==id||JSON.stringify(await wbDfuSnapshot(s))!==JSON.stringify(snapshot))throw Error('WB backup changed while reading');
 return {target:name,uid:id,data,sha256:await wbDigest(data),bytes,appKiB:info.appKiB};
}
export function backupWbCpu1(name,bytes,progress,usb=navigator.usb){return withWbDfu(name,usb,(s,d)=>readWbCpu1Backup(s,name,d,bytes,progress));}
export function installWbRadioPreserve(name,options,approve,activate,progress,usb=navigator.usb){
 if(typeof activate!=='function')throw Error('WB upgrade requires activation approval');
 return withWbDfu(name,usb,(s,d)=>s.stage(name,d,options,approve,progress,activate),'radio-stage');
}
// AN5185 §1.3: exactly two consecutive GET_STATE requests, second only
// after the first explicitly reports NOT_RUNNING. Never loop automatically.
export class WbDfuRadioEnter extends WbDfuReadOnly{
 #query=false;#used=false;
 async pointer(a){if(this.#query&&a===0xffff0054)return StmDfu.prototype.pointer.call(this,a);return super.pointer(a);}
 async output(req,b=new Uint8Array(),value=0){
  if(this.#query&&req===1&&value===0&&b.length===5&&b[0]===0x21&&new DataView(b.buffer,b.byteOffset+1,4).getUint32(0,true)===0xffff0054)return StmDfu.prototype.output.call(this,req,b,value);
  return super.output(req,b,value);
 }
 async #state(){this.#query=true;try{return wbFusReply(await this.read(0xffff0054,2));}finally{this.#query=false;}}
 async enter(name,descriptor,approve){
  if(this.#used)throw Error('WB FUS entry session used');this.#used=true;
  if(typeof approve!=='function')throw Error('WB FUS entry approval required');
  const id=await this.identify(),snap=await wbDfuSnapshot(this),info=await inspectWbDfu(this,name,descriptor);
  if(info.radio?.lastFusState===0&&info.radio?.lastWirelessState===0)return {alreadyIdle:true,reportedOnly:true};
  if(info.radio&&(info.radio.lastFusState!==4||info.radio.lastWirelessState!==1))throw Error('WB FUS busy or state unknown');
  const pending={target:name,uid:id,kind:'enter',file:'FUS_GET_STATE',commandAttempted:false};
  if(await approve({...pending})!==true)return {cancelled:true};
  if(await this.identify()!==id||JSON.stringify(await wbDfuSnapshot(this))!==JSON.stringify(snap))return {...pending,activationBlocked:true};
  const first=await this.#state();
  if(first.phase==='idle')return {...pending,alreadyIdle:true};
  if(first.phase!=='not-running')return {...pending,activationBlocked:true,reply:first};
  // Do not insert a different FUS command between these two queries.
  try{const second=await this.#state();return {...pending,commandAttempted:true,reply:second};}
  catch(e){return {...pending,commandAttempted:true,outcomeUnknown:true,reason:e.message};}
 }
 async verifyEntry(name,descriptor,pending){
  if(this.#used)throw Error('WB FUS entry session used');this.#used=true;
  if(pending?.target!==name||pending.kind!=='enter'||!pending.commandAttempted||await this.identify()!==pending.uid)throw Error('WB FUS entry device mismatch');
  const info=await inspectWbDfu(this,name,descriptor);
  if(!info.radio||info.radio.lastFusState!==0||info.radio.lastWirelessState!==0)return {completed:false,reportedOnly:true};
  const reply=await this.#state();
  return {completed:reply.phase==='idle'&&await this.identify()===pending.uid,reply,reportedOnly:true};
 }
}
export function enterWbFus(name,approve,usb=navigator.usb){return withWbDfu(name,usb,(s,d)=>s.enter(name,d,approve),'radio-enter');}
export function verifyWbFusEntry(name,pending,usb=navigator.usb){return withWbDfu(name,usb,(s,d)=>s.verifyEntry(name,d,pending),'radio-enter');}
