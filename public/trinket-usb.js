// Legacy Adafruit Trinket/Gemma bootloader: vendor USBtiny subset.
// Based on public protocol behavior, not a generic external USBtiny programmer.
// The first page is buffered and only finalized on exit: do not claim physical verification.
import {digisparkProfile} from './tiny-profiles.js';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export class TrinketUsb{
 constructor(d,p){this.device=d;this.p=p;this.used=false;}
 setup(request,value=0,index=0){return {requestType:'vendor',recipient:'device',request,value,index};}
 async input(req,val,idx,n){const r=await this.device.controlTransferIn(this.setup(req,val,idx),n);if(r.status!=='ok'||(r.data?.byteLength||0)!==n)throw Error('Trinket USB response');return n?new Uint8Array(r.data.buffer,r.data.byteOffset,n):new Uint8Array();}
 async spi(a,b,c=0,d=0){const r=await this.input(7,a|b<<8,c|d<<8,4);if(r[2]!==b)throw Error('Trinket SPI response');return r[3];}
 async init(){const sig=[];for(let i=0;i<3;i++)sig.push(await this.spi(0x30,0,i));if(sig.map(x=>x.toString(16).padStart(2,'0')).join('')!==this.p.signature)throw Error('Trinket signature mismatch');return this.p.signature;}
 async read(a,n){if(a<0||a%2||n<2||n%2||n>64||a+n>this.p.max)throw Error('Trinket read bounds');return this.input(9,0,a,n);}
 async program(image,progress=()=>{}){
  if(this.used||!(image instanceof Uint8Array)||image.length<4||image.length>this.p.max||(image[1]&0xf0)!==0xc0)throw Error('Trinket image bounds / RJMP reset vector');
  const w=(image[0]|image[1]<<8)&0xfff,entry=((1+(w&0x800?w-4096:w)+4096)%4096)*2;if(entry<2||entry+2>image.length)throw Error('Trinket reset target outside application');
  this.used=true;await this.init();await this.spi(0xac,0x80);await sleep(1000);
  const bytes=new Uint8Array(Math.ceil(image.length/64)*64).fill(255);bytes.set(image);
  for(let a=0;a<bytes.length;a+=64){const page=bytes.subarray(a,a+64),r=await this.device.controlTransferOut(this.setup(10,30000,a),page);if(r.status!=='ok'||r.bytesWritten!==64)throw Error('Trinket page transfer');const w=a/2;await this.spi(0x4c,w>>8,w&255);await sleep(40);progress(.8*(a+64)/bytes.length);}
  for(let a=0;a<bytes.length;a+=64){const r=await this.read(a,64);if(!r.every((v,i)=>v===bytes[a+i]))throw Error('Trinket bootloader readback mismatch');progress(.8+.2*(a+64)/bytes.length);}
  await this.input(6,0,0,0); // requests finalization, not proof of first-page commit or launch
  return {transferred:true,verified:false};
 }
 async close(){if(this.device.opened)await this.device.close();}
}
export async function openTrinket(name,chip,usb=navigator.usb){
 const p=digisparkProfile(name,chip);if(!p?.trinket||!usb?.requestDevice)throw Error('Trinket WebUSB unavailable');const d=await usb.requestDevice({filters:[{vendorId:0x1781,productId:0x0c9f}]});
 // External USBtinyISP shares VID/PID; do not send erase to it.
 if(d.vendorId!==0x1781||d.productId!==0x0c9f||d.manufacturerName!=='Adafruit'||d.productName!=='Trinket'||d.deviceVersionMajor!==1||d.deviceVersionMinor!==0||d.deviceVersionSubminor!==5)throw Error('Only original Adafruit Trinket/Gemma bootloader 1.05 supported');
 const a=new TrinketUsb(d,p);try{await d.open();if(!d.configuration)await d.selectConfiguration(1);await a.init();return a;}catch(e){await a.close().catch(()=>{});throw e;}
}
