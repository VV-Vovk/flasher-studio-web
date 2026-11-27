// Micronucleus 2.x protocol, based on the published v2.6 protocol.
// v2 checks signature; v1 is explicitly limited to known 6012-byte Digispark geometry.
// USB setup packets carry two words at a time; no Flash readback command.
import {digisparkProfile} from './tiny-profiles.js';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
export function microInfo(b,p){
 if(!(b instanceof Uint8Array)||![6,8].includes(b.length))throw Error('Micronucleus info length');
 const usable=b[0]*256+b[1],page=b[2],start=Math.ceil(usable/page)*page,signature='1e'+[b[4],b[5]].map(v=>v.toString(16).padStart(2,'0')).join('');
 if(signature!==p.signature||page!==p.page||usable<1024||start>=p.flash||p.flash-start<512||start-usable<4||start-usable>8||!b[3]||(b[3]&128))throw Error('Micronucleus geometry/signature unsupported');
 const delay=(b[3]&127)+2;
 return {usable,page,start,signature,delay,eraseDelay:Math.ceil(start/page)*delay,max:Math.min(usable,p.max),flash:p.flash};
}
export function microLegacyInfo(b,p){
 if(!(b instanceof Uint8Array)||b.length!==4||p.signature!=='1e930b'||p.trinket||b[0]*256+b[1]!==6012||b[2]!==64||!b[3]||(b[3]&128))throw Error('Micronucleus 1.x: only 6012-byte Digispark geometry supported');
 const delay=b[3]+2;return {usable:6012,max:6012,page:64,start:6016,signature:null,delay,eraseDelay:94*delay,flash:8192,legacy:true};
}
export function microPlan(image,g){
 if(!(image instanceof Uint8Array)||image.length<4||image.length>g.max)throw Error('Micronucleus application size');
 const v=new DataView(image.buffer,image.byteOffset,image.byteLength),w=v.getUint16(0,true);
 let entry;
 if((w&0xf000)===0xc000){let k=w&0xfff;if(k&0x800)k-=4096;entry=((1+k+g.flash/2)%(g.flash/2))*2;}
 else if(w===0x940c&&g.flash>8192)entry=v.getUint16(2,true)*2;
 else throw Error('Micronucleus reset vector must be RJMP/JMP');
 if(entry<2||entry+2>image.length||(image[entry]===255&&image[entry+1]===255))throw Error('Micronucleus reset destination outside application');
 const bytes=new Uint8Array(g.start).fill(255);bytes.set(image);if(g.legacy)return bytes;const d=new DataView(bytes.buffer);
 const jump=(from,to)=>0xc000|((to/2-from/2-1)&0xfff);
 if(g.start>8192){d.setUint16(0,0x940c,true);d.setUint16(2,g.start/2,true);d.setUint16(g.start-4,0x940c,true);d.setUint16(g.start-2,entry/2,true);}
 else{d.setUint16(0,jump(0,g.start),true);d.setUint16(g.start-4,jump(g.start-4,entry),true);}
 return bytes;
}
export class Micronucleus{
 constructor(device,p){this.device=device;this.p=p;this.used=false;}
 setup(request,value=0,index=0){return {requestType:'vendor',recipient:'device',request,value,index};}
 async info(){const v=this.device.deviceVersionMajor,minor=this.device.deviceVersionMinor*16+this.device.deviceVersionSubminor;if(v!==2&&(v!==1||!Number.isInteger(minor)||minor<3))throw Error('Micronucleus 1.3+ / 2.x required');const r=await this.device.controlTransferIn(this.setup(0),v===1?4:8);if(r.status!=='ok'||!r.data)throw Error('Micronucleus info unavailable');const b=new Uint8Array(r.data.buffer,r.data.byteOffset,r.data.byteLength);return v===1?microLegacyInfo(b,this.p):microInfo(b,this.p);}
 async out(request,value=0,index=0){const r=await this.device.controlTransferOut(this.setup(request,value,index),new Uint8Array(0));if(r.status!=='ok'||r.bytesWritten!==0)throw Error('Micronucleus transfer failed; reconnect manually');}
 async init(){const g=await this.info();if(this.g&&JSON.stringify(g)!==JSON.stringify(this.g))throw Error('Micronucleus geometry changed');this.g=g;return g.signature||'legacy-geometry-only';}
 async program(image,progress=()=>{}){
  if(this.used)throw Error('Micronucleus session already used');this.used=true;
  const g=await this.info();if(JSON.stringify(g)!==JSON.stringify(this.g))throw Error('Micronucleus geometry changed');
  const bytes=microPlan(image,g);
  // Caller already displayed destructive-write confirmation. No automatic retries.
  await this.out(2);await wait(g.eraseDelay+100);
  if(JSON.stringify(await this.info())!==JSON.stringify(g))throw Error('Micronucleus changed after erase');
  const v=new DataView(bytes.buffer);
  for(let a=0;a<g.start;a+=g.page){
   const b=bytes.subarray(a,a+g.page);
   if(a===g.start-g.page||b.some(x=>x!==255)){
    if(g.legacy){const r=await this.device.controlTransferOut(this.setup(1,g.page,a),b);if(r.status!=='ok'||r.bytesWritten!==b.length)throw Error('Micronucleus legacy page transfer');}
    else{await this.out(1,g.page,a);for(let i=a;i<a+g.page;i+=4)await this.out(3,v.getUint16(i,true),v.getUint16(i+2,true));}
    await wait(g.delay);
   }
   progress((a+g.page)/g.start);
  }
  // No readback in protocol. No automatic start command.
  return {transferred:true,verified:false};
 }
 async close(){if(this.device.opened)await this.device.close();}
}
export async function openMicronucleus(name,chip,usb=navigator.usb){
 const p=digisparkProfile(name,chip);if(!p||p.trinket||!usb?.requestDevice)throw Error('Micronucleus WebUSB unavailable');
 const d=await usb.requestDevice({filters:[{vendorId:0x16d0,productId:0x0753}]});
 if(d.vendorId!==0x16d0||d.productId!==0x0753)throw Error('Micronucleus USB VID/PID');
 const a=new Micronucleus(d,p);try{await d.open();if(!d.configuration)await d.selectConfiguration(1);await a.init();return a;}catch(e){await a.close().catch(()=>{});throw e;}
}
