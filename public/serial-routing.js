// Wired serial routing. Android Web Serial can expose Bluetooth RFCOMM only.
// Never fall back to the Bluetooth chooser on a mobile USB connection.
import {BRIDGE_FILTERS,UsbUartPort} from './usb-uart.js';
import {EspUsbCdcPort,isEspUsbCdc} from './esp-usb-cdc.js';
export function isAndroid(nav){return nav?.userAgentData?.platform==='Android'||/Android/i.test(nav?.userAgent||'');}
const bridgeMatch=d=>BRIDGE_FILTERS.some(f=>f.vendorId===d.vendorId&&f.productId===d.productId);
const cdcFilter={classCode:2,subclassCode:2};
function cdcLayout(d){
 const interfaces=d.configurations?.[0]?.interfaces||[];
 const control=interfaces.filter(i=>i.alternates?.[0]?.interfaceClass===2&&i.alternates[0].interfaceSubclass===2);
 const data=interfaces.filter(i=>i.alternates?.[0]?.interfaceClass===10&&['in','out'].every(dir=>i.alternates[0].endpoints?.some(e=>e.direction===dir&&e.type==='bulk')));
 // Current polyfill takes the first interface of each class, so reject ambiguous configurations.
 return control.length===1&&data.length===1&&interfaces.filter(i=>i.alternates?.[0]?.interfaceClass===2).length===1&&interfaces.filter(i=>i.alternates?.[0]?.interfaceClass===10).length===1;
}
export function wiredRoute(mode,nav,vendor){
 const usb=!!nav?.usb?.requestDevice,cdc=typeof vendor?.UsbCdcPort==='function';
 if(mode==='bridge')return usb?'bridge':'';
 if(mode==='cdc')return usb&&cdc?'cdc':'';
 if(mode!=='auto')return '';
 if(!isAndroid(nav)&&nav?.serial?.requestPort)return 'native';
 return usb?(cdc?'usb-auto':''):'';
}
export async function requestWiredPort(mode,nav,vendor){
 const route=wiredRoute(mode,nav,vendor);
 if(route==='native'){
  const p=await nav.serial.requestPort();
  if(p.getInfo?.().bluetoothServiceClassId!==undefined)throw Error('Это Bluetooth-порт, а не проводное USB-подключение');
  return p;
 }
 if(!route)throw Error('USB-интерфейс недоступен. На Android необходим Chrome с WebUSB и USB OTG.');
 const filters=route==='bridge'?[...BRIDGE_FILTERS]:route==='cdc'?[cdcFilter]:[...BRIDGE_FILTERS,cdcFilter];
 const d=await nav.usb.requestDevice({filters});
 if(route!=='cdc'&&bridgeMatch(d))return new UsbUartPort(d);
 if(route!=='bridge'&&cdcLayout(d)){if(isAndroid(nav)&&isEspUsbCdc(d))return new EspUsbCdcPort(d);return new vendor.UsbCdcPort(d);}
 throw Error('USB-устройство не имеет поддерживаемого CH340 / CP210x или однозначного CDC-интерфейса');
}
export function wiredLabel(mode,nav,vendor){
 const r=wiredRoute(mode,nav,vendor);
 return r==='native'?'USB · системный последовательный порт (COM)':r==='bridge'?'USB-UART через WebUSB · CH340 / CP210x':r==='cdc'?'Native USB через WebUSB CDC':r==='usb-auto'?'Авто · USB OTG (CH340 / CP210x / CDC)':'USB недоступен · проверь Chrome и USB OTG';
}
