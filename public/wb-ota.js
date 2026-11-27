// AN5247 Rev 8: original host-side app-only image validation and GATT discovery.
// No vendor example code or binary is redistributed. No GATT writes.
import {wbProfile,wbCpu1CompileTarget} from './stm32-wb.js';
import {denseImage} from './programmers.js';
export const WB_OTA_BASE=0x08007000,WB_OTA_MAGIC=0x94448a29;
export const WB_OTA_UUID=Object.freeze({service:'0000fe20-cc7a-482a-984a-7f2ed5b3e58f',address:'0000fe22-8e22-4541-9d4c-21edae82ed19',confirmation:'0000fe23-8e22-4541-9d4c-21edae82ed19',data:'0000fe24-8e22-4541-9d4c-21edae82ed19'});
export function wbOtaCandidate(name){return /^STM32WB55/.test(name)&&wbCpu1CompileTarget(name)&&wbProfile(name)?.ram===192*1024;}
export function checkWbOtaImage(name,ranges,limitKiB){
 if(!wbOtaCandidate(name))throw Error('WB OTA geometry not reviewed');
 const p=wbProfile(name),limit=limitKiB*1024;
 if(!Number.isInteger(limitKiB)||limit<=0x7000||limit>p.flash||limit%4096)throw Error('WB OTA requires page-aligned CPU1 Flash budget');
 const image=denseImage(ranges,WB_OTA_BASE,0x08000000+limit);
 if(image.length<0x148)throw Error('WB OTA image too short');
 const v=new DataView(image.buffer,image.byteOffset,image.byteLength),sp=v.getUint32(0,true),pc=v.getUint32(4,true),tag=v.getUint32(0x140,true);
 const covered=(a,n)=>ranges.some(r=>r.address<=a&&a+n<=r.address+r.data.length);
 if(!covered(WB_OTA_BASE,8)||!covered(WB_OTA_BASE+0x140,4)||sp<=0x20000004||sp>0x20030000||sp%8||!(pc&1)||!covered(pc&~1,2))throw Error('WB OTA vector or tag pointer invalid');
 if(tag%4||tag<WB_OTA_BASE+0x144||tag+4!==WB_OTA_BASE+image.length||!covered(tag,4)||v.getUint32(tag-WB_OTA_BASE,true)!==WB_OTA_MAGIC)throw Error('WB OTA end marker invalid');
 if(WB_OTA_BASE+Math.ceil(image.length/4096)*4096>0x08000000+limit)throw Error('WB OTA exceeds application budget');
 return {image,base:WB_OTA_BASE,bytes:image.length,pages:Math.ceil(image.length/4096),tag,verifiedOnDevice:false};
}
export async function discoverWbOta(bluetooth=navigator.bluetooth){
 if(!bluetooth?.requestDevice)throw Error('Web Bluetooth unavailable');
 const d=await bluetooth.requestDevice({filters:[{services:[WB_OTA_UUID.service]}]});
 try{
  const server=await d.gatt.connect(),svc=await server.getPrimaryService(WB_OTA_UUID.service);
  const addr=await svc.getCharacteristic(WB_OTA_UUID.address),conf=await svc.getCharacteristic(WB_OTA_UUID.confirmation),data=await svc.getCharacteristic(WB_OTA_UUID.data);
  if(!addr.properties.writeWithoutResponse||!conf.properties.indicate||!data.properties.writeWithoutResponse)throw Error('WB OTA service properties mismatch');
  return {service:WB_OTA_UUID.service,compatibleCharacteristics:true,identityVerified:false,capacityVerified:false};
 }finally{if(d.gatt?.connected)d.gatt.disconnect();}
}

// AN5247 app-only transfer for a manually prepared, compatible BLE_Ota loader.
// No reboot request in normal app, no CPU2/FUS upload, no retry after failure.
// The confirmation means the loader requests reboot, not host readback.
export async function transferWbOta(name,ranges,limitKiB,{approve,progress=()=>{},bluetooth=navigator.bluetooth,wait=ms=>new Promise(r=>setTimeout(r,ms)),timeoutMs=15000}={}){
 const x=checkWbOtaImage(name,ranges,limitKiB);
 if(typeof approve!=='function'||!bluetooth?.requestDevice)throw Error('WB OTA requires explicit approval');
 const d=await bluetooth.requestDevice({filters:[{services:[WB_OTA_UUID.service]}]});
 let conf,handler,signal,timer,finished=false;
 try{
  const server=await d.gatt.connect(),svc=await server.getPrimaryService(WB_OTA_UUID.service);
  const addr=await svc.getCharacteristic(WB_OTA_UUID.address),data=await svc.getCharacteristic(WB_OTA_UUID.data);conf=await svc.getCharacteristic(WB_OTA_UUID.confirmation);
  if(!addr.properties.writeWithoutResponse||!data.properties.writeWithoutResponse||!conf.properties.indicate)throw Error('WB OTA service properties mismatch');
  if(await approve({deviceName:d.name||'BLE OTA',pages:x.pages,bytes:x.bytes,appKiB:limitKiB})!==true)return {cancelled:true};
  let resolveSignal;signal=new Promise(r=>{resolveSignal=r;});
  handler=e=>{const v=e.target.value;if(finished&&v?.byteLength===1&&v.getUint8(0)===1)resolveSignal(true);};
  conf.addEventListener('characteristicvaluechanged',handler);await conf.startNotifications();
  const send=async(ch,b)=>{
   if(!d.gatt.connected)throw Error('WB OTA disconnected; state unknown');
   let t;try{await Promise.race([ch.writeValueWithoutResponse(b),new Promise((_,reject)=>{t=setTimeout(()=>reject(Error('WB OTA write timeout; state unknown')),timeoutMs);})]);}finally{clearTimeout(t);}
  };
  await send(addr,Uint8Array.of(2,0,0x70,0));await wait(30);
  // 20-byte packets fit the minimum ATT MTU without negotiating a larger one.
  for(let i=0;i<x.image.length;i+=20){await send(data,x.image.slice(i,i+20));await wait(15);progress(Math.min(i+20,x.bytes)/x.bytes*.95);}
  finished=true;
  await send(addr,Uint8Array.of(7,0,0,0));
  const ok=await Promise.race([signal,new Promise(r=>{timer=setTimeout(()=>r(false),timeoutMs);})]);
  if(!ok)throw Error('WB OTA no reboot confirmation; device state unknown, do not automatically retry');
  progress(1);return {accepted:true,readbackVerified:false,bytes:x.bytes};
 }finally{clearTimeout(timer);if(handler)conf.removeEventListener('characteristicvaluechanged',handler);if(d.gatt?.connected)d.gatt.disconnect();}
}
