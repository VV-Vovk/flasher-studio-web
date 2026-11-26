// STM32F2/F4/F7 sector Flash. RM0033 / RM0368 / RM0383 / RM0090 / RM0401 / RM0402 / RM0390 / RM0430 / RM0386 / RM0431 / RM0385 / RM0410.
// Independent implementation, no vendor or third-party flash-loader binaries.
import {validateStmVector} from './programmers.js';
const BASE=0x08000000,ACR=0x40023c00,KEY=0x40023c04,SR=0x40023c0c,CR=0x40023c10,OPT=0x40023c14;
const LOCK=0x80000000,BSY=0x10000,START=0x10000,IRQ=0x03000000;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function geometry(k,scale=1){
 const sectors=[];for(let i=0;i<4&&sectors.length*16*scale<k;i++)sectors.push(16*scale);
 if(k>=128*scale)sectors.push(64*scale);while(sectors.reduce((a,b)=>a+b,0)<k)sectors.push(128*scale);
 if(sectors.reduce((a,b)=>a+b,0)!==k)throw Error('Unsupported sector geometry');
 return sectors;
}
function profile(pid,flashKiB,ramKiB,part,pcrop=false,ccmKiB=0,kind='standard'){
 const m7=part===0xc27,scale=m7&&kind!=='f72'?2:1,banked=kind==='f4bank'||kind==='f76';
 const sectors=kind==='f4bank'&&flashKiB===2048?[...geometry(1024),...geometry(1024)]:geometry(flashKiB,scale);
 return Object.freeze({controller:'f2f4-sector',pid,flash:flashKiB*1024,ram:ramKiB*1024,ccm:ccmKiB*1024,uid:kind==='f72'?0x1ff07a10:m7?0x1ff0f420:0x1fff7a10,sizeReg:kind==='f72'?0x1ff07a22:m7?0x1ff0f442:0x1fff7a22,part,pcrop,kind,m7,banked,sectors:Object.freeze(sectors.map(s=>s*1024))});
}
export const SECTOR_PROFILES=Object.freeze({
 STM32F205RGT6:profile(0x411,1024,128,0xc23),
 STM32F207VGT6:profile(0x411,1024,128,0xc23),
 STM32F401CCU6:profile(0x423,256,64,0xc24,true),
 STM32F401RCT6:profile(0x423,256,64,0xc24,true),
 STM32F411CEU6:profile(0x431,512,128,0xc24,true),
 STM32F411RET6:profile(0x431,512,128,0xc24,true),
 STM32F407VGT6:profile(0x413,1024,128,0xc24,false,64)
});
// Catalogue allowlist for exact order codes, not a family-prefix guess.
const SECTOR_NAMES=["STM32F205RB","STM32F205RBTx","STM32F205RC","STM32F205RCTx","STM32F205RE","STM32F205RETx","STM32F205REYx","STM32F205RF","STM32F205RFTx","STM32F205RG","STM32F205RGTx","STM32F205RGYx","STM32F205RGEx","STM32F205VB","STM32F205VBTx","STM32F205VC","STM32F205VCTx","STM32F205VE","STM32F205VETx","STM32F205VF","STM32F205VFTx","STM32F205VG","STM32F205VGTx","STM32F205ZC","STM32F205ZCTx","STM32F205ZE","STM32F205ZETx","STM32F205ZF","STM32F205ZFTx","STM32F205ZG","STM32F205ZGTx","STM32F207VC","STM32F207VCTx","STM32F207VE","STM32F207VETx","STM32F207VF","STM32F207VFTx","STM32F207VG","STM32F207VGTx","STM32F207ZC","STM32F207ZCTx","STM32F207ZE","STM32F207ZETx","STM32F207ZF","STM32F207ZFTx","STM32F207ZG","STM32F207ZGTx","STM32F207IC","STM32F207ICTx","STM32F207ICHx","STM32F207IE","STM32F207IETx","STM32F207IEHx","STM32F207IF","STM32F207IFTx","STM32F207IFHx","STM32F207IG","STM32F207IGTx","STM32F207IGHx","STM32F215RE","STM32F215RETx","STM32F215RG","STM32F215RGTx","STM32F215VE","STM32F215VETx","STM32F215VG","STM32F215VGTx","STM32F215ZE","STM32F215ZETx","STM32F215ZG","STM32F215ZGTx","STM32F217VE","STM32F217VETx","STM32F217VG","STM32F217VGTx","STM32F217ZE","STM32F217ZETx","STM32F217ZG","STM32F217ZGTx","STM32F217IE","STM32F217IETx","STM32F217IEHx","STM32F217IG","STM32F217IGTx","STM32F217IGHx","STM32F401CB","STM32F401CBUx","STM32F401CBYx","STM32F401RB","STM32F401RBTx","STM32F401VB","STM32F401VBTx","STM32F401VBHx","STM32F401CC","STM32F401CCUx","STM32F401CCYx","STM32F401CCFx","STM32F401RC","STM32F401RCTx","STM32F401VC","STM32F401VCTx","STM32F401VCHx","STM32F401CD","STM32F401CDUx","STM32F401CDYx","STM32F401RD","STM32F401RDTx","STM32F401VD","STM32F401VDTx","STM32F401VDHx","STM32F401CE","STM32F401CEUx","STM32F401CEYx","STM32F401RE","STM32F401RETx","STM32F401VE","STM32F401VETx","STM32F401VEHx","STM32F410CB","STM32F410CBUx","STM32F410CBTx","STM32F410RB","STM32F410RBTx","STM32F410RBIx","STM32F410TB","STM32F410TBYx","STM32F410C8","STM32F410C8Ux","STM32F410C8Tx","STM32F410R8","STM32F410R8Tx","STM32F410R8Ix","STM32F410T8","STM32F410T8Yx","STM32F411CC","STM32F411CCUx","STM32F411CCYx","STM32F411RC","STM32F411RCTx","STM32F411VC","STM32F411VCTx","STM32F411VCHx","STM32F411CE","STM32F411CEUx","STM32F411CEYx","STM32F411RE","STM32F411RETx","STM32F411VE","STM32F411VETx","STM32F411VEHx","STM32F412CE","STM32F412CEUx","STM32F412CG","STM32F412CGUx","STM32F412RE","STM32F412RETx","STM32F412REYx","STM32F412REYxP","STM32F412RG","STM32F412RGTx","STM32F412RGYx","STM32F412RGYxP","STM32F412VE","STM32F412VEHx","STM32F412VETx","STM32F412VG","STM32F412VGHx","STM32F412VGTx","STM32F412ZE","STM32F412ZEJx","STM32F412ZETx","STM32F412ZG","STM32F412ZGJx","STM32F412ZGTx","STM32F405RG","STM32F405RGTx","STM32F405VG","STM32F405VGTx","STM32F405ZG","STM32F405ZGTx","STM32F405OG","STM32F405OGYx","STM32F405OE","STM32F405OEYx","STM32F407VG","STM32F407VGTx","STM32F407IG","STM32F407IGTx","STM32F407IGHx","STM32F407ZG","STM32F407ZGTx","STM32F407VE","STM32F407VETx","STM32F407ZE","STM32F407ZETx","STM32F407IE","STM32F407IETx","STM32F407IEHx","STM32F415RG","STM32F415RGTx","STM32F415VG","STM32F415VGTx","STM32F415ZG","STM32F415ZGTx","STM32F415OG","STM32F415OGYx","STM32F417VG","STM32F417VGTx","STM32F417IG","STM32F417IGTx","STM32F417IGHx","STM32F417ZG","STM32F417ZGTx","STM32F417VE","STM32F417VETx","STM32F417ZE","STM32F417ZETx","STM32F417IE","STM32F417IETx","STM32F417IEHx","STM32F446MC","STM32F446MCYx","STM32F446RC","STM32F446RCTx","STM32F446VC","STM32F446VCTx","STM32F446ZC","STM32F446ZCHx","STM32F446ZCJx","STM32F446ZCTx","STM32F446ME","STM32F446MEYx","STM32F446RE","STM32F446RETx","STM32F446VE","STM32F446VETx","STM32F446ZE","STM32F446ZEHx","STM32F446ZEJx","STM32F446ZETx"];
SECTOR_NAMES.push(...["STM32F413ZH","STM32F413ZHJx","STM32F413ZHTx","STM32F413CH","STM32F413CHUx","STM32F413RH","STM32F413RHTx","STM32F413VH","STM32F413VHHx","STM32F413VHTx","STM32F413MH","STM32F413MHYx","STM32F413ZG","STM32F413ZGJx","STM32F413ZGTx","STM32F413CG","STM32F413CGUx","STM32F413RG","STM32F413RGTx","STM32F413VG","STM32F413VGHx","STM32F413VGTx","STM32F413MG","STM32F413MGYx","STM32F423ZH","STM32F423ZHJx","STM32F423ZHTx","STM32F423CH","STM32F423CHUx","STM32F423RH","STM32F423RHTx","STM32F423VH","STM32F423VHHx","STM32F423VHTx","STM32F423MH","STM32F423MHYx","STM32F427AG","STM32F427AGHx","STM32F427VG","STM32F427VGTx","STM32F427ZG","STM32F427ZGTx","STM32F427IG","STM32F427IGTx","STM32F427IGHx","STM32F427AI","STM32F427AIHx","STM32F427VI","STM32F427VITx","STM32F427ZI","STM32F427ZITx","STM32F427II","STM32F427IITx","STM32F427IIHx","STM32F429AG","STM32F429AGHx","STM32F429VG","STM32F429VGTx","STM32F429ZG","STM32F429ZGTx","STM32F429ZGYx","STM32F429IG","STM32F429IGTx","STM32F429IGHx","STM32F429AI","STM32F429AIHx","STM32F429VI","STM32F429VITx","STM32F429ZI","STM32F429ZITx","STM32F429ZIYx","STM32F429II","STM32F429IITx","STM32F429IIHx","STM32F429VE","STM32F429VETx","STM32F429ZE","STM32F429ZETx","STM32F429IE","STM32F429IETx","STM32F429IEHx","STM32F429BG","STM32F429BGTx","STM32F429BI","STM32F429BITx","STM32F429BE","STM32F429BETx","STM32F429NG","STM32F429NGHx","STM32F429NI","STM32F429NIHx","STM32F429NE","STM32F429NEHx","STM32F437VG","STM32F437VGTx","STM32F437ZG","STM32F437ZGTx","STM32F437IG","STM32F437IGTx","STM32F437IGHx","STM32F437AI","STM32F437AIHx","STM32F437VI","STM32F437VITx","STM32F437ZI","STM32F437ZITx","STM32F437II","STM32F437IITx","STM32F437IIHx","STM32F439VG","STM32F439VGTx","STM32F439VI","STM32F439VITx","STM32F439ZG","STM32F439ZGTx","STM32F439ZGYx","STM32F439ZI","STM32F439ZITx","STM32F439ZIYx","STM32F439IG","STM32F439IGTx","STM32F439IGHx","STM32F439II","STM32F439IITx","STM32F439IIHx","STM32F439BG","STM32F439BGTx","STM32F439BI","STM32F439BITx","STM32F439NG","STM32F439NGHx","STM32F439NI","STM32F439NIHx","STM32F439AI","STM32F439AIHx","STM32F469AE","STM32F469AEHx","STM32F469AEYx","STM32F469AG","STM32F469AGHx","STM32F469AGYx","STM32F469AI","STM32F469AIHx","STM32F469AIYx","STM32F469IE","STM32F469IEHx","STM32F469IETx","STM32F469IG","STM32F469IGHx","STM32F469IGTx","STM32F469II","STM32F469IIHx","STM32F469IITx","STM32F469BE","STM32F469BETx","STM32F469BG","STM32F469BGTx","STM32F469BI","STM32F469BITx","STM32F469NE","STM32F469NEHx","STM32F469NG","STM32F469NGHx","STM32F469NI","STM32F469NIHx","STM32F469VE","STM32F469VETx","STM32F469VG","STM32F469VGTx","STM32F469VI","STM32F469VITx","STM32F469ZE","STM32F469ZETx","STM32F469ZG","STM32F469ZGTx","STM32F469ZI","STM32F469ZITx","STM32F479AG","STM32F479AGHx","STM32F479AGYx","STM32F479AI","STM32F479AIHx","STM32F479AIYx","STM32F479IG","STM32F479IGHx","STM32F479IGTx","STM32F479II","STM32F479IIHx","STM32F479IITx","STM32F479BG","STM32F479BGTx","STM32F479BI","STM32F479BITx","STM32F479NG","STM32F479NGHx","STM32F479NI","STM32F479NIHx","STM32F479VG","STM32F479VGTx","STM32F479VI","STM32F479VITx","STM32F479ZG","STM32F479ZGTx","STM32F479ZI","STM32F479ZITx","STM32F745ZG","STM32F745ZGTx","STM32F745ZE","STM32F745ZETx","STM32F745VG","STM32F745VGHx","STM32F745VGTx","STM32F745VE","STM32F745VEHx","STM32F745VETx","STM32F745IG","STM32F745IGTx","STM32F745IGKx","STM32F745IE","STM32F745IETx","STM32F745IEKx","STM32F746ZG","STM32F746ZGYx","STM32F746ZGTx","STM32F746VG","STM32F746VGHx","STM32F746VGTx","STM32F746IG","STM32F746IGKx","STM32F746IGTx","STM32F746BG","STM32F746BGTx","STM32F746NG","STM32F746NGHx","STM32F746ZE","STM32F746ZETx","STM32F746ZEYx","STM32F746VE","STM32F746VEHx","STM32F746VETx","STM32F746IE","STM32F746IETx","STM32F746IEKx","STM32F746BE","STM32F746BETx","STM32F746NE","STM32F746NEHx","STM32F756ZG","STM32F756ZGYx","STM32F756ZGTx","STM32F756VG","STM32F756VGHx","STM32F756VGTx","STM32F756IG","STM32F756IGKx","STM32F756IGTx","STM32F756BG","STM32F756BGTx","STM32F756NG","STM32F756NGHx","STM32F765BG","STM32F765BGTx","STM32F765BI","STM32F765BITx","STM32F765IG","STM32F765IGKx","STM32F765IGTx","STM32F765II","STM32F765IIKx","STM32F765IITx","STM32F765NG","STM32F765NGHx","STM32F765NI","STM32F765NIHx","STM32F765VG","STM32F765VGTx","STM32F765VGHx","STM32F765VI","STM32F765VITx","STM32F765VIHx","STM32F765ZG","STM32F765ZGTx","STM32F765ZI","STM32F765ZITx","STM32F767BI","STM32F767BITx","STM32F767BG","STM32F767BGTx","STM32F767NI","STM32F767NIHx","STM32F767NG","STM32F767NGHx","STM32F767II","STM32F767IITx","STM32F767IIKx","STM32F767IG","STM32F767IGTx","STM32F767IGKx","STM32F767ZI","STM32F767ZITx","STM32F767ZG","STM32F767ZGTx","STM32F767VI","STM32F767VITx","STM32F767VIHx","STM32F767VG","STM32F767VGTx","STM32F767VGHx","STM32F768AI","STM32F768AIYx","STM32F769BI","STM32F769BITx","STM32F769BG","STM32F769BGTx","STM32F769NI","STM32F769NIHx","STM32F769NG","STM32F769NGHx","STM32F769II","STM32F769IITx","STM32F769IG","STM32F769IGTx","STM32F769AI","STM32F769AIYx","STM32F769AG","STM32F769AGYx","STM32F777BI","STM32F777BITx","STM32F777NI","STM32F777NIHx","STM32F777II","STM32F777IITx","STM32F777IIKx","STM32F777ZI","STM32F777ZITx","STM32F777VI","STM32F777VITx","STM32F777VIHx","STM32F778AI","STM32F778AIYx","STM32F779BI","STM32F779BITx","STM32F779NI","STM32F779NIHx","STM32F779II","STM32F779IITx","STM32F779AI","STM32F779AIYx","STM32F732VE","STM32F732VETx","STM32F732RE","STM32F732RETx","STM32F732ZE","STM32F732ZETx","STM32F732IE","STM32F732IETx","STM32F732IEKx","STM32F722VE","STM32F722VETx","STM32F722RE","STM32F722RETx","STM32F722ZE","STM32F722ZETx","STM32F722IE","STM32F722IETx","STM32F722IEKx","STM32F722RC","STM32F722RCTx","STM32F722VC","STM32F722VCTx","STM32F722ZC","STM32F722ZCTx","STM32F722IC","STM32F722ICTx","STM32F722ICKx","STM32F733VE","STM32F733VETx","STM32F733VEYx","STM32F733ZE","STM32F733ZETx","STM32F733IE","STM32F733IETx","STM32F733IEKx","STM32F733ZEIx","STM32F723VE","STM32F723VETx","STM32F723VEYx","STM32F723ZE","STM32F723ZETx","STM32F723ZEIx","STM32F723IE","STM32F723IETx","STM32F723IEKx","STM32F723ZC","STM32F723ZCTx","STM32F723ZCIx","STM32F723IC","STM32F723ICTx","STM32F723ICKx","STM32F723VC","STM32F723VCTx","STM32F723VCYx","STM32F730R8","STM32F730R8Tx","STM32F730V8","STM32F730V8Tx","STM32F730Z8","STM32F730Z8Tx","STM32F730I8","STM32F730I8Kx","STM32F750V8","STM32F750V8Tx","STM32F750Z8","STM32F750Z8Tx","STM32F750N8","STM32F750N8Hx"]);
const sizes={8:64,B:128,C:256,D:384,E:512,F:768,G:1024,H:1536,I:2048};
function makeBase(n){
 const line=n.slice(6,9),d=n[10],k=sizes[d];
 if(['205','207','215','217'].includes(line))return profile(0x411,k,k===128?64:k===256?96:128,0xc23);
 if(line==='401')return profile(/[BC]/.test(d)?0x423:0x433,k,/[BC]/.test(d)?64:96,0xc24,true);
 if(['405','407','415','417'].includes(line))return profile(0x413,k,128,0xc24,false,64);
 if(line==='410')return profile(0x458,k,32,0xc24,true);
 if(line==='411')return profile(0x431,k,128,0xc24,true);
 if(line==='412')return profile(0x441,k,256,0xc24,true);
 if(line==='446')return profile(0x421,k,128,0xc24,true);
 if(['413','423'].includes(line))return profile(0x463,k,320,0xc24,true,0,'f413');
 if(['427','429','437','439'].includes(line))return profile(0x419,k,192,0xc24,true,64,'f4bank');
 if(['469','479'].includes(line))return profile(0x434,k,320,0xc24,true,64,'f4bank');
 if(['722','723','730','732','733'].includes(line))return profile(0x452,k,256,0xc27,false,0,'f72');
 if(['745','746','750','756'].includes(line))return profile(0x449,k,320,0xc27,false,0,'f74');
 if(['765','767','768','769','777','778','779'].includes(line))return profile(0x451,k,512,0xc27,false,0,'f76');
 throw Error('Unsupported sector part '+n);
}
export const SECTOR_BASE_PROFILES=Object.freeze(Object.fromEntries([...new Set(SECTOR_NAMES.map(n=>n.slice(0,11)))].map(n=>[n,makeBase(n)])));
export function sectorProfile(name){
 const n=String(name).toUpperCase().replace(/TR$/,'');
 if(SECTOR_PROFILES[n])return SECTOR_PROFILES[n];
 const base=n.slice(0,11),p=SECTOR_BASE_PROFILES[base];
 if(!p)return null;
 if(n===base)return p;
 return SECTOR_NAMES.some(x=>x.startsWith(base)&&x.includes('x')&&new RegExp('^'+x.replace('x','[0-9]')+'$').test(n))?p:null;
}
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
// Resolve the actual erase layout before touching Flash. Sector codes differ from
// logical sector numbers in bank 2; erase the exact documented sectors, not OTP.
export function sectorLayout(p,opt){
 const dual=p.kind==='f4bank'&&(p.flash===2097152||p.flash===1048576&&!!(opt&0x40000000))||p.kind==='f76'&&!(opt&0x20000000);
 const sizes=dual?geometry(p.flash/2048).map(x=>x*1024):p.sectors;
 const a=sizes.map((size,code)=>({size,code}));
 return dual?{dual,entries:[...a,...a.map(x=>({...x,code:x.code+16}))]}:{dual,entries:a};
}
async function checkSwap(s){
 const clock=0x40023844,old=await s.reg(clock),bit=1<<14;
 try{if(!(old&bit))await s.put(clock,(old|bit)>>>0);if(!(await s.reg(clock)&bit))throw Error('SYSCFG clock unavailable');
  if((await s.reg(0x40013800))&0x100)throw Error('STM32 swapped Flash banks not supported');
 }finally{if(!(old&bit))await s.put(clock,old);}
}
async function preflight(s){
 const p=s.pr,opt=await s.reg(OPT),layout=sectorLayout(p,opt);
 const first=layout.entries.filter(x=>x.code<16).length,second=layout.entries.length-first;
 const wrpMask=p.kind==='f413'?0x7fff:p.kind==='f76'?0xfff:(1<<first)-1;
 if(!(opt&1)||(opt&2)||((opt>>>8)&255)!==0xaa||((opt>>>16)&wrpMask)!==wrpMask||(p.pcrop&&(opt>>>31)))throw Error('STM32 sector Flash protection present');
 if((await s.reg(CR))&0x00018007)throw Error('STM32 Flash operation already configured');
 if(p.kind==='f4bank'&&layout.dual){
  const mask=(1<<second)-1;
  if(((await s.reg(OPT+4)>>>16)&mask)!==mask)throw Error('STM32 bank 2 write protection present');
  if(opt&16)throw Error('STM32 alternate bank boot not supported');
  await checkSwap(s);
 }
 if(p.kind==='f76'&&layout.dual){if(!(opt&0x10000000))throw Error('STM32 alternate bank boot not supported');await checkSwap(s);}
 if(p.kind==='f72'&&((await s.reg(OPT+8))&0xff))throw Error('STM32 F7 PCROP protection present');
 // Do not touch Cortex-M7 cache control or resume stale code. Connect after reset
 // with CPU caches disabled; programming is through the physical AXI Flash alias.
 if(p.m7&&((await s.reg(0xe000ed14))&0x30000))throw Error('STM32F7 CPU caches enabled: reset and halt before programming');
 return layout;
}
export async function programSector(s,b,progress=()=>{}){
 const p=s.pr;
 if(!(b instanceof Uint8Array)||b.length>p.flash||typeof s.writeByte!=='function')throw Error('STM32 sector Flash range or transport');
 validateStmVector(b,p);
 if(await identifySector(s)!==s.id)throw Error('UID changed');
 await s.put(0xe000edf0,0xa05f0003);
 if(!(await s.reg(0xe000edf0)&(1<<17)))throw Error('Core not halted');
 await idle(s);
 const layout=await preflight(s);
 // x8 programming/erase parallelism for the lowest specified programming voltage range.
 // Avoid assuming 3.3V or using a probe-specific voltage reading.
 const mask=p.pcrop||p.kind==='f72'?0x1f3:0xf3;
 const acr=await s.reg(ACR),resetMask=p.m7?0x800:0x1800,disableMask=p.m7?0xb00:0x1f00,cacheOff=acr&~disableMask;
 try{
   if(await s.reg(CR)&LOCK){await s.put(KEY,0x45670123);await s.put(KEY,0xcdef89ab);}
   if(await s.reg(CR)&LOCK)throw Error('STM32 sector Flash locked');
   await s.put(ACR,cacheOff);if((await s.reg(ACR))&(p.m7?0x300:0x700))throw Error('STM32 cache disable failed');await s.put(ACR,cacheOff|resetMask);await s.put(ACR,cacheOff);
   await s.put(SR,mask);
   for(let i=0;i<layout.entries.length;i++){
     const cmd=IRQ|2|(layout.entries[i].code<<3);
     await s.put(CR,cmd);await s.put(CR,cmd|START);await complete(s,mask);
     progress(.1*(i+1)/layout.entries.length);
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
     if((await s.reg(SR))&(mask&~1))throw Error('STM32 sector Flash readback status');
     progress(.85+.15*(i+n)/p.flash);
   }
 }finally{
   await idle(s);
   await s.put(CR,LOCK);
   if(!(await s.reg(CR)&LOCK))throw Error('STM32 sector Flash relock failed');
   await s.put(ACR,cacheOff|resetMask);await s.put(ACR,cacheOff);if(!p.m7)await s.put(ACR,acr&~resetMask);
 }
}
