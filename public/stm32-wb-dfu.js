// Experimental ROM DFU planning for STM32WB. No USB I/O or activation.
 // AN2606 rev 71 sections 84/85; AN3156; RM0434. The caller must obtain a
 // trustworthy current security snapshot from the same device/session.
 // A descriptor or user-entered size is never a substitute for SFSA.
import {wbProfile,wbFlashLayout} from './stm32-wb.js';
import {validateStmVector} from './programmers.js';
import {dfuGeometry,StmDfu} from './extra-programmers.js';
const BASE=0x08000000;
function uint32(n){return Number.isInteger(n)&&n>=0&&n<=0xffffffff;}
export function wbRomDfuCandidate(name){
 const n=String(name).trim().toUpperCase().replace(/TR$/,'');
 // WB10/15 ROM has no DFU; module pin routing has not been reviewed.
 return /^STM32WB(?:30|35|50|55)[A-Z][A-Z][A-Z][0-9][A-Z]*$/.test(n)&&!!wbProfile(n);
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
 async output(req,b=new Uint8Array(),value=0){
  if(!(req===6&&value===0&&b.length===0||req===1&&value===0&&b.length===5&&b[0]===0x21))throw Error('WB DFU diagnostic is read-only');
  return super.output(req,b,value);
 }
 async program(){throw Error('WB DFU writing not enabled');}
}
export async function inspectWbDfu(s,name,descriptor){
 if(!wbRomDfuCandidate(name)||s.pr!==wbProfile(name))throw Error('WB DFU target not reviewed');
 const id=await s.identify(),read32=async a=>new DataView((await s.read(a,4)).buffer).getUint32(0,true);
 const F=0x58004000;
 const snapshot={sfr:await read32(F+0x80),optr:await read32(F+0x20),srrvr:await read32(F+0x84),wrp:[await read32(F+0x2c),await read32(F+0x30)],pcrop:[[await read32(F+0x24),await read32(F+0x28)],[await read32(F+0x34),await read32(F+0x38)]]};
 const layout=wbFlashLayout(s.pr,snapshot.sfr,snapshot.optr,snapshot.srrvr);
 const pages=dfuGeometry(descriptor),bytes=pages.reduce((n,x)=>n+x.size,0);
 if(![layout.limit,s.pr.flash].includes(bytes)||pages.some((p,i)=>p.size!==s.pr.pageSize||p.address!==BASE+i*s.pr.pageSize))throw Error('WB DFU descriptor geometry mismatch');
 if(await s.identify()!==id)throw Error('WB DFU device changed');
 return {target:name,flashKiB:s.pr.flash/1024,appKiB:layout.limit/1024,pageBytes:s.pr.pageSize,descriptorKiB:bytes/1024,readOnly:true};
}
export async function probeWbDfu(name,usb=navigator.usb){
 if(!wbRomDfuCandidate(name)||!usb?.requestDevice)throw Error('WB DFU unavailable');
 const d=await usb.requestDevice({filters:[{vendorId:0x0483,productId:0xdf11}]});
 try{
  await d.open();if(!d.configuration)await d.selectConfiguration(1);
  const c=[];for(const i of d.configuration.interfaces)for(const a of i.alternates)if(a.interfaceClass===0xfe&&a.interfaceSubclass===1&&a.interfaceProtocol===2&&/^@Internal Flash/i.test(a.interfaceName||''))c.push({i,a});
  if(c.length!==1)throw Error('WB DFU ambiguous internal Flash');
  const {i,a}=c[0],pages=dfuGeometry(a.interfaceName);
  await d.claimInterface(i.interfaceNumber);await d.selectAlternateInterface(i.interfaceNumber,a.alternateSetting);
  return await inspectWbDfu(new WbDfuReadOnly(d,i.interfaceNumber,wbProfile(name),pages),name,a.interfaceName);
 }finally{if(d.opened)await d.close();}
}
