// Experimental ROM DFU planning for STM32WB. No USB I/O or activation.
 // AN2606 rev 71 sections 84/85; AN3156; RM0434. The caller must obtain a
 // trustworthy current security snapshot from the same device/session.
 // A descriptor or user-entered size is never a substitute for SFSA.
import {wbProfile,wbFlashLayout} from './stm32-wb.js';
import {validateStmVector} from './programmers.js';
import {dfuGeometry} from './extra-programmers.js';
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
