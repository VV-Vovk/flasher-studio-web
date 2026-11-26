// Read-only AN5185 rev15 table 9, first 32 bytes. No CPU2 start/state commands.
import {wbSharedBounds} from './wb-memory.js';
const A=0x20030000;
function version(x){return x===0||x===0xffffffff?null:{major:x>>>24,minor:x>>>16&255,patch:x>>>8&255,branch:x>>>4&15,build:x&15};}
export function decodeWbDeviceInfo(b){
 if(!(b instanceof Uint8Array)||b.length!==32)throw Error('WB device info length');
 const v=new DataView(b.buffer,b.byteOffset,b.byteLength),g=o=>v.getUint32(o,true);
 if(g(0)!==0xa94656b9)throw Error('WB FUS table not valid (bootloader/FUS may not be running)');
 if(![0,1,2,3,4,255].includes(b[5])||![0,1,255].includes(b[6])||!version(g(12)))throw Error('WB FUS table state/version invalid');
 const absent=g(20)===0xffffffff;
 if(absent!==(g(24)===0xffffffff)||absent!==(g(28)===0xffffffff)||absent&&b[7]!==0)throw Error('WB inconsistent wireless stack table');
 const mem=x=>({sram2bKiB:x>>>24,sram2aKiB:x>>>16&255,flashPages:x&0x7fff});
 const fusMemory=mem(g(16)),wirelessMemory=absent?null:mem(g(24));
 if([fusMemory,wirelessMemory].filter(Boolean).some(x=>x.sram2aKiB>32||x.sram2bKiB>32||x.flashPages>256))throw Error('WB table memory fields invalid');
 return {lastFusState:b[5],lastWirelessState:b[6],stackType:b[7],safeBoot:version(g(8)),fus:version(g(12)),wireless:absent?null:version(g(20)),fusMemory,wirelessMemory,reportedOnly:true};
}
export async function readWbRadioInfo(s){
 if(!s.pr?.sharedLayout)throw Error('WB FUS SRAM layout not reviewed');
 const reg=async a=>{const b=await s.read(a,4);if(b.length!==4)throw Error('WB short register');return new DataView(b.buffer,b.byteOffset,b.byteLength).getUint32(0,true);};
 const snapshot=async()=>[await reg(0x58004084),await reg(0x5800403c)];
 const [rv,ipcc]=await snapshot(),bounds=wbSharedBounds(rv,ipcc);
 if(!bounds.ipccDefault||A+4>bounds.aEnd)throw Error('WB FUS table location unavailable');
 const ptr=await reg(A);
 if(ptr%4||ptr<A+4||ptr+32>bounds.aEnd)throw Error('WB FUS table pointer outside public SRAM2a');
 const b=await s.read(ptr,32),again=await s.read(ptr,32);
 if(b.length!==32||!b.every((x,i)=>x===again[i])||await reg(A)!==ptr||JSON.stringify(await snapshot())!==JSON.stringify([rv,ipcc]))throw Error('WB FUS table changed while reading');
 return decodeWbDeviceInfo(b);
}
export function formatWbVersion(v){return v?[v.major,v.minor,v.patch].join('.')+' ('+v.branch+'/'+v.build+')':'не определена';}
