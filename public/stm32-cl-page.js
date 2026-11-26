// Original register-level driver. ST RM0490 (C0), RM0394 (L4 single),
// RM0351 (L4 banked) and RM0432 (L4+). No vendor implementation or loaders.
import {validateStmVector} from './programmers.js';
const BASE=0x08000000,F=0x40022000,ACR=F,KEY=F+8,SR=F+16,CR=F+20,ECCR=F+24,OPTR=F+32;
const LOCK=0x80000000,OPTLOCK=0x40000000,IRQ=0x03000000,START=0x10000;
const names=["STM32C011F6Ux","STM32C011D6Yx","STM32C011F6Px","STM32C011J6Mx","STM32C011F4Ux","STM32C011F4Px","STM32C011J4Mx","STM32C031C6Tx","STM32C031C6Ux","STM32C031K6Tx","STM32C031K6Ux","STM32C031G6Ux","STM32C031F6Px","STM32C031C4Ux","STM32C031C4Tx","STM32C031K4Tx","STM32C031K4Ux","STM32C031G4Ux","STM32C031F4Px","STM32C051C8Tx","STM32C051C8Ux","STM32C051K8Tx","STM32C051G8Ux","STM32C051F8Px","STM32C051D8Yx","STM32C051C6Tx","STM32C051C6Ux","STM32C051K6Tx","STM32C051K6Ux","STM32C051G6Ux","STM32C051F6Px","STM32C071RBTx","STM32C071CBTx","STM32C071CBUx","STM32C071KBTx","STM32C071KBUx","STM32C071GBUx","STM32C071FBYx","STM32C071FBPx","STM32C071FBPxN","STM32C071RBTxN","STM32C071RBIxN","STM32C071CBTxN","STM32C071CBUxN","STM32C071KBTxN","STM32C071KBUxN","STM32C071GBUxN","STM32C071R8Tx","STM32C071C8Tx","STM32C071C8Ux","STM32C071K8Tx","STM32C071K8Ux","STM32C071G8Ux","STM32C071F8Px","STM32C071R8TxN","STM32C071C8TxN","STM32C071C8UxN","STM32C071K8TxN","STM32C071K8UxN","STM32C071G8UxN","STM32C071F8PxN","STM32C091RCTx","STM32C091ECYx","STM32C091RCIx","STM32C091CCTx","STM32C091CCUx","STM32C091KCTx","STM32C091KCUx","STM32C091GCUx","STM32C091FCPx","STM32C091RBTx","STM32C091CBTx","STM32C091CBUx","STM32C091KBTx","STM32C091KBUx","STM32C091GBUx","STM32C091FBPx","STM32C092RCTx","STM32C092ECYx","STM32C092RCIx","STM32C092CCTx","STM32C092CCUx","STM32C092KCTx","STM32C092KCUx","STM32C092GCUx","STM32C092FCPx","STM32C092RBTx","STM32C092CBTx","STM32C092CBUx","STM32C092KBTx","STM32C092KBUx","STM32C092GBUx","STM32C092FBPx","STM32L412C8Tx","STM32L412C8Ux","STM32L412K8Tx","STM32L412K8Ux","STM32L412R8Tx","STM32L412R8Ix","STM32L412T8Yx","STM32L412CBTx","STM32L412CBTxP","STM32L412CBUx","STM32L412CBUxP","STM32L412KBTx","STM32L412KBUx","STM32L412RBTx","STM32L412RBTxP","STM32L412RBIx","STM32L412RBIxP","STM32L412TBYx","STM32L412TBYxP","STM32L422CBTx","STM32L422CBUx","STM32L422KBTx","STM32L422KBUx","STM32L422RBIx","STM32L422RBTx","STM32L422TBYx","STM32L431CCTx","STM32L431CCUx","STM32L431CCYx","STM32L431KCUx","STM32L431RCTx","STM32L431RCYx","STM32L431RCIx","STM32L431VCTx","STM32L431VCIx","STM32L431CBTx","STM32L431CBUx","STM32L431CBYx","STM32L431KBUx","STM32L431RBTx","STM32L431RBYx","STM32L431RBIx","STM32L432KCUx","STM32L432KBUx","STM32L433CCTx","STM32L433CCUx","STM32L433CCYx","STM32L433RCIx","STM32L433RCTx","STM32L433RCTxP","STM32L433RCYx","STM32L433VCTx","STM32L433VCIx","STM32L433CBTx","STM32L433CBUx","STM32L433CBYx","STM32L433RBTx","STM32L433RBYx","STM32L433RBIx","STM32L442KCUx","STM32L443CCTx","STM32L443CCUx","STM32L443CCYx","STM32L443CCFx","STM32L443RCTx","STM32L443RCYx","STM32L443RCIx","STM32L443VCTx","STM32L443VCIx","STM32L451RETx","STM32L451REYx","STM32L451REIx","STM32L451CEUx","STM32L451CETx","STM32L451VETx","STM32L451VEIx","STM32L451RCTx","STM32L451RCIx","STM32L451CCUx","STM32L451VCTx","STM32L451VCIx","STM32L452RETx","STM32L452RETxP","STM32L452REYx","STM32L452REYxP","STM32L452REIx","STM32L452CEUx","STM32L452CETx","STM32L452CETxP","STM32L452VETx","STM32L452VEIx","STM32L452RCTx","STM32L452RCIx","STM32L452CCUx","STM32L452VCTx","STM32L452VCIx","STM32L462RETx","STM32L462REYx","STM32L462REIx","STM32L462CEUx","STM32L462CETx","STM32L462VETx","STM32L462VEIx","STM32L471RETx","STM32L471VETx","STM32L471QEIx","STM32L471ZETx","STM32L471ZEJx","STM32L471RGTx","STM32L471VGTx","STM32L471QGIx","STM32L471ZGTx","STM32L471ZGJx","STM32L475RCTx","STM32L475VCTx","STM32L475RETx","STM32L475VETx","STM32L475RGTx","STM32L475VGTx","STM32L476RCTx","STM32L476VCTx","STM32L476RETx","STM32L476JEYx","STM32L476MEYx","STM32L476VETx","STM32L476QEIx","STM32L476ZETx","STM32L476RGTx","STM32L476ZGTx","STM32L476ZGTxP","STM32L476JGYx","STM32L476JGYxP","STM32L476MGYx","STM32L476VGTx","STM32L476QGIxP","STM32L476QGIx","STM32L476ZGJx","STM32L486RGTx","STM32L486JGYx","STM32L486VGTx","STM32L486QGIx","STM32L486ZGTx","STM32L496RGTx","STM32L496RGTxP","STM32L496VGTx","STM32L496VGTxP","STM32L496VGYx","STM32L496VGYxP","STM32L496WGYxP","STM32L496QGIx","STM32L496QGIxS","STM32L496QGIxP","STM32L496ZGTx","STM32L496ZGTxP","STM32L496AGIx","STM32L496AGIxP","STM32L496VETx","STM32L496AEIx","STM32L496QEIx","STM32L496RETx","STM32L496ZETx","STM32L4A6RGTx","STM32L4A6RGTxP","STM32L4A6VGTx","STM32L4A6VGTxP","STM32L4A6VGYx","STM32L4A6VGYxP","STM32L4A6QGIx","STM32L4A6QGIxP","STM32L4A6ZGTx","STM32L4A6ZGTxP","STM32L4A6AGIx","STM32L4A6AGIxP","STM32L4R5AGIx","STM32L4R5QGIx","STM32L4R5QGIxS","STM32L4R5VGTx","STM32L4R5ZGTx","STM32L4R5ZGYx","STM32L4R5QIIx","STM32L4R5QIIxP","STM32L4R5VITx","STM32L4R5ZITx","STM32L4R5ZITxP","STM32L4R5ZIYx","STM32L4R5AIIx","STM32L4R5AIIxP","STM32L4R7VITx","STM32L4R7ZITx","STM32L4R7AIIx","STM32L4R9AGIx","STM32L4R9VGTx","STM32L4R9ZGTx","STM32L4R9ZGJx","STM32L4R9ZGYx","STM32L4R9VITx","STM32L4R9AIIx","STM32L4R9ZITx","STM32L4R9ZIJx","STM32L4R9ZIYx","STM32L4R9ZIYxP","STM32L4S5AIIx","STM32L4S5QIIx","STM32L4S5VITx","STM32L4S5ZITx","STM32L4S5ZIYx","STM32L4S7AIIx","STM32L4S7VITx","STM32L4S7ZITx","STM32L4S9AIIx","STM32L4S9VITx","STM32L4S9ZITx","STM32L4S9ZIYx","STM32L4S9ZIJx","STM32L4Q5CGTx","STM32L4Q5CGTxP","STM32L4Q5CGUx","STM32L4Q5CGUxP","STM32L4Q5VGYx","STM32L4Q5VGYxP","STM32L4Q5VGTx","STM32L4Q5VGTxP","STM32L4Q5RGTx","STM32L4Q5RGTxP","STM32L4Q5QGIx","STM32L4Q5QGIxP","STM32L4Q5ZGTx","STM32L4Q5ZGTxP","STM32L4Q5AGIx","STM32L4Q5AGIxP","STM32L4P5CGTx","STM32L4P5CGTxP","STM32L4P5RGTx","STM32L4P5RGTxP","STM32L4P5VGTx","STM32L4P5VGTxP","STM32L4P5QGIx","STM32L4P5QGIxS","STM32L4P5QGIxP","STM32L4P5ZGTx","STM32L4P5ZGTxP","STM32L4P5AGIx","STM32L4P5AGIxP","STM32L4P5CGUx","STM32L4P5CGUxP","STM32L4P5VGYx","STM32L4P5VGYxP","STM32L4P5AEIx","STM32L4P5CETx","STM32L4P5CEUx","STM32L4P5QEIx","STM32L4P5RETx","STM32L4P5VETx","STM32L4P5VEYx","STM32L4P5ZETx"];
const lineInfo={
 C011:[0x443,6,'c0'],C031:[0x453,12,'c0'],C051:[0x44c,12,'c0'],C071:[0x493,24,'c0'],C091:[0x44d,36,'c0'],C092:[0x44d,30,'c0'],
 L412:[0x464,40,'l4single'],L422:[0x464,40,'l4single'],L431:[0x435,64,'l4single'],L432:[0x435,64,'l4single'],L433:[0x435,64,'l4single'],L442:[0x435,64,'l4single'],L443:[0x435,64,'l4single'],L451:[0x462,160,'l4single'],L452:[0x462,160,'l4single'],L462:[0x462,160,'l4single'],
 L471:[0x415,128,'l4bank'],L475:[0x415,128,'l4bank'],L476:[0x415,128,'l4bank'],L486:[0x415,128,'l4bank'],L496:[0x461,320,'l4bank'],L4A6:[0x461,320,'l4bank'],
 L4R5:[0x470,640,'l4plus'],L4R7:[0x470,640,'l4plus'],L4R9:[0x470,640,'l4plus'],L4S5:[0x470,640,'l4plus'],L4S7:[0x470,640,'l4plus'],L4S9:[0x470,640,'l4plus'],L4P5:[0x471,320,'l4plus'],L4Q5:[0x471,320,'l4plus']
};
const sizes={4:16,6:32,8:64,B:128,C:256,E:512,G:1024,I:2048};
export const CL_PAGE_PROFILES=Object.freeze(Object.fromEntries(names.map(n=>{
 const [pid,ram,kind]=lineInfo[n.slice(5,9)],c0=kind==='c0';
 return [n,Object.freeze({controller:'cl-page',pid,kind,c0,flash:sizes[n[10]]*1024,ram:ram*1024,idReg:c0?0x40015800:0xe0042000,core:c0?0xc60:0xc24,uid:c0?0x1fff7550:0x1fff7590,sizeReg:c0?0x1fff75a0:0x1fff75e0,pageSize:kind==='l4plus'?4096:2048})];
})));
export function clPageProfile(name){
 const n=String(name).trim().toUpperCase().replace(/TR$/,'');
 for(const [pattern,p] of Object.entries(CL_PAGE_PROFILES)){
  if(n===pattern.slice(0,11)||new RegExp('^'+pattern.replace('x','[0-9]')+'$').test(n))return p;
 }
 return null;
}
export async function identifyCL(s){
 const p=s.pr;
 if((await s.reg(p.idReg)&0xfff)!==p.pid)throw Error('STM32C0/L4 device ID mismatch');
 if(((await s.reg(0xe000ed00)>>>4)&0xfff)!==p.core)throw Error('STM32C0/L4 core mismatch');
 const b=await s.read(p.sizeReg,2);
 if(b.length!==2||(b[0]+256*b[1])*1024!==p.flash)throw Error('STM32C0/L4 Flash size mismatch');
 const uid=await s.read(p.uid,12);
 if(uid.length!==12||uid.every(x=>x===0)||uid.every(x=>x===255))throw Error('Invalid UID');
 return 'stm32-'+Array.from(uid,x=>x.toString(16).padStart(2,'0')).join('');
}
const errorMask=p=>p.c0?0x63fa:0xc3fa;
async function idle(s){
 const until=Date.now()+60000,mask=s.pr.c0?0x50000:0x10000;
 do{const v=await s.reg(SR);if(!(v&mask))return v;await new Promise(r=>setTimeout(r,3));}while(Date.now()<until);
 throw Error('STM32C0/L4 Flash busy timeout');
}
async function complete(s){
 const status=await idle(s);
 if(status&errorMask(s.pr)||!(status&1))throw Error('STM32C0/L4 Flash status 0x'+status.toString(16));
 await s.put(SR,1);
}
async function ecc(s){
 if(!s.pr.c0&&(await s.reg(ECCR)&(s.pr.kind==='l4plus'?0xf0000000:0xc0000000)))throw Error('STM32L4 ECC fault');
}
export function clLayout(p,op){
 const banked=p.kind==='l4bank'||p.kind==='l4plus';
 let dual=false;
 if(p.kind==='l4bank')dual=p.flash===1048576||!!(op&(1<<21));
 if(p.kind==='l4plus'){
  const full=p.pid===0x470?2097152:1048576;
  if(p.flash!==full&&!(op&(1<<22)))throw Error('STM32L4+ reserved DBANK configuration');
  dual=p.flash===full?!!(op&(1<<22)):!!(op&(1<<21));
 }
 if(p.kind==='l4bank'&&dual&&p.flash<1048576)throw Error('STM32L4 dual-bank address gap requires segmented image');
 return {dual,banked,mer:4|(dual||p.kind==='l4plus'?0x8000:0)};
}
async function checkSyscfg(s,layout){
 const RCC=0x40021060,SYSCFG=0x40010000,old=await s.reg(RCC);
 try{
  if(!(old&1))await s.put(RCC,(old|1)>>>0);
  if(!(await s.reg(RCC)&1))throw Error('SYSCFG clock unavailable');
  if(!(await s.reg(SYSCFG+4)&1))throw Error('STM32L4 firewall active; reset and halt required');
  if(layout.dual&&(await s.reg(SYSCFG)&0x100))throw Error('STM32L4 swapped banks not supported');
 }finally{if(!(old&1))await s.put(RCC,old);}
}
async function preflight(s){
 const p=s.pr,op=await s.reg(OPTR),status=await idle(s),cr=await s.reg(CR);
 if((op&255)!==0xaa||status&(p.c0?0x6000:0xc000)||!(cr&OPTLOCK)||cr&0x38078007)throw Error('STM32C0/L4 option/protection or active operation');
 const layout=clLayout(p,op);
 if(layout.dual&&(op&(1<<20)))throw Error('STM32L4 alternate boot bank not supported');
 if(p.c0){if(await s.reg(F+0x80)&0x1007f)throw Error('STM32C0 securable area or boot lock present');}
 else await checkSyscfg(s,layout);
 // Compare complete documented offset fields, including areas that may be used
 // as additional protection areas in a single-bank configuration.
 const wm=p.c0?0x7f:0xff;
 for(const off of layout.banked?[0x2c,0x30,0x4c,0x50]:[0x2c,0x30]){
  const v=await s.reg(F+off);if((v&wm)<=((v>>>16)&wm))throw Error('STM32C0/L4 WRP protection present');
 }
 const pm=p.c0?0x1ff:p.kind==='l4plus'?0x1ffff:0xffff;
 for(const [a,b] of p.c0?[[0x24,0x28],[0x34,0x38]]:layout.banked?[[0x24,0x28],[0x44,0x48]]:[[0x24,0x28]]){
  if(((await s.reg(F+a))&pm)<=((await s.reg(F+b))&pm))throw Error('STM32C0/L4 PCROP protection present');
 }
 await ecc(s);
 return layout;
}
export async function programCL(s,b,progress=()=>{}){
 const p=s.pr;
 if(!(b instanceof Uint8Array)||b.length>p.flash||typeof s.writeDoubleword!=='function')throw Error('STM32C0/L4 Flash range or transport');
 validateStmVector(b,p);
 if(await identifyCL(s)!==s.id)throw Error('UID changed');
 await s.put(0xe000edf0,0xa05f0003);
 if(!(await s.reg(0xe000edf0)&(1<<17)))throw Error('Core not halted');
 const layout=await preflight(s),acr=await s.reg(ACR),disable=p.c0?0x300:0x700,reset=p.c0?0x800:0x1800,off=acr&~(disable|reset);
 if(!p.c0&&(acr&0x6000))throw Error('STM32L4 Flash power-down mode; reset required');
 try{
  if(await s.reg(CR)&LOCK){await s.put(KEY,0x45670123);await s.put(KEY,0xcdef89ab);}
  if(await s.reg(CR)&LOCK)throw Error('STM32C0/L4 Flash locked');
  await s.put(ACR,off);if((await s.reg(ACR))&disable)throw Error('Flash cache disable failed');
  await s.put(ACR,off|reset);await s.put(ACR,off);
  await s.put(SR,errorMask(p)|1);
  // Whole main Flash erase; never unlock options or touch OTP/system memory.
  const cmd=OPTLOCK|IRQ|layout.mer;
  await s.put(CR,cmd);await s.put(CR,cmd|START);await complete(s);progress(.1);
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
   if(got.length!==n||!got.every((v,k)=>v===expected[k]))throw Error('STM32C0/L4 Flash readback mismatch @0x'+(BASE+i).toString(16));
   if((await s.reg(SR))&errorMask(p))throw Error('STM32C0/L4 readback status');
   await ecc(s);progress(.85+.15*(i+n)/p.flash);
  }
 }finally{
  await idle(s);await s.put(CR,(LOCK|OPTLOCK)>>>0);
  if(((await s.reg(CR))>>>30)!==3)throw Error('STM32C0/L4 Flash relock failed');
 }
}
