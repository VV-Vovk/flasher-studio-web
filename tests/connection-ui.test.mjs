import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('Unified connection screen exposes all enabled methods and keeps legacy handlers',()=>{
 assert.match(html,/<div class="seg" id="devMode" hidden>/);
 assert.ok(html.includes('proposed().filter(methodOK34)'));
 assert.ok(html.includes("if(methodSelected===WIFI_OTA&&fi===0)return wifiProbe62()"));
 assert.ok(html.includes("return oldConnect62()"));
 assert.ok(html.includes("return $('wifiWrite23').click()"));
 assert.ok(html.includes("return $('wbBleProbe43').click()"));
 assert.ok(html.includes("return $('nrfProbe50').click()"));
 assert.ok(html.includes("if(expected&&expected!==id)throw Error('Подключено другое устройство')"));
});
test('Inline application JavaScript parses',()=>{for(const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new Script(m[1]);});
