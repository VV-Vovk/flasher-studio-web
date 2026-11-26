import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fetchOfficialUrboot} from '../public/extra-programmers.js';
const catalog=JSON.parse(readFileSync(new URL('../public/boot-catalog.json',import.meta.url),'utf8')).packages;
const entry=catalog.find(x=>x.manifest.id==='avr-atmega328p-urboot-8mhz-internal'&&x.manifest.version==='0.2.1');
test('Urboot uses pinned official upstream, never bearer credentials, rejects wrong bytes',async()=>{
 let seen=false;
 await assert.rejects(fetchOfficialUrboot(entry,async(url,options)=>{
   seen=true;assert.equal(url,'https://raw.githubusercontent.com/MCUdude/MiniCore/0bb50f6a6648e37cbe53012c61322345847c2a03/avr/bootloaders/urboot/atmega328p/watchdog_1_s/autobaud/uart0_rxd0_txd1/led%2Bb5/urboot_atmega328p_pr_ee_ce.hex');
   assert.equal(options.credentials,'omit');assert.equal(options.headers,undefined);
   return {ok:true,arrayBuffer:async()=>new Uint8Array(1082).buffer};
 }),/SHA-256/);assert.ok(seen);
});
test('Reject arbitrary path, target or changed checksum before fetching',async()=>{
 const fetcher=async()=>{assert.fail('unexpected fetch')};
 for(const m of [{...entry.manifest,source:{...entry.manifest.source,originalFile:'evil.hex'}},{...entry.manifest,target:{...entry.manifest.target,mcu:'atmega2560'}},{...entry.manifest,files:[{...entry.manifest.files[0],sha256:'0'.repeat(64)}]}])await assert.rejects(fetchOfficialUrboot({...entry,manifest:m},fetcher));
});
