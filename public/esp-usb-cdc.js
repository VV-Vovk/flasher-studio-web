// Narrow WebUSB CDC adapter for Espressif USB Serial/JTAG (303a:1001).
// Stop issuing transfers when cancelled. Closing USB releases its interfaces;
// do not send a DTR/RTS reset sequence as part of close.
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function ok(r){if(r?.status!=='ok')throw Error('ESP USB transfer failed');return r;}
export function isEspUsbCdc(d){return d?.vendorId===0x303a&&d.productId===0x1001;}
export class EspUsbCdcPort{
 constructor(device){if(!isEspUsbCdc(device))throw Error('Not ESP USB Serial/JTAG');this.device=device;this.readable=null;this.writable=null;this.generation=0;this.active=false;this.closeTask=null;}
 getInfo(){return {usbVendorId:this.device.vendorId,usbProductId:this.device.productId};}
 async control(request,value,data){const r=ok(await this.device.controlTransferOut({requestType:'class',recipient:'interface',request,value,index:this.controlInterface},data));if(data&&r.bytesWritten!==data.byteLength)throw Error('ESP USB incomplete control transfer');}
 async open(o){
  if(this.active||this.device.opened)throw Error('ESP USB already open');
  if(this.closeTask)await this.closeTask;
  this.closeTask=null;
  if(!Number.isInteger(o.baudRate)||o.baudRate<=0||o.baudRate>4000000||![7,8].includes(o.dataBits??8)||![1,2].includes(o.stopBits??1)||!['none','odd','even'].includes(o.parity??'none')||(o.flowControl&&o.flowControl!=='none'))throw Error('ESP USB serial options');
  const d=this.device;
  try{
   await d.open();if(!d.configuration)await d.selectConfiguration(1);
   const ifs=d.configuration.interfaces,ctrl=ifs.filter(i=>i.alternate.interfaceClass===2&&i.alternate.interfaceSubclass===2),bulk=ifs.filter(i=>i.alternate.interfaceClass===10&&['in','out'].every(dir=>i.alternate.endpoints.some(e=>e.direction===dir&&e.type==='bulk')));
   if(ctrl.length!==1||bulk.length!==1||ctrl[0].interfaceNumber===bulk[0].interfaceNumber)throw Error('ESP USB ambiguous CDC interfaces');
   this.controlInterface=ctrl[0].interfaceNumber;
   const i=bulk[0],rx=i.alternate.endpoints.filter(e=>e.type==='bulk'&&e.direction==='in'),tx=i.alternate.endpoints.filter(e=>e.type==='bulk'&&e.direction==='out');
   if(rx.length!==1||tx.length!==1)throw Error('ESP USB ambiguous bulk endpoints');
   await d.claimInterface(this.controlInterface);await d.claimInterface(i.interfaceNumber);
   const line=new Uint8Array(7),v=new DataView(line.buffer);v.setUint32(0,o.baudRate,true);line[4]=(o.stopBits??1)===2?2:0;line[5]={none:0,odd:1,even:2}[o.parity??'none'];line[6]=o.dataBits??8;
   await this.control(0x20,0,line);
   this.active=true;this.dtr=false;this.rts=false;
   await this.setSignals({dataTerminalReady:true});
   const gen=++this.generation,active=()=>this.active&&gen===this.generation;
   let cancelled=false;
   this.stopRead=()=>{cancelled=true;};
   this.readable=new ReadableStream({type:'bytes',pull:async c=>{
    try{while(active()&&!cancelled){const r=ok(await d.transferIn(rx[0].endpointNumber,4096));if(!active()||cancelled)return;
     if(r.data?.byteLength){c.enqueue(new Uint8Array(r.data.buffer,r.data.byteOffset,r.data.byteLength).slice());return;}await wait(2);
    }}catch(e){if(active()&&!cancelled)c.error(e);}
   },cancel(){cancelled=true;}});
   this.writable=new WritableStream({write:async b=>{
    if(!active())throw Error('ESP USB closed');
    if(!(b instanceof Uint8Array))throw Error('ESP USB invalid bytes');
    for(let p=0;p<b.length;p+=4096){if(!active())throw Error('ESP USB closed');const chunk=b.subarray(p,p+4096),r=ok(await d.transferOut(tx[0].endpointNumber,chunk));if(r.bytesWritten!==chunk.length)throw Error('ESP USB incomplete write');}
   }});
  }catch(e){void this.close().catch(()=>{});throw e;}
 }
 async setSignals(s){
  if(!this.active)throw Error('ESP USB closed');
  const dtr=s.dataTerminalReady??this.dtr,rts=s.requestToSend??this.rts;
  if(s.dataTerminalReady!==undefined||s.requestToSend!==undefined){await this.control(0x22,(dtr?1:0)|(rts?2:0));this.dtr=dtr;this.rts=rts;}
  if(s.break!==undefined)await this.control(0x23,s.break?0xffff:0);
 }
 close(){
  if(this.closeTask)return this.closeTask;
  this.active=false;++this.generation;this.stopRead?.();
  const readable=this.readable,writable=this.writable;this.readable=null;this.writable=null;
  // Do not wait on a pending bulk IN before closing the USB device.
  if(readable&&!readable.locked)void readable.cancel().catch(()=>{});
  if(writable&&!writable.locked)void writable.abort().catch(()=>{});
  this.closeTask=(async()=>{if(this.device.opened)await this.device.close();if(this.device.opened)throw Error('ESP USB still open');})();
  return this.closeTask;
 }
}
