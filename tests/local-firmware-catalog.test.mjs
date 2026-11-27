import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {localFirmwareRecord,localFirmwareEligible,firmwareFilename,checkLocalFirmwareTarget} from '../public/real-build.js';
const target={board:'STM32F103C8T6',chip:'F1',family:'STM32'},session={kind:'stm',route:'swd',pr:{flash:65536}};
const input={filename:'my-project.HEX',bytes:new TextEncoder().encode(':00000001FF'),target,session,verified:true,now:1700000000000};
test('Preserve original HEX name, format and unknown version; duplicate ID stable',async()=>{
 const a=await localFirmwareRecord(input),b=await localFirmwareRecord({...input,now:1700001000000,filename:'copy.hex'});
 assert.equal(a.id,b.id);assert.equal(a.name,'my-project');assert.equal(a.fmt,'HEX');assert.equal(a.version,'—');assert.equal(firmwareFilename(a),'my-project.HEX');
 assert.equal(a.localFlash,65536);assert.equal(a.sha256.length,64);
 const c=await localFirmwareRecord({...input,bytes:Uint8Array.of(1,2,3)});
 assert.notEqual(a.id,c.id);assert.equal(a.projectId,c.projectId);
 assert.doesNotThrow(()=>checkLocalFirmwareTarget(a,target,session));
 assert.throws(()=>checkLocalFirmwareTarget(a,target,{...session,pr:{flash:131072}}),/конфигурации/);
 assert.throws(()=>checkLocalFirmwareTarget(a,target,{...session,route:'dfu'}),/конфигурации/);
});
test('No import after unverified or special transfers',async()=>{
 for(const s of [{kind:'ble'},{kind:'avr',route:'micro56'},{kind:'avr',route:'trinket58'}])assert.equal(localFirmwareEligible(s,true),false);
 await assert.rejects(localFirmwareRecord({...input,verified:false}),/не подтверждена/);
 await assert.rejects(localFirmwareRecord({...input,filename:'wrong.bin'}),/Некорректный/);
});
test('ESP BIN stored with same exact hardware capacity and no fake build metadata',async()=>{
 const target={board:'ESP32-C3 Super Mini',chip:'ESP32-C3',family:'ESP32'},session={kind:'esp',route:'usb',flash:4194304};
 const a=await localFirmwareRecord({...input,filename:'app.bin',target,session});
 assert.equal(firmwareFilename(a),'app.bin');assert.equal(a.localFile,true);assert.equal(a.universal,undefined);
 assert.doesNotThrow(()=>checkLocalFirmwareTarget(a,target,session));
 assert.throws(()=>checkLocalFirmwareTarget(a,target,{...session,flash:8388608}),/конфигурации/);
 assert.equal(firmwareFilename({universal:true}),'firmware.zip');assert.equal(firmwareFilename({}),'merged.bin');
});
test('Archive after verified hardware close, keep original bytes and device name',()=>{
 const h=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const fn=h.slice(h.indexOf('async function archiveLocal66'),h.indexOf("$('flash').onclick=async()=>{if(hwBusy"));
 assert.match(fn,/live.saveLocalFirmware\(input\)/);assert.match(fn,/d.app=appMeta12\(meta\)/);assert.doesNotMatch(fn,/d.name\s*=/);
 const line=h.split("$('flash').onclick=async()=>{if(hwBusy")[1].split('\n')[0];
 assert.match(line,/await dropHardware\(\);await archiveLocal66/);
 assert.match(line,/filename:originalFilename,bytes,target:localTarget/);
 assert.match(h,/id="saveLocal66" checked/);
});
