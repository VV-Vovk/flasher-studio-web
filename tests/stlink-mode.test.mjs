import test from 'node:test';
import assert from 'node:assert/strict';
import {StLinkF1,openStLinkMemory} from '../public/extra-programmers.js';
const pause=async()=>{};
function fake(modes,{version=0x20,enter=0x80,failExit=false}={}){
 const calls=[],a=new StLinkF1({productId:0x3748},{});
 a.cmd=async (bytes,n=0,payload=null)=>{
  calls.push([bytes,n,payload]);
  if(bytes[0]===0xf1)return Uint8Array.of(version,0,0,0,0,0);
  if(bytes[0]===0xf5){assert.ok(modes.length,'unexpected mode query');return Uint8Array.of(modes.shift(),0);}
  if(bytes[0]===0xf3||bytes[0]===0xf4||bytes[1]===0x21){assert.equal(n,0);if(failExit)throw Error('USB disconnected');return null;}
  if(bytes[0]===0xf2&&bytes[1]===0x30){assert.deepEqual(bytes,[0xf2,0x30,0xa3]);return Uint8Array.of(enter,0);}
  assert.fail('Unexpected command, no write or erase allowed');
 };
 return {a,calls,commands:()=>calls.map(c=>c[0])};
}
test('Power-on DFU: leave once without reply; wait and confirm SWD',async()=>{
 const {a,commands}=fake([0,0,1,2]);await a.enterSwd(pause);
 assert.deepEqual(commands(),[[0xf1],[0xf5],[0xf3,7],[0xf5],[0xf5],[0xf2,0x30,0xa3],[0xf5]]);
});
test('Mass-storage, prior debug and SWIM modes enter SWD explicitly',async()=>{
 for(const [m,exit] of [[1,null],[2,[0xf2,0x21]],[3,[0xf4,1]]]){
  const {a,commands}=fake(m===1?[1,2]:[m,1,2]);await a.enterSwd(pause);
  assert.deepEqual(commands(),[[0xf1],[0xf5],...(exit?[exit,[0xf5]]:[]),[0xf2,0x30,0xa3],[0xf5]]);
 }
});
test('DFU stuck, USB lost, unsupported mode or bad SWD status fail closed',async()=>{
 for(const [modes,opts,expected] of [
  [[0,0,0,0,0],{},/не удалось выйти/],
  [[0],{failExit:true},/не отключая USB/],
  [[4],{},/неподдерживаемый режим/],
  [[1],{version:0x30},/ST-LINK\/V2/],
  [[1],{enter:0x81},/status/],
  [[1,1],{},/не подтверждён/]
 ]){
  const {a,commands}=fake(modes,opts);await assert.rejects(a.enterSwd(pause),expected);
  assert.ok(commands().filter(c=>c[0]===0xf3).length<=1);
  assert.ok(commands().every(c=>c[0]!==0xf2||[0x21,0x30].includes(c[1])));
 }
});
test('STM32 init calls identify only after confirmed SWD',async()=>{
 const {a}=fake([1,2]);let called=0;a.identify=async()=>{called++;return 'stm32-test';};
 assert.equal(await a.init(),'stm32-test');assert.equal(called,1);
 const bad=fake([1,1]).a;bad.identify=async()=>assert.fail('identify before SWD');await assert.rejects(bad.init(),/не подтверждён/);
});
test('Raw SWD path uses same mode transition and closes on failure',async()=>{
 const calls=[],modes=[1,2],device={vendorId:0x0483,productId:0x3748,opened:false,configuration:{interfaces:[{interfaceNumber:0,alternate:{interfaceClass:255,endpoints:[{direction:'in',type:'bulk',endpointNumber:1},{direction:'out',type:'bulk',endpointNumber:2}]}}]},
 async open(){this.opened=true;},async close(){this.opened=false;},async claimInterface(){},async transferOut(ep,b){calls.push([...b]);return {status:'ok',bytesWritten:b.length};},async transferIn(ep,n){const c=calls.at(-1),v=c[0]===0xf1?Uint8Array.of(0x20,0,0,0,0,0):c[0]===0xf5?Uint8Array.of(modes.shift(),0):Uint8Array.of(0x80,0);assert.equal(v.length,n);return {status:'ok',data:new DataView(v.buffer)};}};
 const usb={requestDevice:async()=>device};
 const session=await openStLinkMemory(usb);assert.equal(device.opened,true);await session.close();assert.equal(device.opened,false);
 modes.push(1,1);await assert.rejects(openStLinkMemory(usb),/не подтверждён/);assert.equal(device.opened,false);
});
