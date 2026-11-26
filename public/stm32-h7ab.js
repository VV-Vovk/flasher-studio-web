// Independent register-level RM0455 driver. Only H7A3/B3 2 MiB and H7B0
// 128 KiB. 1 MiB H7A3 remains disabled until its conflicting bank map is resolved.
import {validateStmVector} from './programmers.js';
const F=0x52002000,BASE=0x08000000,ID=0x5c001000,CPUID=0xe000ed00,DHCSR=0xe000edf0,CCR=0xe000ed14;
const OPTCR=F+0x18,OPTSR=F+0x1c,BOOT=F+0x40;
const SECTOR=8192,ROW=16,LOCK=1,PG=2,SER=4,START=0x20,EOP=0x10000,ERR=0x17ae0000;
const patterns=["STM32H7A3IIKx","STM32H7A3IIKxQ","STM32H7A3IITx","STM32H7A3IITxQ","STM32H7A3NIHx","STM32H7A3RITx","STM32H7A3VITx","STM32H7A3VITxQ","STM32H7A3VIHx","STM32H7A3VIHxQ","STM32H7A3ZITx","STM32H7A3ZITxQ","STM32H7A3QIYxQ","STM32H7A3LIHxQ","STM32H7A3AIIxQ","STM32H7B3AIIxQ","STM32H7B3LIHxQ","STM32H7B3IIKx","STM32H7B3IIKxQ","STM32H7B3IITx","STM32H7B3IITxQ","STM32H7B3NIHx","STM32H7B3RITx","STM32H7B3VITx","STM32H7B3VITxQ","STM32H7B3VIHx","STM32H7B3VIHxQ","STM32H7B3ZITx","STM32H7B3ZITxQ","STM32H7B3QIYxQ","STM32H7B0RBTx","STM32H7B0VBTx","STM32H7B0ZBTx","STM32H7B0IBTx","STM32H7B0IBKxQ","STM32H7B0ABIxQ"];
const stacks=Object.freeze([Object.freeze([0x20000000,0x20020000]),Object.freeze([0x24000000,0x24100000])]);
export const H7AB_PROFILES=Object.freeze(Object.fromEntries(patterns.map(n=>[n,Object.freeze({controller:'h7ab-sector',pid:0x480,core:0xc27,idReg:ID,uid:0x08fff800,sizeReg:0x08fff80c,flash:n[10]==='B'?131072:2097152,ram:128*1024,stackRegions:stacks,stackAlign:8,wordSize:ROW,sectorSize:SECTOR})])));
export function h7abProfile(name){
 const n=String(name).trim().toUpperCase().replace(/TR$/,'');
 for(const [pattern,p] of Object.entries(H7AB_PROFILES))if(n===pattern.slice(0,11)||new RegExp('^'+pattern.replace('x','[0-9]')+'$').test(n))return p;
 return null;
}
export function h7abBanks(p){
 if(p.flash===131072)return [{base:BASE,size:p.flash,reg:F}];
 if(p.flash===2097152)return [{base:BASE,size:1048576,reg:F},{base:BASE+1048576,size:1048576,reg:F+0x100}];
 throw Error('Unsupported H7A/B bank geometry');
}
export async function identifyH7AB(s){
 const p=s.pr;
 if((await s.reg(ID)&0xfff)!==p.pid)throw Error('STM32H7A/B device ID mismatch');
 if(((await s.reg(CPUID)>>>4)&0xfff)!==p.core)throw Error('STM32H7A/B CPU mismatch');
 const b=await s.read(p.sizeReg,2);
 if(b.length!==2||(b[0]+256*b[1])*1024!==p.flash)throw Error('STM32H7A/B Flash size mismatch');
 const uid=await s.read(p.uid,12);
 if(uid.length!==12||uid.every(x=>x===0)||uid.every(x=>x===255))throw Error('Invalid H7A/B UID');
 return 'stm32-'+Array.from(uid,x=>x.toString(16).padStart(2,'0')).join('');
}
async function idle(s,bank,mask=15){
 const deadline=Date.now()+60000;
 do{const st=await s.reg(bank.reg+0x10);if(!(st&mask))return st;await new Promise(r=>setTimeout(r,3));}while(Date.now()<deadline);
 throw Error('STM32H7A/B Flash busy timeout');
}
async function complete(s,bank){
 const st=await idle(s,bank);
 if(st&ERR||!(st&EOP))throw Error('STM32H7A/B Flash status 0x'+st.toString(16));
 await s.put(bank.reg+0x14,EOP);
}
async function preflight(s,banks){
 const opt=await s.reg(OPTSR),oc=await s.reg(OPTCR);
 if(((opt>>>8)&255)!==0xaa||(opt&0xc0200001)||!(oc&1)||(oc&0x80000002))throw Error('STM32H7A/B protection, bank swap or option activity');
 if((await s.reg(BOOT)&0xffff)!==0x0800)throw Error('STM32H7A/B nonstandard boot address');
 if((await s.reg(CCR))&0x30000)throw Error('STM32H7A/B CPU caches enabled: reset and halt');
 for(const bank of banks){
  const r=bank.reg;
  if((await idle(s,bank))&ERR||(await s.reg(r+0xc))&0x803e)throw Error('STM32H7A/B Flash active operation or error');
  for(const off of [0x28,0x30]){
   const v=await s.reg(r+off);
   if((v&0xfff)<=((v>>>16)&0xfff))throw Error('STM32H7A/B protected Flash area');
  }
  // One WRP bit per group of four 8 KiB sectors.
  const groups=bank.size/(SECTOR*4),mask=groups===32?0xffffffff:(2**groups-1);
  if(((await s.reg(r+0x38)&mask)>>>0)!==mask)throw Error('STM32H7A/B WRP present');
 }
}
export async function programH7AB(s,b,progress=()=>{}){
 const p=s.pr;
 if(!(b instanceof Uint8Array)||b.length>p.flash||typeof s.writeFlashWord16!=='function')throw Error('STM32H7A/B image or transport');
 validateStmVector(b,p);
 if(await identifyH7AB(s)!==s.id)throw Error('STM32H7A/B UID changed');
 await s.put(DHCSR,0xa05f0003);
 if(!(await s.reg(DHCSR)&(1<<17)))throw Error('STM32H7A/B core not halted');
 const banks=h7abBanks(p);
 await preflight(s,banks);
 let eraseCount=0,cleanup=[];
 try{
  // Unlock both banks and check before erasing either of them.
  for(const bank of banks){
   const r=bank.reg;
   if(await s.reg(r+0xc)&LOCK){await s.put(r+4,0x45670123);await s.put(r+4,0xcdef89ab);}
   if(await s.reg(r+0xc)&LOCK)throw Error('STM32H7A/B Flash locked');
  }
  for(const bank of banks){
   const r=bank.reg;
   await s.put(r+0x14,EOP);
   for(let n=0;n<bank.size/SECTOR;n++){
    const cmd=SER|(n<<6);await s.put(r+0xc,cmd);await s.put(r+0xc,cmd|START);await complete(s,bank);
    progress(.2*(++eraseCount)/(p.flash/SECTOR));
   }
   await s.put(r+0xc,0);
  }
  for(const bank of banks){
   const r=bank.reg,start=bank.base-BASE,end=Math.min(start+bank.size,b.length);
   await s.put(r+0xc,PG);
   for(let i=start;i<end;i+=ROW){
    const data=new Uint8Array(ROW).fill(255);data.set(b.slice(i,Math.min(i+ROW,end)));
    if(data.some(x=>x!==255)){await s.writeFlashWord16(BASE+i,data);await complete(s,bank);}
    if(i%1024===0)progress(.2+.6*Math.min(i+ROW,b.length)/b.length);
   }
   await s.put(r+0xc,0);
  }
  for(const bank of banks){
   const start=bank.base-BASE;
   for(let i=0;i<bank.size;i+=1024){
    const n=Math.min(1024,bank.size-i),expected=new Uint8Array(n).fill(255);
    expected.set(b.slice(start+i,start+i+n));
    const got=await s.read(bank.base+i,n);
    if(got.length!==n||!got.every((v,k)=>v===expected[k]))throw Error('STM32H7A/B readback mismatch @0x'+(bank.base+i).toString(16));
    if((await s.reg(bank.reg+0x10))&ERR)throw Error('STM32H7A/B ECC/status error');
    progress(.8+.2*(start+i+n)/p.flash);
   }
  }
 }finally{
  // Never force an incomplete ECC row. If WBNE remains, report reset needed.
  // Independently attempt to lock the other bank even if cleanup fails.
  for(const bank of banks){
   try{
    const st=await idle(s,bank,13),r=bank.reg;
    if(st&2)throw Error('Incomplete Flash row: power-cycle target before retry');
    if(!(await s.reg(r+0xc)&LOCK)){await s.put(r+0xc,0);await s.put(r+0xc,LOCK);}
    if(!(await s.reg(r+0xc)&LOCK))throw Error('Flash relock failed');
   }catch(e){cleanup.push(e.message);}
  }
  if(cleanup.length)throw Error('STM32H7A/B cleanup: '+cleanup.join('; '));
 }
}
