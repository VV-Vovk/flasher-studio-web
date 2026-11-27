import {proMiniProfile} from './nrf-arduino-profiles.js';
import {stmUartProfile} from './stm32-rom-profiles.js';
import {espLifecycle,ESP_CLOSE_WARNING} from './esp-lifecycle.js';
export {espLifecycle,ESP_CLOSE_WARNING};
export {stmUartProfile};
import {sha256Hex,checkImageHeader,chipFromDescription,flashBytesFromDescription,validateEsp8266Arduino} from './safety.js';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const hex=b=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
const u8=a=>Uint8Array.from(a);
const xor=a=>a.reduce((a,b)=>a^b,0);
const eq=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
export function parseHex(text){let mem=new Map(),base=0,ended=false;for(const line of text.trim().split(/\r?\n/)){if(!line.trim())continue;if(ended||!/^:([0-9a-f]{2})+$/i.test(line.trim()))throw Error('Некорректный Intel HEX');let b=u8(line.trim().slice(1).match(/../g).map(x=>parseInt(x,16))),n=b[0],addr=b[1]*256+b[2],type=b[3],d=b.slice(4,-1);if(b.length!==n+5||b.reduce((a,c)=>a+c,0)%256)throw Error('Контрольная сумма HEX');if(type===0){for(let i=0;i<n;i++){let p=base+addr+i;if(p>0xffffffff||mem.has(p))throw Error('Пересечение или переполнение HEX');mem.set(p,d[i]);if(mem.size>16*1024*1024)throw Error('HEX слишком большой');}}else if(type===1&&n===0&&addr===0)ended=true;else if(type===4&&n===2&&addr===0)base=(d[0]*256+d[1])*65536;else if(type===2&&n===2&&addr===0)base=(d[0]*256+d[1])*16;else if(!([3,5].includes(type)&&n===4&&addr===0))throw Error('Неподдерживаемая запись HEX');}if(!ended||!mem.size)throw Error('HEX без EOF или данных');let ranges=[];for(let p of [...mem.keys()].sort((a,b)=>a-b)){let last=ranges.at(-1);if(!last||last.address+last.data.length!==p)ranges.push({address:p,data:[mem.get(p)]});else last.data.push(mem.get(p));}return ranges.map(r=>({...r,data:u8(r.data)}));}
export function denseImage(ranges,start,limit,fill=255){if(!ranges.length||ranges[0].address!==start)throw Error('Образ должен начинаться с '+start.toString(16));let end=start;for(const r of ranges){if(r.address<end||r.address+r.data.length>limit)throw Error('Образ вне допустимой памяти');end=r.address+r.data.length;}let b=new Uint8Array(end-start).fill(fill);for(const r of ranges)b.set(r.data,r.address-start);return b;}
export class SerialIO{
 constructor(port){this.port=port;this.buffer=[];this.error=null;this.closed=false;}
 async open(options){await this.port.open(options);this.reader=this.port.readable.getReader();this.writer=this.port.writable.getWriter();this.loop=(async()=>{try{while(!this.closed){let {value,done}=await this.reader.read();if(done)break;for(let b of value)this.buffer.push(b);if(this.buffer.length>1048576)throw Error('Переполнение буфера');}if(!this.closed)this.error=Error('USB отключён');}catch(e){if(!this.closed)this.error=e;}})();}
 async send(b){if(this.error)throw this.error;await this.writer.write(u8(b));}
 async read(n,ms=1800){const until=Date.now()+ms;while(this.buffer.length<n){if(this.error)throw this.error;if(Date.now()>until)throw Error('Нет ответа микроконтроллера');await delay(5);}return u8(this.buffer.splice(0,n));}
 async close(){this.closed=true;try{await this.reader?.cancel()}catch{}try{await this.loop}catch{}try{this.reader?.releaseLock()}catch{}try{this.writer?.releaseLock()}catch{}try{await this.port.close()}catch{}}
}
export class Stm32Rom{
 constructor(io){this.io=io;this.commands=[];}
 async ack(ms){const b=(await this.io.read(1,ms))[0];if(b!==0x79)throw Error('STM32: '+(b===0x1f?'NACK':'неверный ACK '+b));}
 async cmd(c){await this.io.send([c,c^255]);await this.ack();}
 async init(){await this.io.send([0x7f]);await this.ack();await this.cmd(0);let n=(await this.io.read(1))[0];let x=await this.io.read(n+1);await this.ack();this.version=x[0];this.commands=[...x.slice(1)];await this.cmd(2);n=(await this.io.read(1))[0];x=await this.io.read(n+1);await this.ack();if(x.length!==2)throw Error('Неизвестный формат ID STM32');this.pid=x[0]*256+x[1];return this.pid;}
 async address(a){let b=u8([a>>>24,a>>>16,a>>>8,a]);await this.io.send([...b,xor(b)]);await this.ack();}
 async read(a,n){if(!this.commands.includes(0x11)||n<1||n>256)throw Error('Read Memory недоступен');await this.cmd(0x11);await this.address(a);await this.io.send([n-1,(n-1)^255]);await this.ack();return this.io.read(n);}
 async eraseAll(){if(this.commands.includes(0x44)){await this.cmd(0x44);await this.io.send([255,255,0]);}else if(this.commands.includes(0x43)){await this.cmd(0x43);await this.io.send([255,0]);}else throw Error('Erase недоступен');await this.ack(60000);}
 async write(a,data){if(a%4||data.length%4||data.length>256||!data.length)throw Error('STM32 alignment');await this.cmd(0x31);await this.address(a);let b=u8([data.length-1,...data]);await this.io.send([...b,xor(b)]);await this.ack(5000);}
 async program(image,progress=()=>{}){if(![0x11,0x31].every(x=>this.commands.includes(x)))throw Error('Нет записи/чтения для проверки');await this.read(0x08000000,4);await this.eraseAll();for(let i=0;i<image.length;i+=256){let raw=image.slice(i,i+256),pad=new Uint8Array(Math.ceil(raw.length/4)*4).fill(255);pad.set(raw);await this.write(0x08000000+i,pad);if(!eq(pad,await this.read(0x08000000+i,pad.length)))throw Error('STM32: проверка Flash не прошла');progress((i+raw.length)/image.length);}}
}
export class Stk500{
 constructor(io){this.io=io;}
 async cmd(a,n=0,ms=3000){await this.io.send([...a,0x20]);let b=await this.io.read(n+2,ms);if(b[0]!==0x14||b.at(-1)!==0x10)throw Error('STK500: неверный ответ');return b.slice(1,-1);}
 async init(){await this.cmd([0x30]);return hex(await this.cmd([0x75],3));}
 // Separate USB ownership from each short bootloader session.
 // Use a complete reset pulse and bounded retries only before any Flash write.
 async reenter(expectedSignature,wait=delay,trace=()=>{}){
  const io=this.io,port=io.port;
  const checkLink=()=>{if(io.error)throw io.error;if(io.closed)throw Error('USB отключён');};
  checkLink();
  if(typeof port?.setSignals!=='function')throw Error('STK500: DTR/RTS unavailable');
  const inactive={dataTerminalReady:false,requestToSend:false},active={dataTerminalReady:true,requestToSend:true};
  const info=port.getInfo?.()||{};
  if(Number.isInteger(info.usbVendorId)&&Number.isInteger(info.usbProductId))trace('USB VID:PID '+info.usbVendorId.toString(16).padStart(4,'0')+':'+info.usbProductId.toString(16).padStart(4,'0'));
  let last;
  for(const [index,settle] of [150,300,450].entries()){
   checkLink();
   const prefix='STK500 '+(index+1)+'/3: ';
   io.buffer.length=0;
   trace(prefix+'DTR/RTS inactive');
   await port.setSignals(inactive);
   await wait(250);
   trace(prefix+'DTR/RTS active');
   await port.setSignals(active);
   await wait(10);
   await port.setSignals(inactive);
   trace(prefix+'DTR/RTS inactive; wait '+settle+' ms');
   await wait(settle);
   checkLink();
   io.buffer.length=0;
   try{
    trace(prefix+'TX 30 20');
    await io.send([0x30,0x20]);
    const sync=await io.read(2,700);
    trace(prefix+'RX '+hex(sync));
    if(sync[0]!==0x14||sync[1]!==0x10)throw Error('STK500: неверный ответ');
    trace(prefix+'TX 75 20');
    await io.send([0x75,0x20]);
    const reply=await io.read(5,700);
    trace(prefix+'RX '+hex(reply));
    if(reply[0]!==0x14||reply[4]!==0x10)throw Error('STK500: неверный ответ');
    const signature=hex(reply.slice(1,4));
    if(signature!==expectedSignature){const e=Error('Сигнатура изменилась');e.signatureMismatch=true;throw e;}
    return signature;
   }catch(e){
    checkLink();
    if(e.signatureMismatch)throw e;
    if(io.buffer.length)trace(prefix+'RX partial '+hex(io.buffer.slice(0,32)));
    trace(prefix+'sync/signature failed');
    last=e;
   }
  }
  throw last||Error('Нет ответа микроконтроллера');
 }
 async address(i){const w=i/2;await this.cmd([0x55,w&255,w>>8]);}
 // GET_PARAMETER: unsupported bootloaders can return dummy values.
 async bootVersion(){
  const major=(await this.cmd([0x41,0x81],1,700))[0];
  const minor=(await this.cmd([0x41,0x82],1,700))[0];
  return major>0&&major<100&&minor<100?major+'.'+minor:null;
 }
 async readApplication(size,limit,progress=()=>{}){
  if(!Number.isSafeInteger(size)||!Number.isSafeInteger(limit)||size<1||size>limit||limit>32768)throw Error('Недопустимый размер чтения');
  const bytes=new Uint8Array(size);
  for(let i=0;i<size;i+=128){
   const n=Math.min(128,size-i);
   await this.address(i);
   bytes.set(await this.cmd([0x74,n>>8,n&255,0x46],n),i);
   progress((i+n)/size);
  }
  return bytes;
 }
 async program(image,progress=()=>{}){await this.cmd([0x50]);try{for(let i=0;i<image.length;i+=128){let p=new Uint8Array(128).fill(255);p.set(image.slice(i,i+128));await this.address(i);await this.cmd([0x64,0,128,0x46,...p]);await this.address(i);let got=await this.cmd([0x74,0,128,0x46],128);if(!eq(p,got))throw Error('AVR: проверка Flash не прошла');progress(Math.min(1,(i+128)/image.length));}}finally{await this.cmd([0x51]);}}
}
// Deliberately narrow tested-by-protocol allowlist. PID is a family/density identifier, not a unique part number.
export const STM32_UART=Object.freeze({STM32F103C8T6:{pid:0x410,flash:65536,uid:0x1ffff7e8,sizeReg:0x1ffff7e0,ram:20480},STM32F103CBT6:{pid:0x410,flash:131072,uid:0x1ffff7e8,sizeReg:0x1ffff7e0,ram:20480},STM32F030F4P6:{pid:0x444,flash:16384,uid:0x1ffff7ac,sizeReg:0x1ffff7cc,ram:4096},STM32F030K6T6:{pid:0x444,flash:32768,uid:0x1ffff7ac,sizeReg:0x1ffff7cc,ram:4096},STM32F030C8T6:{pid:0x440,flash:65536,uid:0x1ffff7ac,sizeReg:0x1ffff7cc,ram:8192}});
export function avrProfile(board){const pro=proMiniProfile(board);if(pro)return pro;if(/Uno R3|Arduino Uno$/.test(board))return {baud:115200,signature:'1e950f',limit:32256};if(/Nano.*old|Nano.*стар/i.test(board))return {baud:57600,signature:'1e950f',limit:30720};if(/Arduino Nano/.test(board)&&!/Every|33/.test(board))return {baud:115200,signature:'1e950f',limit:30720};return null;}
export function validateStmVector(image,profile){if(!(image instanceof Uint8Array)||image.length<8)throw Error('Нет таблицы векторов');const v=new DataView(image.buffer,image.byteOffset,image.byteLength),sp=v.getUint32(0,true),pc=v.getUint32(4,true);const main=sp>0x20000000&&sp<=0x20000000+profile.ram,ccm=profile.ccm>0&&sp>0x10000000&&sp<=0x10000000+profile.ccm,stack=profile.stackRegions?profile.stackRegions.some(([start,end])=>sp>start&&sp<=end):main||ccm;if(!stack||sp%(profile.stackAlign||4)||!(pc&1)||(pc&~1)<0x08000000||(pc&~1)>=0x08000000+image.length)throw Error('Таблица векторов не соответствует обычной STM32 Flash');}
export function stmFirmwareImage(ranges,profile){const image=denseImage(ranges,0x08000000,0x08000000+profile.flash,profile.controller==='l0-pecr'?0:255);validateStmVector(image,profile);return image;}
export async function stmSessionIdentity(rom,profile){if(typeof rom.identify==='function')return rom.identify();const uid=await rom.read(profile.uid,12);if(uid.length!==12||uid.every(x=>x===0)||uid.every(x=>x===255))throw Error('UID не прочитан');return 'stm32-'+Array.from(uid,x=>x.toString(16).padStart(2,'0')).join('');}
export async function espConnect(port,vendor,log){let transport=new vendor.Transport(port,false),loader=new vendor.ESPLoader({transport,baudrate:115200,terminal:{clean(){},writeLine:log,write:log},debugLogging:false});espLifecycle.record('connect-start',{transport});try{let desc=await loader.main(),chip=chipFromDescription(desc)||chipFromDescription(loader.chip?.CHIP_NAME);if(!chip)throw Error('Неизвестный ESP');let flash=flashBytesFromDescription(await loader.detectFlashSize());if(!flash)throw Error('Не определён объём Flash');let mac=await loader.chip.readMac(loader);let id=/^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/i.test(mac)?'esp-'+mac.toLowerCase():null;if(!id)throw Error('Не прочитан MAC');const session={loader,transport,chip,flash,id,desc};espLifecycle.record('connected',session);return session;}catch(e){espLifecycle.record('connect-error',{transport});if(!await espLifecycle.close({transport}))throw Error(ESP_CLOSE_WARNING);throw e;}}
export const validateEsp8266Image=validateEsp8266Arduino;
// Cross-board catalog programming is intentionally limited to the exact ESP32
// chip detected over USB. Board names describe build profiles, not silicon.
const catalogEspChip=value=>String(value??'').trim().toLowerCase().replace(/[-_]/g,'');
export function catalogBoardOverride(meta,target,session,sourceChip){
 const name=v=>String(v??'').trim().toLowerCase();
 const same=meta.board===target.board||meta.board===target.alternateBoard;
 if(same)return false;
 // Match the catalogue's case/outer-whitespace comparison for ESP32 only.
 // Never silently equate different board aliases or special layouts.
 if(session.kind==='esp'&&meta.family==='ESP32'&&target.family==='ESP32'&&!meta.recoveryLayout&&!meta.wbOtaLayout&&
    name(meta.board)&&name(meta.board)===name(target.board)&&
    catalogEspChip(sourceChip)===catalogEspChip(target.chip)&&session.chip===catalogEspChip(target.chip)&&
    (!meta.chip||catalogEspChip(meta.chip)===session.chip))return false;
 const chip=catalogEspChip(target.chip),allowed=['esp32','esp32c3','esp32s2','esp32s3','esp32c6','esp32h2'];
 if(session.kind!=='esp'||meta.family!=='ESP32'||target.family!=='ESP32'||meta.recoveryLayout||meta.wbOtaLayout||
    !allowed.includes(chip)||session.chip!==chip||catalogEspChip(sourceChip)!==chip||
    (meta.chip&&catalogEspChip(meta.chip)!==chip))
  throw Error('Профиль прошивки не совпадает с выбранной платой');
 return true;
}
export function validateEspMergedImage(session,bytes,{crossBoard=false}={}){
 if(!(bytes instanceof Uint8Array)||!Number.isSafeInteger(session.flash)||session.flash<1||bytes.length>session.flash)throw Error('BIN не помещается в Flash');
 if(session.chip==='esp8266'){validateEsp8266Arduino(bytes,session.flash);return;}
 const start=['esp32','esp32s2'].includes(session.chip)?0x1000:0;
 const head=checkImageHeader(bytes.subarray(start),session.chip);
 if(head.kind!=='esp-image')throw Error('Не соответствует заголовок ESP');
 if(bytes.length<0x10018||checkImageHeader(bytes.subarray(0x10000),session.chip).kind!=='esp-image')throw Error('Требуется полный merged BIN со стандартным приложением 0x10000');
 if(crossBoard){
  // ESP32 bootloader header byte 3 encodes configured flash capacity.
  // Never allow an image configured for more flash than the connected chip.
  const code=bytes[start+3]>>>4,capacity=code<=7?1048576*2**code:0;
  if(!capacity||capacity>session.flash)throw Error('Размер Flash в заголовке прошивки несовместим с подключённой платой');
 }
}
export async function espProgram(session,bytes,vendor,progress){
 validateEspMergedImage(session,bytes);
 if(session.chip==='esp8266'&&(typeof session.loader.readFlash!=='function'||session.loader.IS_STUB===false))throw Error('ESP8266: требуется загрузчик stub с чтением Flash');
 await session.loader.writeFlash({fileArray:[{data:bytes,address:0}],flashMode:'keep',flashFreq:'keep',flashSize:'keep',eraseAll:false,compress:true,calculateMD5Hash:vendor.md5,reportProgress:(_idx,done,total)=>progress(done/total)});
}

const RECOVERY_SERVICE='6d960001-b5a3-4b80-a6d8-983a7ad72f11',RECOVERY_CMD='6d960002-b5a3-4b80-a6d8-983a7ad72f11',RECOVERY_STATUS='6d960003-b5a3-4b80-a6d8-983a7ad72f11';
const ESP_IDS={esp32:0,esp32s2:2,esp32c3:5,esp32s3:9,esp32c6:13,esp32h2:16};
export function validateRecoveryApp(bytes,chip,max){if(!(bytes instanceof Uint8Array)||bytes.length<36||bytes.length>max||bytes[0]!==0xe9)throw Error('Требуется ESP app-only BIN подходящего размера');const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);if(view.getUint16(12,true)!==ESP_IDS[chip]||!Object.hasOwn(ESP_IDS,chip))throw Error('ESP chip ID не совпадает');if(view.getUint32(32,true)!==0xabcd5432)throw Error('Не найден ESP app descriptor. Merged BIN и bootloader недопустимы');let n=bytes[1],p=24;if(n<1||n>16)throw Error('Некорректные сегменты ESP');for(let i=0;i<n;i++){if(p+8>bytes.length)throw Error('Повреждён сегмент');let len=view.getUint32(p+4,true);p+=8+len;if(p>bytes.length)throw Error('Сегмент вне образа');}p=Math.ceil((p+1)/16)*16+(bytes[23]===1?32:0);if(p!==bytes.length)throw Error('Размер app-only образа не соответствует сегментам; merged/подписанные образы запрещены');}
export async function connectRecovery(token,target){if(!/^[a-f0-9]{32}$/i.test(token))throw Error('Токен Recovery: 32 шестнадцатеричных символа');if(!navigator.bluetooth?.requestDevice)throw Error('Web Bluetooth недоступен');const device=await navigator.bluetooth.requestDevice({filters:[{services:[RECOVERY_SERVICE]}]});try{const gatt=await device.gatt.connect(),service=await gatt.getPrimaryService(RECOVERY_SERVICE),cmd=await service.getCharacteristic(RECOVERY_CMD),status=await service.getCharacteristic(RECOVERY_STATUS),send=b=>cmd.writeValueWithResponse(u8(b)),info=async()=>JSON.parse(new TextDecoder().decode(await status.readValue()));await send([1,...token.match(/../g).map(x=>parseInt(x,16))]);const a=await info();if(a.v!==1||a.target!==target||!Number.isSafeInteger(a.maxBytes)||a.maxBytes<65536||a.maxBytes>16*1024*1024||a.busy)throw Error('Несовместимый или занятый Recovery');return {device,send,info,chip:target,maxBytes:a.maxBytes,desc:target.toUpperCase()+' · BLE Recovery',close(){device.gatt.disconnect();}};}catch(e){device.gatt?.disconnect();throw e;}}
export async function updateRecovery(s,bytes,progress=()=>{}){validateRecoveryApp(bytes,s.chip,s.maxBytes);let len=new Uint8Array(4);new DataView(len.buffer).setUint32(0,bytes.length,true);let digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));await s.send([2,...len]);try{for(let i=0;i<2;i++)await s.send([3,i,...digest.slice(i*16,(i+1)*16)]);for(let pos=0;pos<bytes.length;pos+=15){let p=new Uint8Array(4);new DataView(p.buffer).setUint32(0,pos,true);await s.send([4,...p,...bytes.slice(pos,pos+15)]);if(pos%1500===0)progress(pos/bytes.length);}let status=await s.info();if(status.received!==bytes.length||!status.busy)throw Error('Recovery подтвердил неполный образ');await s.send([5]);progress(1);}catch(e){try{await s.send([6]);}catch{}throw e;}}
