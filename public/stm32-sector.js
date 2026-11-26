// STM32F2/F4 single-bank sector Flash, RM0033 / RM0368 / RM0383 / RM0090.
// Independent implementation, no vendor or third-party flash-loader binaries.
import {validateStmVector} from './programmers.js';
const BASE=0x08000000,ACR=0x40023c00,KEY=0x40023c04,SR=0x40023c0c,CR=0x40023c10,OPT=0x40023c14;
const LOCK=0x80000000,BSY=0x10000,START=0x10000,IRQ=0x03000000;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function profile(pid,flashKiB,ramKiB,part,pcrop=false){
 const sectors=[16,16,16,16,64];while(sectors.reduce((a,b)=>a+b,0)<flashKiB)sectors.push(128);
 if(sectors.reduce((a,b)=>a+b,0)!==flashKiB)throw Error('Unsupported sector geometry');
 return Object.freeze({controller:'f2f4-sector',pid,flash:flashKiB*1024,ram:ramKiB*1024,uid:0x1fff7a10,sizeReg:0x1fff7a22,part,pcrop,sectors:Object.freeze(sectors.map(s=>s*1024))});
}
export const SECTOR_PROFILES=Object.freeze({
 STM32F205RGT6:profile(0x411,1024,128,0xc23),
 STM32F207VGT6:profile(0x411,1024,128,0xc23),
 STM32F401CCU6:profile(0x423,256,64,0xc24,true),
 STM32F401RCT6:profile(0x423,256,64,0xc24,true),
 STM32F411CEU6:profile(0x431,512,128,0xc24,true),
 STM32F411RET6:profile(0x431,512,128,0xc24,true),
 STM32F407VGT6:profile(0x413,1024,128,0xc24)
});
export async function identifySector(s){
 const p=s.pr;
 if((await s.reg(0xe0042000)&0xfff)!==p.pid)throw Error('STM32F2/F4 device ID mismatch');
 if(((await s.reg(0xe000ed00)>>>4)&0xfff)!==p.part)throw Error('STM32F2/F4 CPU mismatch');
 const b=await s.read(p.sizeReg,2);
 if(b.length!==2||(b[0]+256*b[1])*1024!==p.flash)throw Error('STM32F2/F4 Flash size mismatch');
 const uid=await s.read(p.uid,12);
 if(uid.length!==12||uid.every(x=>x===0)||uid.every(x=>x===255))throw Error('Invalid UID');
 return 'stm32-'+Array.from(uid,x=>x.toString(16).padStart(2,'0')).join('');
}
async function idle(s){
 const until=Date.now()+60000;
 do{const r=await s.reg(SR);if(!(r&BSY))return r;await wait(3);}while(Date.now()<until);
 throw Error('STM32 sector Flash busy timeout');
}
async function complete(s,mask){
 const status=await idle(s);
 if(status&(mask&~1))throw Error('STM32 sector Flash status 0x'+status.toString(16));
 if(!(status&1))throw Error('STM32 sector Flash missing EOP');
 await s.put(SR,1);
}
export async function programSector(s,b,progress=()=>{}){
 const p=s.pr;
 if(!(b instanceof Uint8Array)||b.length>p.flash||typeof s.writeByte!=='function')throw Error('STM32 sector Flash range or transport');
 validateStmVector(b,p);
 if(await identifySector(s)!==s.id)throw Error('UID changed');
 await s.put(0xe000edf0,0xa05f0003);
 if(!(await s.reg(0xe000edf0)&(1<<17)))throw Error('Core not halted');
 await idle(s);
 const opt=await s.reg(OPT),wrpMask=(1<<p.sectors.length)-1;
 if(((opt>>>8)&255)!==0xaa||((opt>>>16)&wrpMask)!==wrpMask||(p.pcrop&&(opt>>>31)))throw Error('STM32 sector Flash protection present');
 // x8 programming/erase parallelism for the lowest specified programming voltage range.
 // Avoid assuming 3.3V or using a probe-specific voltage reading.
 const mask=p.pcrop?0x1f3:0xf3;
 const acr=await s.reg(ACR),cacheOff=acr&~0x1e00;
 if(await s.reg(CR)&LOCK){await s.put(KEY,0x45670123);await s.put(KEY,0xcdef89ab);}
 if(await s.reg(CR)&LOCK)throw Error('STM32 sector Flash locked');
 try{
   await s.put(ACR,cacheOff);await s.put(ACR,cacheOff|0x1800);await s.put(ACR,cacheOff);
   await s.put(SR,mask);
   for(let i=0;i<p.sectors.length;i++){
     const cmd=IRQ|2|(i<<3);
     await s.put(CR,cmd);await s.put(CR,cmd|START);await complete(s,mask);
     progress(.1*(i+1)/p.sectors.length);
   }
   await s.put(CR,IRQ|1);
   for(let i=0;i<b.length;i++){
     if(b[i]!==255){await s.writeByte(BASE+i,b[i]);await complete(s,mask);}
     if(i%256===0)progress(.1+.75*i/b.length);
   }
   await s.put(CR,0);
   for(let i=0;i<p.flash;i+=256){
     const n=Math.min(256,p.flash-i),expected=new Uint8Array(n).fill(255);
     expected.set(b.slice(i,i+n));
     const got=await s.read(BASE+i,n);
     if(got.length!==n||!got.every((v,k)=>v===expected[k]))throw Error('STM32 sector Flash readback mismatch @0x'+(BASE+i).toString(16));
     progress(.85+.15*(i+n)/p.flash);
   }
 }finally{
   await idle(s);
   await s.put(CR,LOCK);
   if(!(await s.reg(CR)&LOCK))throw Error('STM32 sector Flash relock failed');
   await s.put(ACR,cacheOff|0x1800);await s.put(ACR,cacheOff);await s.put(ACR,acr&~0x1800);
 }
}
