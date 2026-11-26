import test from 'node:test';
import assert from 'node:assert/strict';
import {wiredRoute,requestWiredPort} from '../public/serial-routing.js';
import {UsbUartPort,BRIDGE_FILTERS} from '../public/usb-uart.js';
class CDC{constructor(d){this.device=d;}}
const vendor={UsbCdcPort:CDC};
const bridge={vendorId:0x1a86,productId:0x7523};
const cdc={vendorId:0x303a,productId:0x1001,configurations:[{interfaces:[
 {alternates:[{interfaceClass:2,interfaceSubclass:2}]},
 {alternates:[{interfaceClass:10,endpoints:[{type:'bulk',direction:'in'},{type:'bulk',direction:'out'}]}]}
]}]};
function mobile(device){const calls=[];return {calls,nav:{userAgentData:{platform:'Android'},serial:{requestPort(){assert.fail('Bluetooth/native picker on Android');}},usb:{requestDevice(o){calls.push(o);return Promise.resolve(device);}}}};}
test('Android auto chooses only WebUSB even with navigator.serial present; routes bridge and native ESP CDC',async()=>{
 for(const device of [bridge,cdc]){
  const {nav,calls}=mobile(device);
  assert.equal(wiredRoute('auto',nav,vendor),'usb-auto');
  const p=await requestWiredPort('auto',nav,vendor);
  assert.ok(p instanceof (device===bridge?UsbUartPort:CDC));
  assert.equal(calls.length,1);assert.deepEqual(calls[0].filters,[...BRIDGE_FILTERS,{classCode:2,subclassCode:2}]);
 }
});
test('Android explicit modes and missing API; no Bluetooth fallback on cancellation',async()=>{
 const b=mobile(bridge),c=mobile(cdc);
 assert.ok(await requestWiredPort('bridge',b.nav,null) instanceof UsbUartPort);
 assert.ok(await requestWiredPort('cdc',c.nav,vendor) instanceof CDC);
 assert.equal(wiredRoute('auto',{userAgent:'Mozilla Android',serial:b.nav.serial},vendor),'');
 await assert.rejects(requestWiredPort('auto',{...b.nav,usb:{requestDevice:()=>Promise.reject(Error('cancelled'))}},vendor),/cancelled/);
 await assert.rejects(requestWiredPort('auto',mobile({vendorId:1,productId:2}).nav,vendor),/не имеет/);
});
test('Desktop keeps existing native COM route and rejects a selected RFCOMM port',async()=>{
 const port={getInfo:()=>({usbVendorId:0x10c4,usbProductId:0xea60})};
 const nav={userAgent:'Desktop',serial:{requestPort:()=>port}};
 assert.equal(wiredRoute('auto',nav,vendor),'native');assert.equal(await requestWiredPort('auto',nav,vendor),port);
 nav.serial.requestPort=()=>({getInfo:()=>({bluetoothServiceClassId:'spp'})});
 await assert.rejects(requestWiredPort('auto',nav,vendor),/Bluetooth/);
 const n={usb:mobile(cdc).nav.usb};assert.ok(await requestWiredPort('auto',n,vendor) instanceof CDC);
});
test('Ambiguous CDC interfaces are rejected before creating a port',async()=>{
 const d=structuredClone(cdc);d.configurations[0].interfaces.push(d.configurations[0].interfaces[1]);
 await assert.rejects(requestWiredPort('auto',mobile(d).nav,vendor),/однозначного/);
});
