import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EspUsbCdcPort} from '../public/esp-usb-cdc.js';
import {createEspLifecycle,usbJournal,USB_LOG_KEY} from '../public/esp-lifecycle.js';
function fakeUSB(){
 const calls=[],d={vendorId:0x303a,productId:0x1001,opened:false,configuration:{interfaces:[
  {interfaceNumber:0,alternate:{interfaceClass:2,interfaceSubclass:2}},
  {interfaceNumber:1,alternate:{interfaceClass:10,endpoints:[{type:'bulk',direction:'in',endpointNumber:1},{type:'bulk',direction:'out',endpointNumber:2}]}}]},
  async open(){this.opened=true;calls.push('open');},async claimInterface(i){calls.push('claim'+i);},
  async controlTransferOut(s,b){calls.push(s.request);return {status:'ok',bytesWritten:b?.byteLength||0};},
  transferIn(){calls.push('read');return new Promise(r=>{this.finishRead=r;});},
  async transferOut(_ep,b){calls.push('write');return {status:'ok',bytesWritten:b.byteLength};},
  async close(){calls.push('close');this.opened=false;this.finishRead?.({status:'ok',data:new DataView(Uint8Array.of(1).buffer)});}
 };
 return {d,calls};
}
test('ESP USB closes pending read without sending control/reset requests; close is single-shot',async()=>{
 const {d,calls}=fakeUSB(),p=new EspUsbCdcPort(d);await p.open({baudRate:115200});
 assert.deepEqual(calls,['open','claim0','claim1',0x20,0x22]);
 const reader=p.readable.getReader(),read=reader.read();await Promise.resolve();
 assert.ok(calls.includes('read'));await reader.cancel();reader.releaseLock();await read;
 const n=calls.length;const a=p.close(),b=p.close();assert.equal(a,b);await a;
 assert.deepEqual(calls.slice(n),['close']);assert.equal(d.opened,false);assert.equal(p.readable,null);assert.equal(p.writable,null);
});
test('close failure and timeout block new operations without repeated close',async()=>{
 for(const mode of ['reject','hang','open']){
  const events=[],c=createEspLifecycle({timeout:10,journal:{record:e=>events.push(e)}});let calls=0;
  const s={transport:{device:{device:{opened:mode==='open'}},disconnect(){calls++;return mode==='reject'?Promise.reject(Error('x')):mode==='hang'?new Promise(()=>{}):Promise.resolve();}}};
  const a=c.close(s),b=c.close(s);assert.equal(a,b);assert.equal(c.blocked(),true);assert.equal(await a,false);assert.equal(calls,1);assert.equal(c.unsafe(),true);assert.equal(c.blocked(),true);
  assert.deepEqual(events,['close-start',mode==='hang'?'close-timeout':'close-error']);
 }
});
test('matching disconnect marks only the affected session; successful close releases gate',async()=>{
 const events=[],c=createEspLifecycle({journal:{record:e=>events.push(e)}}),raw={};
 const s={transport:{device:{device:raw},async disconnect(){}}};
 assert.equal(c.matches(s,{device:{}}),false);assert.equal(c.matches(s,{device:raw}),true);
 c.markLost(s);c.markLost(s);assert.throws(()=>c.assertLive(s),/отключён/);
 assert.equal(await c.close(s),true);assert.equal(c.blocked(),false);assert.deepEqual(events,['usb-disconnect','close-start','close-ok']);
});
test('persistent journal is bounded and excludes credentials and raw exception text',()=>{
 const m=new Map(),storage={getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};
 const j=usbJournal(storage);for(let i=0;i<100;i++)j.record('flash-verified',{chip:'esp32c3',token:'github_pat_secret',id:'secret',port:{getInfo:()=>({usbVendorId:0x303a,usbProductId:0x1001,serialNumber:'secret'})}});
 j.record('raw secret');assert.equal(j.read().length,80);assert.doesNotMatch(m.get(USB_LOG_KEY),/secret|github_pat/);assert.equal(usbJournal(storage).read().length,80);j.clear();assert.deepEqual(j.read(),[]);
});
test('ESP flash success/reset prompt occurs after close and no false flash failure on timeout',()=>{
 const h=readFileSync(new URL('../public/index.html',import.meta.url),'utf8'),line=h.split("$('flash').onclick=async()=>{if(hwBusy")[1].split('\n')[0];
 assert.match(line,/const closed=await dropHardware\(\);if\(closed\)\{logHW\('USB закрыт/);
 assert.match(line,/Запись проверена · USB не закрыт/);
 for(const script of h.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new Function(script[1]);
});

test('USB disconnect during closing is recorded and stream lock polling is bounded',async()=>{
 const events=[],c=createEspLifecycle({timeout:15,journal:{record:e=>events.push(e)}}),raw={};
 const original=async()=>assert.fail('unbounded original wait used');
 const t={device:{device:raw,readable:{locked:true}},waitForUnlock:original,async disconnect(){await this.waitForUnlock(400);}};
 const s={transport:t},task=c.close(s);
 assert.equal(c.observeClosingDisconnect({device:raw}),true);
 assert.equal(await task,false);assert.equal(c.blocked(),true);assert.ok(events.includes('usb-disconnect'));assert.ok(events.includes('close-timeout'));
 await new Promise(r=>setTimeout(r,35));assert.equal(t.waitForUnlock,original);
});
