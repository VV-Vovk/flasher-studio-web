import {TINY_ISP} from './tiny-profiles.js';
// Real transports. No simulated success; limited to explicit device profiles.
import {parseHex,denseImage,STM32_UART,validateStmVector} from './programmers.js';
import {Stm32SwdSession,swdProfile,swdReadRange,STLINK_F0_PROFILES,STLINK_F1_PROFILES} from './stm32-swd.js';
import {sha256Hex} from './safety.js';
import {unpackZip} from './universal.js';
const u=a=>Uint8Array.from(a), eq=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);
const hex=a=>Array.from(a,b=>b.toString(16).padStart(2,'0')).join('');
const xor=a=>a.reduce((v,b)=>v^b,0), wait=ms=>new Promise(r=>setTimeout(r,ms));
const le32=n=>[n&255,n>>>8&255,n>>>16&255,n>>>24], word=b=>new DataView(b.buffer,b.byteOffset,b.byteLength).getUint32(0,true);
export function extendedAvrProfile(board){if(board==='Arduino Mega 2560')return {protocol:'stk500v2',baud:115200,signature:'1e9801',limit:253952,page:256};if(['Arduino Leonardo','Arduino Micro'].includes(board))return {protocol:'avr109',baud:57600,signature:'1e9587',limit:28672,page:128};return null;}
export class Stk500v2{
 constructor(io){this.io=io;this.seq=1;}
 async cmd(a,n){let seq=this.seq;this.seq=(seq+1)&255;let frame=[0x1b,seq,a.length>>8,a.length&255,0x0e,...a];await this.io.send([...frame,xor(frame)]);let h=await this.io.read(5,3000);let len=h[2]*256+h[3];if(h[0]!==0x1b||h[1]!==seq||h[4]!==14||len<2||len>1024)throw Error('STK500v2: заголовок');let r=await this.io.read(len+1,3000);if(xor([...h,...r])||r[0]!==a[0]||r[1]!==0||len!==n+2)throw Error('STK500v2: ответ / checksum');return r.slice(2,-1);}
 async init(){let id=await this.cmd([1],9);if(id[0]!==8||new TextDecoder().decode(id.slice(1))!=='AVRISP_2')throw Error('Не штатный AVRISP_2');let sig=[];for(let i=0;i<3;i++){let r=await this.cmd([0x1b,4,0x30,0,i,0],2);if(r[1])throw Error('Signature status');sig.push(r[0]);}return hex(sig);}
 async address(a){let w=(a/2)|0x80000000;await this.cmd([6,w>>>24,w>>>16&255,w>>>8&255,w&255],0);}
 async program(b,progress=()=>{}){if(!b.length||b.length>253952)throw Error('Mega: граница приложения');if(await this.init()!=='1e9801')throw Error('Mega signature');await this.cmd([0x10,200,100,25,32,0,0x53,3,0xac,0x53,0,0],0);for(let i=0;i<b.length;i+=256){let p=new Uint8Array(256).fill(255);p.set(b.slice(i,i+256));await this.address(i);await this.cmd([0x13,1,0,0xc1,10,0x40,0x4c,0x20,0xff,0xff,...p],0);await this.address(i);let r=await this.cmd([0x14,1,0,0x20],257);if(r[256]||!eq(p,r.slice(0,256)))throw Error('Mega: readback');progress(Math.min(1,(i+256)/b.length));}await this.cmd([0x11,1,1],0);}
}
export class Avr109{
 constructor(io){this.io=io;}
 async ask(a,n=1){await this.io.send(a);return this.io.read(n,3000);}
 async ack(a){if((await this.ask(a))[0]!==13)throw Error('AVR109: нет CR');}
 async init(){let s=new TextDecoder().decode(await this.ask([83],7));if(s!=='CATERIN')throw Error('Требуется штатный Caterina');let b=await this.ask([98],3);if(b[0]!==89||b[1]*256+b[2]<128)throw Error('AVR109 block mode');return hex((await this.ask([115],3)).reverse());}
 async address(a){let w=a/2;await this.ack([65,w>>8,w&255]);}
 async program(b,progress=()=>{}){if(!b.length||b.length>28672)throw Error('Caterina: граница приложения');if(await this.init()!=='1e9587')throw Error('Caterina signature');await this.ack([80]);await this.ack([101]);for(let i=0;i<b.length;i+=128){let p=new Uint8Array(128).fill(255);p.set(b.slice(i,i+128));await this.address(i);await this.ack([66,0,128,70,...p]);await this.address(i);if(!eq(p,await this.ask([103,0,128,70],128)))throw Error('Caterina: readback');progress(Math.min(1,(i+128)/b.length));}await this.ack([76]);await this.ack([69]);}
}
// USBasp: standard vendor control requests, no high-voltage or fuse guessing.
export class UsbAsp{
 constructor(device){this.device=device;}
 async request(req,args=[],n=0){let a=[...args,0,0,0,0],r=await this.device.controlTransferIn({requestType:'vendor',recipient:'device',request:req,value:a[0]|a[1]<<8,index:a[2]|a[3]<<8},n);if(r.status!=='ok'||(r.data?.byteLength||0)!==n)throw Error('USBasp request '+req+' failed');return n?new Uint8Array(r.data.buffer,r.data.byteOffset,n):u([]);}
 async spi(a){return (await this.request(3,a,4))[3];}
 async init(){await this.request(1);try{let r=await this.request(10,[2],1);if(r[0]!==0)throw Error('SCK');}catch{} // slow SCK jumper required on older programmers
 if((await this.request(5,[],1))[0]!==0)throw Error('USBasp: ISP enable; проверь питание, RESET, slow SCK');return this.signature();}
 async signature(){let a=[];for(let i=0;i<3;i++)a.push(await this.spi([0x30,0,i,0]));return hex(a);}
 async read(a,n){if(!Number.isInteger(a)||!Number.isInteger(n)||a<0||a+n>(this.tiny?.limit||32768)||n<1||n>256)throw Error('USBasp: границы');return this.request(4,[a&255,a>>8,0,0],n);}
 async poll(){let end=Date.now()+1500;while(Date.now()<end){if(!((await this.spi([0xf0,0,0,0]))&1))return;await wait(5);}throw Error('AVR busy timeout');}
 async erase(){await this.spi([0xac,0x80,0,0]);await wait(this.tiny?40:20);if(!this.tiny)await this.poll();}
 async page(a,b){const p=this.tiny?.page||128,limit=this.tiny?.limit||32768;if(a%p||b.length!==p||a<0||a+p>limit)throw Error('USBasp page');let r=await this.device.controlTransferOut({requestType:'vendor',recipient:'device',request:6,value:a,index:p|(3<<8)},b);if(r.status!=='ok'||r.bytesWritten!==p)throw Error('USBasp write');if(this.tiny)await wait(15);else await this.poll();if(!eq(b,await this.read(a,p)))throw Error('USBasp readback');}
 async program(b,progress=()=>{}){if(this.tiny)return this.programTiny(b,progress);if(!b.length||b.length>32768)throw Error('AVR Flash size');let sig=await this.signature();if(!['1e950f','1e9514'].includes(sig)||sig!==this.expectedSignature)throw Error('AVR signature');await this.erase();for(let i=0;i<b.length;i+=128){let p=new Uint8Array(128).fill(255);p.set(b.slice(i,i+128));if(!p.every(x=>x===255))await this.page(i,p);else if(!eq(p,await this.read(i,128)))throw Error('AVR erase verify');progress(Math.min(1,(i+128)/b.length));}}
 async programTiny(b,progress=()=>{}){const p=this.tiny;if(!(b instanceof Uint8Array)||!b.length||b.length>p.limit||b.length<2||b[0]===255&&b[1]===255)throw Error('ATtiny image bounds / empty reset vector');const sig=await this.signature();if(sig!==p.signature||sig!==this.expectedSignature)throw Error('ATtiny signature');const low=await this.spi([0x50,0,0,0]),high=await this.spi([0x58,8,0,0]),ext=await this.spi([0x50,8,0,0]),lock=await this.spi([0x58,0,0,0]);if((lock&3)!==3)throw Error('ATtiny locked; automatic unlock refused');await this.erase();if(await this.signature()!==sig)throw Error('ATtiny signature changed');for(let i=0;i<p.limit;i+=p.page){if((await this.read(i,p.page)).some(v=>v!==255))throw Error('ATtiny erase verification');}const full=new Uint8Array(p.limit).fill(255);full.set(b);for(let i=0;i<p.limit;i+=p.page){const page=full.slice(i,i+p.page);if(!page.every(v=>v===255))await this.page(i,page);progress(.75*(i+p.page)/p.limit);}for(let i=0;i<p.limit;i+=p.page){if(!eq(full.slice(i,i+p.page),await this.read(i,p.page)))throw Error('ATtiny final readback');progress(.75+.25*(i+p.page)/p.limit);}if(await this.signature()!==sig||await this.spi([0x50,0,0,0])!==low||await this.spi([0x58,8,0,0])!==high||await this.spi([0x50,8,0,0])!==ext)throw Error('ATtiny identity/fuse changed');}
 async fuses(){return {low_fuses:await this.spi([0x50,0,0,0]),high_fuses:await this.spi([0x58,8,0,0]),extended_fuses:await this.spi([0x50,8,0,0]),lock_bits:await this.spi([0x58,0,0,0])};}
 async install(pkg,progress=()=>{}){if(this.tiny)throw Error('ATtiny bootloader/fuse installation not supported');let {m,image}=pkg;if(await this.signature()!==m.target.signature||this.expectedSignature!==m.target.signature)throw Error('Wrong AVR');let f=m.fuses;if(![0xe2,0xf7,0xff].includes(f.low_fuses)||!(f.high_fuses&0x80)||(f.high_fuses&0x20)||!(f.high_fuses&0x40)||![0x05,0xfd,0xff].includes(f.extended_fuses)||![0xff,0x0f,0x2f,0x3f].includes(f.lock_bits))throw Error('Fuse profile not supported');await this.program(image,progress);for(let [k,c,mask] of [['extended_fuses',0xa4,7],['high_fuses',0xa8,255],['low_fuses',0xa0,255]]){await this.spi([0xac,c,0,f[k]]);await wait(15);await this.poll();if(((await this.fuses())[k]&mask)!==(f[k]&mask))throw Error('Fuse readback '+k);}await this.spi([0xac,0xe0,0,f.lock_bits]);await wait(15);await this.poll();if(((await this.fuses()).lock_bits&0x3f)!==(f.lock_bits&0x3f))throw Error('Lock readback');}
 async close(){try{await this.request(2)}finally{await this.device.close();}}
}
export async function openUsbAsp(signature){if(!navigator.usb)throw Error('WebUSB недоступен');let d=await navigator.usb.requestDevice({filters:[{vendorId:0x16c0,productId:0x05dc}]});let a=new UsbAsp(d);try{await d.open();if(!d.configuration)await d.selectConfiguration(1);a.expectedSignature=signature;if(await a.init()!==signature)throw Error('Неверная сигнатура AVR');return a;}catch(e){await a.close().catch(()=>{});throw e;}}
// ST-LINK/V2 API v2: narrow STM32F103 medium-density support. No option-byte writes.
export function stLinkOut(pid){if(pid===0x3748||pid===undefined)return 2;if([0x374b,0x3752].includes(pid))return 1;throw Error('ST-LINK model unsupported');}
export class StLinkF1 extends Stm32SwdSession{
 constructor(device,pr){super(pr);this.device=device;this.out=stLinkOut(device.productId);this.in=1;}
 async tx(b){let r=await this.device.transferOut(this.out,b);if(r.status!=='ok'||r.bytesWritten!==b.length)throw Error('ST-LINK USB OUT');}
 async rx(n){let r=await this.device.transferIn(this.in,n);if(r.status!=='ok'||r.data?.byteLength!==n)throw Error('ST-LINK USB IN');return new Uint8Array(r.data.buffer,r.data.byteOffset,n);}
 async cmd(a,n=0,payload=null){let b=new Uint8Array(16);b.set(a);await this.tx(b);if(payload)await this.tx(payload);return n?this.rx(n):null;}
 async ok(a,n=2){let b=await this.cmd(a,n);if(b[0]!==0x80)throw Error('ST-LINK status '+b[0]);return b;}
 async rwStatus(){await this.ok([0xf2,0x3e],12);}
 async read(a,n){const {start,offset,alignedLength:len}=swdReadRange(a,n);const b=await this.cmd([0xf2,7,...le32(start),len&255,len>>8],len);await this.rwStatus();return b.slice(offset,offset+n);}
 async reg(a){return word(await this.read(a,4));}
 async put(a,val){await this.ok([0xf2,0x35,...le32(a),...le32(val)]);}
 // ST-LINK/V2 normally starts in DFU. Leave it without a firmware update.
 // Protocol sequence matches OpenOCD: exit current mode (no IN response), query,
 // then explicitly enter SWD without target reset. Never send erase/write here.
 async enterSwd(pause=wait){
  const v=await this.cmd([0xf1],6);
  if(v[0]>>>4!==2)throw Error('Требуется ST-LINK/V2');
  let mode=(await this.cmd([0xf5],2))[0];
  const exit=mode===0?[0xf3,0x07]:mode===2?[0xf2,0x21]:mode===3?[0xf4,0x01]:null;
  if(mode!==1&&!exit)throw Error('ST-LINK: неизвестный или неподдерживаемый режим');
  if(exit){
   const initial=mode;
   // Send exactly once; no blind retries after an ambiguous USB transfer.
   try{
    await this.cmd(exit,0);
    for(const delay of [100,200,400,800]){
     await pause(delay);
     mode=(await this.cmd([0xf5],2))[0];
     if(mode===1)break;
     if(mode!==initial)break;
    }
   }catch(e){throw Error('ST-LINK: связь потеряна при смене режима. Нажми подключение ещё раз, не отключая USB.');}
   if(mode!==1)throw Error('ST-LINK: не удалось выйти из текущего режима');
  }
  await this.ok([0xf2,0x30,0xa3]);
  if((await this.cmd([0xf5],2))[0]!==2)throw Error('ST-LINK: переход в режим SWD не подтверждён');
 }
 async init(){await this.enterSwd();return this.identify();}
 async writeHalfword(a,p){await this.cmd([0xf2,0x48,...le32(a),2,0],0,p);await this.rwStatus();}
 async writeFlashWord16(a,p){if(a%16||p.length!==16)throw Error('SWD flash-word alignment');await this.cmd([0xf2,8,...le32(a),16,0],0,p);await this.rwStatus();}
 async writeFlashWord32(a,p){if(a%32||p.length!==32)throw Error('SWD flash-word alignment');await this.cmd([0xf2,8,...le32(a),32,0],0,p);await this.rwStatus();}
 async writeDoubleword(a,p){if(a%8||p.length!==8)throw Error('SWD doubleword alignment');await this.cmd([0xf2,8,...le32(a),8,0],0,p);await this.rwStatus();}
 async writeByte(a,v){if(!Number.isInteger(v)||v<0||v>255)throw Error('Invalid SWD byte');await this.cmd([0xf2,0x0d,...le32(a),1,0],0,u([v]));await this.rwStatus();}
 async close(){// target remains halted after write: user resets the board manually
 await this.device.close();}
}
// Compatibility names retained for the existing installer and tests.
export class StLinkF0 extends StLinkF1{}
export {STLINK_F0_PROFILES,STLINK_F1_PROFILES};
export const stLinkProfile=swdProfile;
export async function openStLink(name){let pr=stLinkProfile(name);if(!pr)throw Error('SWD profile unsupported');let d=await navigator.usb.requestDevice({filters:[0x3748,0x374b,0x3752].map(productId=>({vendorId:0x0483,productId}))});let a=pr.idReg?new StLinkF0(d,pr):new StLinkF1(d,pr);try{await d.open();if(!d.configuration)await d.selectConfiguration(1);let iface=d.configuration.interfaces.find(i=>i.interfaceNumber===0&&i.alternate.interfaceClass===255&&i.alternate.endpoints.some(e=>e.direction==='in'&&e.endpointNumber===1)&&i.alternate.endpoints.some(e=>e.direction==='out'&&e.endpointNumber===a.out));if(!iface)throw Error('ST-LINK endpoint mismatch');await d.claimInterface(iface.interfaceNumber);a.id=await a.init();return a;}catch(e){await d.close().catch(()=>{});throw e;}}
export async function verifyBootZip(bytes,entry){if(!entry||await sha256Hex(bytes)!==entry.package.sha256||bytes.length!==entry.package.size)throw Error('ZIP не совпадает с CI-каталогом');let files=await unpackZip(bytes),m=entry.manifest;for(let f of m.files){let b=files.get(f.file);if(!b||b.length!==f.size||await sha256Hex(b)!==f.sha256)throw Error('Boot package SHA-256 '+f.file);}return {m,files};}
function avrBootImage(m,hex){if(m.kind!=='avr-isp'||!['atmega328','atmega328p'].includes(m.target.mcu)||m.target.flashBytes!==32768)throw Error('USBasp boot profile unsupported');let ranges=parseHex(new TextDecoder().decode(hex));if(ranges.some(r=>r.address<m.applicationMaxBytes||r.address+r.data.length>32768))throw Error('Bootloader writes application area');let image=new Uint8Array(32768).fill(255);for(let r of ranges)image.set(r.data,r.address);return {m,image};}
export async function avrBootPackage(bytes,entry){let {m,files}=await verifyBootZip(bytes,entry);return avrBootImage(m,files.get('bootloader.hex'));}
const MINICORE302='0bb50f6a6648e37cbe53012c61322345847c2a03';
const URBOOT_HASHES={atmega328:'59d9c5b566f8432a7b9fc145e88055e2bbbdc9e9f594f664fd37fc759d088834',atmega328p:'4a6555ffe3c4f7dbbb2832f31190b2b76c5f5e7a38323943a7ea08a2be84ace3'};
export async function fetchOfficialUrboot(entry,fetcher=fetch){
 const m=entry?.manifest,chip=m?.target?.mcu;
 if(!Object.hasOwn(URBOOT_HASHES,chip)||m.kind!=='avr-isp'||m.autoInstall!==false||m.target.flashBytes!==32768||m.source?.repo!=='https://github.com/MCUdude/MiniCore'||m.source.ref!=='3.0.2'||!['8mhz-internal','8mhz-external','16mhz-external'].some(s=>m.id==='avr-'+chip+'-urboot-'+s))throw Error('Нет проверенного официального профиля Urboot');
 const path='urboot/'+chip+'/watchdog_1_s/autobaud/uart0_rxd0_txd1/led+b5/urboot_'+chip+'_pr_ee_ce.hex',f=m.files?.find(x=>x.file==='bootloader.hex');
 if(m.source.originalFile!==path||m.files.length!==1||f?.sha256!==URBOOT_HASHES[chip]||f.size!==1082)throw Error('Официальный HEX не совпадает с каталогом');
 const url='https://raw.githubusercontent.com/MCUdude/MiniCore/'+MINICORE302+'/avr/bootloaders/'+path.split('/').map(encodeURIComponent).join('/');
 const response=await fetcher(url,{cache:'no-store',credentials:'omit',redirect:'error'});
 if(!response.ok)throw Error('MiniCore HTTP '+response.status);
 const bytes=new Uint8Array(await response.arrayBuffer());
 if(bytes.length!==f.size||await sha256Hex(bytes)!==f.sha256)throw Error('SHA-256 официального HEX не совпадает');
 return avrBootImage(m,bytes);
}
// STM32 DfuSe: only internal Flash alternate setting, no option bytes or read-unprotect.
export const DFU_PROFILES=Object.freeze({STM32F401RBT6:{pid:0x423,flash:131072,ram:65536,uid:0x1fff7a10,sizeReg:0x1fff7a22},STM32F411CEU6:{pid:0x431,flash:524288,ram:131072,uid:0x1fff7a10,sizeReg:0x1fff7a22},STM32F042F6P6:{pid:0x445,flash:32768,ram:6144,uid:0x1ffff7ac,sizeReg:0x1ffff7cc}});
export function dfuGeometry(s){let m=/^@Internal Flash\s*\/0x08000000\/\s*(.*)$/i.exec(s||'');if(!m)throw Error('DFU: нет дескриптора внутренней Flash');let a=0x08000000,out=[];for(let part of m[1].split(',')){let t=/^\s*(\d+)\*(\d+)([BKM])g\s*$/i.exec(part);if(!t)throw Error('DFU: не полностью доступная Flash');let count=Number(t[1]),size=Number(t[2])*({B:1,K:1024,M:1048576}[t[3].toUpperCase()]);if(!count||!size||count>2048||size>1048576||a+count*size>0x09000000)throw Error('DFU geometry');for(let j=0;j<count;j++){out.push({address:a,size});a+=size;}}return out;}
export class StmDfu{
 constructor(d,iface,pr,pages){this.device=d;this.iface=iface;this.pr=pr;this.pages=pages;}
 setup(request,value=0){return {requestType:'class',recipient:'interface',request,value,index:this.iface};}
 async input(req,n,value=0){let r=await this.device.controlTransferIn(this.setup(req,value),n);if(r.status!=='ok'||r.data?.byteLength!==n)throw Error('DFU USB read');return new Uint8Array(r.data.buffer,r.data.byteOffset,n);}
 async output(req,b=u([]),value=0){let r=await this.device.controlTransferOut(this.setup(req,value),b);if(r.status!=='ok'||r.bytesWritten!==b.length)throw Error('DFU USB write');}
 async status(){let b=await this.input(3,6);if(b[0]!==0)throw Error('DFU status '+b[0]);return {state:b[4],ms:b[1]+256*b[2]+65536*b[3]};}
 async idle(){let st=await this.status();if(st.state===2)return;if(![5,9].includes(st.state))throw Error('DFU unexpected state '+st.state);await this.output(6);if((await this.status()).state!==2)throw Error('DFU idle');}
 async download(block,data){await this.output(1,u(data),block);let end=Date.now()+60000;for(;;){let s=await this.status();if(s.state===5)return;if(![3,4].includes(s.state)||Date.now()+s.ms>end)throw Error('DFU download state/timeout');await wait(Math.max(1,s.ms));}}
 async pointer(a){await this.idle();await this.download(0,[0x21,...le32(a)]);await this.idle();}
 async read(a,n){if(n<1||n>256)throw Error('DFU read size');await this.pointer(a);let b=await this.input(2,n,2);await this.idle();return b;}
 async identify(){let id=word(await this.read(0xe0042000,4))&0xfff;if(id!==this.pr.pid)throw Error('DFU PID mismatch');let b=await this.read(this.pr.sizeReg,2);if((b[0]+256*b[1])*1024!==this.pr.flash)throw Error('DFU Flash size mismatch');let uid=await this.read(this.pr.uid,12);if(uid.every(x=>!x)||uid.every(x=>x===255))throw Error('DFU UID invalid');return 'stm32-'+hex(uid);}
 async program(b,progress=()=>{}){validateStmVector(b,this.pr);if(b.length>this.pr.flash||await this.identify()!==this.id)throw Error('DFU target mismatch');await this.read(0x08000000,4);for(let p of this.pages){await this.idle();await this.download(0,[0x41,...le32(p.address)]);}for(let i=0;i<b.length;i+=256){let raw=b.slice(i,i+256),pad=new Uint8Array(Math.ceil(raw.length/4)*4).fill(255);pad.set(raw);await this.pointer(0x08000000+i);await this.download(2,pad);if(!eq(pad,await this.read(0x08000000+i,pad.length)))throw Error('DFU readback');progress((i+raw.length)/b.length);}}
 async close(){await this.device.close();}
}
export async function openStmDfu(name){let pr=DFU_PROFILES[name];if(!pr)throw Error('DFU target unsupported');let d=await navigator.usb.requestDevice({filters:[{vendorId:0x0483,productId:0xdf11}]});try{await d.open();if(!d.configuration)await d.selectConfiguration(1);let choices=[];for(let i of d.configuration.interfaces)for(let a of i.alternates)if(a.interfaceClass===0xfe&&a.interfaceSubclass===1&&a.interfaceProtocol===2&&/^@Internal Flash/i.test(a.interfaceName||''))choices.push({i,a});if(choices.length!==1)throw Error('DFU: неоднозначный alternate setting');let {i,a}=choices[0],pages=dfuGeometry(a.interfaceName);if(pages.reduce((n,p)=>n+p.size,0)!==pr.flash)throw Error('DFU geometry mismatch');await d.claimInterface(i.interfaceNumber);await d.selectAlternateInterface(i.interfaceNumber,a.alternateSetting);let s=new StmDfu(d,i.interfaceNumber,pr,pages);s.id=await s.identify();return s;}catch(e){await d.close().catch(()=>{});throw e;}}
// UF2 is exported only: copying a file is not evidence of programming a physical target.
export function validateUf2(b,family){const ids={rp2040:0xe48bff56,rp2350:0xe48bff59}; // RP2350 ARM secure image only; other RP2350 families not accepted
 if(!ids[family]||!b.length||b.length%512||b.length>32*1024*1024)throw Error('UF2 size/family');let count=b.length/512,seen=new Set(),ranges=[];for(let p=0;p<b.length;p+=512){let v=new DataView(b.buffer,b.byteOffset+p,512),g=o=>v.getUint32(o,true);let flags=g(8),a=g(12),n=g(16),i=g(20);if(g(0)!==0x0a324655||g(4)!==0x9e5d5157||g(508)!==0x0ab16f30||flags!==0x2000||g(28)!==ids[family]||n!==256||a%256||a<0x10000000||a+n>0x11000000||g(24)!==count||i>=count||seen.has(i))throw Error('UF2 block / target');seen.add(i);ranges.push(a);}ranges.sort((a,b)=>a-b);if(ranges.some((a,i)=>i&&a<ranges[i-1]+256))throw Error('UF2 overlap');return {count,first:ranges[0],last:ranges.at(-1)+256};}
// Candidate ESP Recovery installation. Only CI-identified package, explicitly unprotected ESP chips.
export async function espBootPackage(bytes,entry){const {m,files}=await verifyBootZip(bytes,entry);const chip=m.target.mcu,cap=m.target.flashBytes;if(m.kind!=='esp-recovery'||!['esp32c3','esp32s3','esp32c6'].includes(chip)||![4194304,8388608,16777216].includes(cap))throw Error('ESP Recovery profile unsupported');const csv=files.get(m.partitionTable.file);if(!csv||csv.length!==m.partitionTable.size||await sha256Hex(csv)!==m.partitionTable.sha256)throw Error('Partition CSV SHA-256');const roles={bootloader:0,'partition-table':0x8000,'ota-data':0xf000,recovery:0x20000}, seen=new Set();let images=[];for(let f of m.files){if(!Object.hasOwn(roles,f.role)||seen.has(f.role)||f.offset!==roles[f.role]||f.offset+f.size>cap)throw Error('ESP Recovery offsets');seen.add(f.role);let data=files.get(f.file);if(['bootloader','recovery'].includes(f.role)){let expected={esp32c3:5,esp32s3:9,esp32c6:13}[chip];if(data.length<24||data[0]!==0xe9||data[12]+256*data[13]!==expected)throw Error('ESP header chip');}if(f.role==='recovery'&&f.size>0x180000)throw Error('Recovery too large');images.push({address:f.offset,data});}if(seen.size!==4)throw Error('ESP Recovery incomplete');images.sort((a,b)=>a.address-b.address);for(let i=1;i<images.length;i++)if(images[i-1].address+Math.ceil(images[i-1].data.length/4096)*4096>images[i].address)throw Error('ESP overlap');return {m,images};}
export async function checkEspRecoveryTarget(s,pkg){if(s.chip!==pkg.m.target.mcu||s.flash!==pkg.m.target.flashBytes)throw Error('ESP model / Flash mismatch');if(typeof s.loader.getSecurityInfo!=='function'||s.loader.secureDownloadMode)throw Error('ESP security state unavailable');let sec=await s.loader.getSecurityInfo();if(sec?.flags!==0||sec?.flashCryptCnt!==0||sec?.chipId!==({esp32c3:5,esp32s3:9,esp32c6:13}[s.chip]))throw Error('ESP: не подтверждено отсутствие защиты. Запись запрещена.');if('esp-'+String(await s.loader.chip.readMac(s.loader)).toLowerCase()!==s.id)throw Error('MAC changed');}
export async function installEspRecovery(s,pkg,vendor,progress=()=>{}){await checkEspRecoveryTarget(s,pkg);if(!s.backupSha256||!/^[a-f0-9]{64}$/.test(s.backupSha256))throw Error('Сначала резервная копия');await s.loader.writeFlash({fileArray:pkg.images,flashMode:'keep',flashFreq:'keep',flashSize:'keep',eraseAll:true,compress:true,calculateMD5Hash:vendor.md5,reportProgress:(idx,done,total)=>progress((idx+done/total)/pkg.images.length)});for(let f of pkg.images){let got=await s.loader.readFlash(f.address,f.data.length);if(!(got instanceof Uint8Array)||!eq(got,f.data))throw Error('ESP Recovery readback mismatch');}progress(1);}

// Target-neutral ST-LINK/V2 and V2-1 memory transport. No STM32 identification
// or STM32 flash algorithm is invoked for Nordic.
export async function openStLinkMemory(usb=navigator.usb){
 if(!usb?.requestDevice)throw Error('ST-LINK WebUSB unavailable');
 const d=await usb.requestDevice({filters:[0x3748,0x374b,0x3752].map(productId=>({vendorId:0x0483,productId}))});
 try{
  if(d.vendorId!==0x0483||![0x3748,0x374b,0x3752].includes(d.productId))throw Error('ST-LINK model unsupported');
  const a=new StLinkF1(d,{});
  await d.open();if(!d.configuration)await d.selectConfiguration(1);
  const i=d.configuration.interfaces.find(i=>i.interfaceNumber===0&&i.alternate.interfaceClass===255&&i.alternate.endpoints.some(e=>e.direction==='in'&&e.type==='bulk'&&e.endpointNumber===1)&&i.alternate.endpoints.some(e=>e.direction==='out'&&e.type==='bulk'&&e.endpointNumber===a.out));
  if(!i)throw Error('ST-LINK endpoint mismatch');await d.claimInterface(i.interfaceNumber);
  await a.enterSwd();
  return {readWord:async addr=>{if(addr%4)throw Error('ST-LINK word alignment');return a.reg(addr);},writeWord:async(addr,val)=>{
   if(addr%4||!Number.isInteger(val)||val<0||val>0xffffffff)throw Error('ST-LINK word arguments');
   await a.cmd([0xf2,8,...le32(addr),4,0],0,u(le32(val)));await a.rwStatus();
  },close:()=>a.close()};
 }catch(e){if(d.opened)await d.close().catch(()=>{});throw e;}
}

export async function openTinyUsbAsp(chip,usb=navigator.usb){
 const p=TINY_ISP[chip];if(!Object.hasOwn(TINY_ISP,chip)||!usb?.requestDevice)throw Error('ATtiny ISP target/WebUSB unavailable');
 const d=await usb.requestDevice({filters:[{vendorId:0x16c0,productId:0x05dc}]});
 if(d.vendorId!==0x16c0||d.productId!==0x05dc)throw Error('USBasp VID/PID');
 const a=new UsbAsp(d);a.tiny=p;a.expectedSignature=p.signature;
 try{await d.open();if(!d.configuration)await d.selectConfiguration(1);if(await a.init()!==p.signature)throw Error('ATtiny signature mismatch');return a;}
 catch(e){if(d.opened)await a.close().catch(()=>{});throw e;}
}

// Arduino Examples ArduinoISP: STK500v1 at 19200 8N1.
// Separate from an Arduino's own bootloader: exact sign-on before target access.
export class TinyArduinoIsp extends UsbAsp {
 constructor(io,chip){super(null);if(!Object.hasOwn(TINY_ISP,chip))throw Error('ATtiny ISP target unsupported');this.io=io;this.tiny=TINY_ISP[chip];this.expectedSignature=this.tiny.signature;this.active=false;this.failed=false;}
 async cmd(a,n=0){if(this.failed)throw Error('ArduinoISP session invalid; reconnect');try{await this.io.send([...a,0x20]);const b=await this.io.read(n+2,3000);if(b.length!==n+2||b[0]!==0x14||b.at(-1)!==0x10)throw Error('ArduinoISP response');return b.slice(1,-1);}catch(e){this.failed=true;throw e;}}
 async enter(){
  if(this.active)throw Error('ArduinoISP already active');
  await this.cmd([0x30]);const id=new TextDecoder().decode(await this.cmd([0x31],7));if(id!=='AVR ISP')throw Error('Require ArduinoISP sketch, not Arduino bootloader');
  const p=this.tiny,params=new Uint8Array(20);params[0]=0x20;params[4]=1;params[5]=1;params[6]=1;params[7]=3;params[8]=255;params[9]=255;
  const v=new DataView(params.buffer);v.setUint16(12,p.page,false);v.setUint32(16,p.limit,false);
  await this.cmd([0x42,...params]);this.active=true;await this.cmd([0x50]);
 }
 async leave(){if(!this.active)return;this.active=false;if(this.failed){throw Error('ArduinoISP connection lost; release target RESET manually before reconnecting');}await this.cmd([0x51]);}
 async signature(){if(!this.active)throw Error('ArduinoISP not in programming mode');return hex(await this.cmd([0x75],3));}
 async init(){try{await this.enter();const sig=await this.signature();if(sig!==this.expectedSignature)throw Error('ATtiny signature mismatch');return sig;}finally{await this.leave();}}
 async spi(a){if(!this.active||a.length!==4)throw Error('ArduinoISP universal');return (await this.cmd([0x56,...a],1))[0];}
 async address(a){if(!Number.isInteger(a)||a<0||a%2||a>=this.tiny.limit)throw Error('ArduinoISP address');const w=a/2;await this.cmd([0x55,w&255,w>>8]);}
 async read(a,n){if(!this.active||!Number.isInteger(n)||n<2||n>256||n%2||a+n>this.tiny.limit)throw Error('ArduinoISP read bounds');await this.address(a);return this.cmd([0x74,n>>8,n&255,0x46],n);}
 async page(a,b){
  const p=this.tiny.page;if(!this.active||!Number.isInteger(a)||a<0||a%p||a+p>this.tiny.limit||b.length!==p)throw Error('ArduinoISP page bounds');
  if(p===16){ // Stock ArduinoISP current_page() does not handle 16-byte pages.
   for(let i=0;i<p;i+=2){await this.spi([0x40,0,i/2,b[i]]);await this.spi([0x48,0,i/2,b[i+1]]);}
   const w=a/2;await this.spi([0x4c,w>>8,w&255,0]);
  }else{await this.address(a);await this.cmd([0x64,p>>8,p&255,0x46,...b]);}
  await wait(15);if(!eq(b,await this.read(a,p)))throw Error('ArduinoISP page readback');
 }
 async program(b,progress=()=>{}){if(!(b instanceof Uint8Array)||b.length<2||b.length>this.tiny.limit||b[0]===255&&b[1]===255)throw Error('ATtiny image bounds / empty reset vector');try{await this.enter();return await this.programTiny(b,progress);}finally{await this.leave();}}
 async close(){try{await this.leave();}finally{await this.io.close();}}
}
