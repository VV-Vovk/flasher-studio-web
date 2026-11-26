import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const policy=html.match(/function bootInstallRoute27\([\s\S]*?\/\/ End boot installation policy\./)[0];
const route=vm.runInNewContext(policy+'\nbootInstallRoute27;');
const catalog=JSON.parse(readFileSync(new URL('../public/boot-catalog.json',import.meta.url),'utf8')).packages.map(x=>({...x,id:x.manifest.id+'@'+x.manifest.version}));
test('No boot installation for unselected target, missing catalog or ROM-only profiles',()=>{
 for(const t of [{selected:false,espChip:'esp32c3'},{selected:true},{selected:true,espChip:'esp32'},{selected:true,espChip:'esp32s2'},{selected:true,espChip:'esp32h2'},{selected:true,espChip:'esp8266'},{selected:true,stmPart:'STM32F103CBT6'},{selected:true,stmPart:'STM32F407VGT6'},{selected:true,avrId:'avr-uno'}])assert.equal(route(t,catalog),null);
 assert.equal(route({selected:true,espChip:'esp32c3'},[]),null);
});
test('Only supported ESP Recovery chips and valid flash sizes are offered',()=>{
 for(const espChip of ['esp32c3','esp32s3','esp32c6']){
   const p=route({selected:true,espChip},catalog);
   assert.equal(p.source,'catalog');assert.ok(p.entries.length);
   assert.ok(p.entries.every(x=>x.manifest.target.mcu===espChip));
 }
});
test('STM32 FS10 uses only the exact F103C8 target; AVR requires exact clock profile',()=>{
 const p=route({selected:true,stmPart:'STM32F103C8T6'},catalog);
 assert.equal(p.source,'catalog');assert.ok(p.entries.every(x=>x.manifest.id==='stm32f103c8-uart-recovery'));
 for(const m of ['atmega328','atmega328p'])for(const suffix of ['8mhz-internal','8mhz-external','16mhz-external']){
  const avrId='avr-'+m+'-urboot-'+suffix;const a=route({selected:true,avrId},catalog);
  assert.equal(a.source,'standard');assert.ok(a.entries.every(x=>x.manifest.id===avrId));
 }
});
test('Missing package checksum or unexpected auto-install is rejected',()=>{
 const c=catalog.find(x=>x.manifest.target.mcu==='esp32c3');
 assert.equal(route({selected:true,espChip:'esp32c3'},[{...c,package:{...c.package,sha256:''}}]),null);
 assert.equal(route({selected:true,espChip:'esp32c3'},[{...c,manifest:{...c.manifest,autoInstall:true}}]),null);
});
test('Initial install controls are hidden before catalog loading and source guards are wired',()=>{
 assert.match(html,/id="opBoot14" hidden/);
 assert.match(html,/id="deviceBootPanel14" hidden/);
 assert.match(html,/if\(!p&&operation14==='boot'\)/);
 assert.match(html,/source14!==p.source\|\|!p.wired.includes\(wired14\)/);
 const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
 for(const s of scripts)new vm.Script(s[1]);
});
