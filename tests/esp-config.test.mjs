import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const src=html.match(/const ESP_PINS30=[\s\S]*?let espCfgChip30=/)[0].replace('let espCfgChip30=','');
const ctx=vm.runInNewContext(src+'\n({espDefaults30,espMatches30});');
const cat=JSON.parse(readFileSync(new URL('../public/boot-catalog.json',import.meta.url),'utf8')).packages;
test('ESP defaults and exact configuration; no fallback to different hold, GPIO or radio',()=>{
 for(const chip of ['esp32c3','esp32s3','esp32c6']){
 const d=ctx.espDefaults30(chip);
 assert.equal(d.flash,4);assert.equal(d.radio,'wifi-ble');assert.equal(d.gpio,chip==='esp32c6'?2:4);assert.equal(d.hold,3);
 assert.ok(ctx.espMatches30(cat,chip,d).length);
 assert.equal(ctx.espMatches30(cat,chip,{...d,hold:0}).length,0);
 assert.equal(ctx.espMatches30(cat,chip,{...d,gpio:99}).length,0);
 assert.ok(ctx.espMatches30(cat,chip,{...d,radio:'wifi'}).every(x=>x.manifest.update.transports.length===1));
 }
});
test('Reset control restores defaults and guards unmatched selections',()=>{
 assert.ok(html.includes("espCfg30=espDefaults30(espCfgChip30);catalogId14='';renderOperation14()"));
 assert.ok(html.includes('if(espSync30()&&!matchingBoots14().some'));
});
