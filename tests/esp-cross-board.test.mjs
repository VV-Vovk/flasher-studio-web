import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {catalogBoardOverride,validateEspMergedImage} from '../public/programmers.js';
const meta={board:'ESP32C3 Dev Module',chip:'ESP32-C3',family:'ESP32'};
const target={board:'ESP32-C3 Super Mini',alternateBoard:'ESP32-C3 Super Mini',chip:'esp32c3',family:'ESP32'};
const session={kind:'esp',chip:'esp32c3',flash:4*1048576};
function image(id=5,capacity=2){const b=new Uint8Array(0x10020);for(const off of [0,0x10000]){b[off]=0xe9;b[off+1]=1;b[off+3]=capacity<<4;b[off+12]=id;}return b;}
test('ESP32 exact same MCU with different board requires explicit override',()=>{
 assert.equal(catalogBoardOverride(meta,target,session,'ESP32-C3'),true);
 assert.equal(catalogBoardOverride({...meta,board:target.board},target,session,'ESP32-C3'),false);
});
test('Cross-board exception rejects wrong or unknown chips, Recovery and non-ESP32 paths',()=>{
 for(const [m,t,s,c] of [
  [meta,target,{...session,chip:'esp32s3'},'ESP32-C3'],
  [meta,target,session,'ESP32-S3'],
  [meta,target,session,''],
  [{...meta,chip:'ESP32-S3'},target,session,'ESP32-C3'],
  [{...meta,family:'STM32'},target,session,'ESP32-C3'],
  [{...meta,recoveryLayout:'recovery'},target,session,'ESP32-C3'],
  [meta,target,{...session,kind:'ble'},'ESP32-C3'],
  [meta,target,{...session,kind:'stm'},'ESP32-C3'],
  [meta,{...target,family:'ESP8266',chip:'esp8266'},{...session,chip:'esp8266'},'ESP8266']
 ])assert.throws(()=>catalogBoardOverride(m,t,s,c),/Профиль прошивки/);
});
test('Cross-board full image must match hardware chip, configured capacity and actual flash bounds',()=>{
 assert.doesNotThrow(()=>validateEspMergedImage(session,image(),{crossBoard:true}));
 assert.throws(()=>validateEspMergedImage(session,image(9),{crossBoard:true}),/chip ID/);
 assert.throws(()=>validateEspMergedImage(session,image(5,3),{crossBoard:true}),/Размер Flash/);
 assert.throws(()=>validateEspMergedImage(session,image(5,15),{crossBoard:true}),/Размер Flash/);
 assert.throws(()=>validateEspMergedImage({...session,flash:65536},image(),{crossBoard:true}),/Flash/);
 const bad=image();bad[0x10000]=0;assert.throws(()=>validateEspMergedImage(session,bad,{crossBoard:true}),/merged BIN/);
});
test('UI validates checksum and image before cross-board confirmation and any flash/history mutation',()=>{
 const h=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const fn=h.slice(h.indexOf('async function firmwareBytes(s)'),h.indexOf("$('flash').onclick=async()=>{if(hwBusy"));
 assert.match(fn,/catalogBoardOverride/);assert.match(fn,/shaReal\(bytes\)!==meta.sha256/);assert.match(fn,/universal.checkArtifact/);
 const line=h.split("$('flash').onclick=async()=>{if(hwBusy")[1].split('\n')[0];
 const pre=line.indexOf('validateEspMergedImage'),confirm=line.indexOf('crossBoard&&!fsLocale.confirm'),mutate=line.indexOf('d.app=null'),write=line.indexOf('driver.espProgram');
 assert.ok(pre>=0&&pre<confirm&&confirm<mutate&&mutate<write);
});

test('Case and outer whitespace do not turn an identical ESP32 profile into another board',()=>{
 assert.equal(catalogBoardOverride({...meta,board:'  esp32-c3 super mini '},target,session,'ESP32-C3'),false);
 assert.equal(catalogBoardOverride({...meta,board:'ESP32-C3 SuperMini'},target,session,'ESP32-C3'),true);
 assert.throws(()=>catalogBoardOverride({...meta,board:'  esp32-c3 super mini ',chip:'ESP32-S3'},target,session,'ESP32-S3'),/Профиль прошивки/);
});
test('Selected firmware shows the original build board and current target, without modifying metadata',()=>{
 const h=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const s=h.slice(h.indexOf('function updateFirmware17()'),h.indexOf('function chooseFirmware17('));
 assert.match(s,/Плата сборки: /);assert.match(s,/x\.board/);assert.match(s,/board12\(target12\(\)\)/);assert.match(s,/x\.fqbn/);assert.doesNotMatch(s,/x\.board\s*=(?!=)/);
});
