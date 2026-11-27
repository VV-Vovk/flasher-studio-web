// Nordic nRF52 PS: FICR, NVMC, BPROT/ACL. Standalone image at address zero.
// Explicit page erase only with a byte-exact backup of all touched pages.
// No mass erase, UICR writes, CTRL-AP recovery or security changes.
import {openDapUsbLink,openDapHidLink} from './cmsis-dap.js';
import {parseHex} from './programmers.js';
const F=0x10000000,N=0x4001e000,DHCSR=0xe000edf0,CPUID=0xe000ed00;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const eq=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
export const NRF_SWD=Object.freeze({
 nRF52805:Object.freeze({part:0x52805,variants:[[192,24]],protection:'bprot'}),
 nRF52810:Object.freeze({part:0x52810,variants:[[192,24]],protection:'bprot'}),
 nRF52811:Object.freeze({part:0x52811,variants:[[192,24]],protection:'bprot'}),
 nRF52820:Object.freeze({part:0x52820,variants:[[256,32]],protection:'acl'}),
 nRF52833:Object.freeze({part:0x52833,variants:[[512,128]],protection:'acl'}),
 nRF52832:Object.freeze({part:0x52832,variants:[[256,32],[512,64]],protection:'bprot'}),
 nRF52840:Object.freeze({part:0x52840,variants:[[1024,256]],protection:'acl'})
});
export function nrfGeometry(chip,info){
 const p=NRF_SWD[chip];
 if(!p||info.part!==p.part||info.page!==4096||!p.variants.some(([f,r])=>f===info.flashKiB&&r===info.ramKiB)||info.pages*info.page!==info.flashKiB*1024||((info.cpuid>>>4)&0xfff)!==0xc24)throw Error('nRF: FICR/core/geometry mismatch');
 if(!Array.isArray(info.uid)||info.uid.length!==2||!info.uid.every(v=>Number.isInteger(v)&&v>=0&&v<=0xffffffff)||info.uid.every(v=>v===0)||info.uid.every(v=>v===0xffffffff))throw Error('nRF: invalid DEVICEID');
 return Object.freeze({chip,flash:info.flashKiB*1024,ram:info.ramKiB*1024,page:info.page,uid:info.uid.map(v=>v.toString(16).padStart(8,'0')).join('')});
}
export function nrfImage(ranges,p){
 if(!Array.isArray(ranges)||!ranges.length||ranges[0].address!==0)throw Error('nRF: standalone image must begin at zero');
 let end=0;
 for(const r of ranges){if(!(r.data instanceof Uint8Array)||!r.data.length||!Number.isInteger(r.address)||r.address!==end||r.address+r.data.length>p.flash)throw Error('nRF: contiguous code Flash only; UICR and sparse HEX rejected');end+=r.data.length;}
 if(end<8)throw Error('nRF: vector table missing');
 const b=new Uint8Array(Math.ceil(end/p.page)*p.page).fill(255);for(const r of ranges)b.set(r.data,r.address);
 const v=new DataView(b.buffer),sp=v.getUint32(0,true),pc=v.getUint32(4,true);
 if(sp<=0x20000000||sp>0x20000000+p.ram||sp%8||!(pc&1)||(pc&~1)>=end||(pc&~1)<8)throw Error('nRF: invalid application vectors');
 return {bytes:b,used:end,pages:b.length/p.page};
}
export class NrfSwd{
 #used=false;
 constructor(link,chip){this.link=link;this.chip=chip;}
 async info(){const r=a=>this.link.readWord(a);return nrfGeometry(this.chip,{part:await r(F+0x100),page:await r(F+0x10),pages:await r(F+0x14),ramKiB:await r(F+0x10c),flashKiB:await r(F+0x110),uid:[await r(F+0x60),await r(F+0x64)],cpuid:await r(CPUID)});}
 async read(a,n){const b=new Uint8Array(n),v=new DataView(b.buffer);for(let i=0;i<n;i+=4)v.setUint32(i,await this.link.readWord(a+i),true);return b;}
 async ready(){const end=Date.now()+2000;while(await this.link.readWord(N+0x400)!==1){if(Date.now()>end)throw Error('nRF NVMC timeout');await wait(5);}}
 async halted(){const dh=await this.link.readWord(DHCSR);if(!(dh&0x20000)||(dh&0x02000000))throw Error('nRF core not halted or reset detected');}
 async guard(p){const a=await this.info();if(JSON.stringify(a)!==JSON.stringify(p))throw Error('nRF identity changed');const r=x=>this.link.readWord(x);
  await this.halted();
  if(NRF_SWD[this.chip].protection==='bprot'){for(const off of (p.flash>256*1024?[0x600,0x604,0x610,0x614]:[0x600,0x604]))if(await r(0x40000000+off)!==0)throw Error('nRF BPROT active');}
  else {for(let i=0;i<8;i++){const base=N+0x800+i*0x10;if(await r(base)!==0||await r(base+4)!==0||await r(base+8)!==0)throw Error('nRF ACL configured');}}
 }
 async backup(ranges,approve,progress=()=>{}){
  if(this.#used)throw Error('nRF session already used');this.#used=true;
  const p=await this.info(),plan=nrfImage(ranges,p);
  if(typeof approve!=='function'||await approve({...p,pages:plan.pages,bytes:plan.bytes.length})!==true)return {cancelled:true};
  if(JSON.stringify(await this.info())!==JSON.stringify(p))throw Error('nRF identity changed');
  await this.link.writeWord(DHCSR,0xa05f0003);await this.link.readWord(DHCSR);
  await this.guard(p);await this.ready();
  if(await this.link.readWord(N+0x504)!==0)throw Error('nRF NVMC is not read-only');
  const bytes=new Uint8Array(plan.bytes.length);
  for(let a=0;a<bytes.length;a+=p.page){await this.guard(p);bytes.set(await this.read(a,p.page),a);progress(.5*(a+p.page)/bytes.length);}
  for(let a=0;a<bytes.length;a+=p.page){await this.guard(p);if(!eq(await this.read(a,p.page),bytes.slice(a,a+p.page)))throw Error('nRF backup changed');progress(.5+.5*(a+p.page)/bytes.length);}
  await this.guard(p);return {...p,bytes};
 }
 async program(ranges,approve,progress=()=>{},options={}){
  if(this.#used)throw Error('nRF programming session already used');this.#used=true;
  const p=await this.info(),plan=nrfImage(ranges,p);
  const erase=options.erase===true,saved=options.backup instanceof Uint8Array?options.backup.slice():null;
  if(erase&&(!saved||saved.length!==plan.bytes.length||typeof options.confirmErase!=='function'))throw Error('nRF exact backup of affected pages and separate erase approval required');
  if(typeof approve!=='function'||await approve({...p,pages:plan.pages,bytes:plan.used,blankOnly:!erase})!==true)return {cancelled:true};
  if(JSON.stringify(await this.info())!==JSON.stringify(p))throw Error('nRF identity changed');
  // Halt only after confirmation; clear sticky reset state by reading DHCSR.
  await this.link.writeWord(DHCSR,0xa05f0003);await this.link.readWord(DHCSR);
  await this.guard(p);await this.ready();
  if(await this.link.readWord(N+0x504)!==0)throw Error('nRF NVMC is not read-only');
  // Full preflight before modifying any page; no implicit erase.
  let dirty=0;
  for(let a=0;a<plan.bytes.length;a+=p.page){
   await this.guard(p);const old=await this.read(a,p.page);
   if(erase&&!eq(old,saved.slice(a,a+p.page)))throw Error('nRF backup differs from target');
   if(old.some(v=>v!==255)){if(!erase)throw Error('nRF page is not blank; no erase performed');if(!eq(old,plan.bytes.slice(a,a+p.page)))dirty++;}
   progress(.25*(a+p.page)/plan.bytes.length);
  }
  if(dirty&&await options.confirmErase({...p,dirtyPages:dirty,totalPages:plan.pages,end:plan.bytes.length})!==true)return {cancelled:true};
  const v=new DataView(plan.bytes.buffer);
  try{
   for(let a=0;a<plan.bytes.length;a+=p.page){
    await this.guard(p);
    const old=await this.read(a,p.page),expected=plan.bytes.slice(a,a+p.page);
    if(erase&&!eq(old,saved.slice(a,a+p.page)))throw Error('nRF backup differs before page write');
    if(eq(old,expected)){progress(.25+.75*(a+p.page)/plan.bytes.length);continue;}
    if(old.some(v=>v!==255)){
     if(!erase)throw Error('nRF page changed');
     await this.halted();await this.link.writeWord(N+0x504,2);await this.ready();
     if(await this.link.readWord(N+0x504)!==2)throw Error('nRF erase mode refused');
     await this.halted();await this.link.writeWord(N+0x508,a);await this.ready();await this.halted();
     await this.link.writeWord(N+0x504,0);await this.ready();
     if(await this.link.readWord(N+0x504)!==0)throw Error('nRF NVMC relock failed');
     if((await this.read(a,p.page)).some(v=>v!==255))throw Error('nRF page erase verification failed');
    }
    await this.halted();await this.link.writeWord(N+0x504,1);await this.ready();
    if(await this.link.readWord(N+0x504)!==1)throw Error('nRF write mode refused');
    for(let i=a;i<a+p.page;i+=4){const w=v.getUint32(i,true);if(w!==0xffffffff){await this.halted();await this.link.writeWord(i,w);await this.ready();await this.halted();}}
    await this.link.writeWord(N+0x504,0);await this.ready();
    if(await this.link.readWord(N+0x504)!==0)throw Error('nRF NVMC relock failed');
    if(!eq(await this.read(a,p.page),plan.bytes.slice(a,a+p.page)))throw Error('nRF page readback mismatch');
    progress(.25+.75*(a+p.page)/plan.bytes.length);
   }
   for(let a=0;a<plan.bytes.length;a+=p.page){await this.guard(p);if(!eq(await this.read(a,p.page),plan.bytes.slice(a,a+p.page)))throw Error('nRF final readback mismatch');}
   await this.guard(p);return {verified:true,bytes:plan.used,pages:plan.pages,erasedPages:dirty,uid:p.uid,executionVerified:false};
  }finally{if(JSON.stringify(await this.info())!==JSON.stringify(p))throw Error('nRF identity changed; cannot safely restore NVMC');await this.link.writeWord(N+0x504,0);await this.ready();if(await this.link.readWord(N+0x504)!==0)throw Error('nRF NVMC read-only restoration failed');}
 }
}
export async function withNrfSwd(chip,fn,usb=navigator.usb,hid=null){
 if(!Object.hasOwn(NRF_SWD,chip))throw Error('nRF SWD target unsupported');
 const link=hid?await openDapHidLink(hid):await openDapUsbLink(usb);
 try{return await fn(new NrfSwd(link,chip));}finally{await link.close();}
}
export function probeNrf(chip,usb=navigator.usb,hid=null){return withNrfSwd(chip,s=>s.info(),usb,hid);}
export function programNrfHex(chip,hex,approve,progress,usb=navigator.usb,options={},hid=null){const ranges=parseHex(hex);return withNrfSwd(chip,s=>s.program(ranges,approve,progress,options),usb,hid);}
export function backupNrfHex(chip,hex,approve,progress,usb=navigator.usb,hid=null){const ranges=parseHex(hex);return withNrfSwd(chip,s=>s.backup(ranges,approve,progress),usb,hid);}

