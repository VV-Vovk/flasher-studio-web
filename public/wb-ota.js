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
