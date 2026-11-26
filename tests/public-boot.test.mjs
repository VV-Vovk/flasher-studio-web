import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fetchBootRelease,isPublicStmBoot,stmBootPackage} from '../public/recovery-integration.js';
const catalog=JSON.parse(readFileSync(new URL('../public/boot-catalog.json',import.meta.url),'utf8')).packages;
const zip=new URL('../public/boot-packages/stm32f103c8-uart-recovery-0.2.2.zip',import.meta.url);
const old=catalog.find(x=>x.manifest.id==='stm32f103c8-uart-recovery');
const e={...old,version:'0.2.2',manifest:{...old.manifest,version:'0.2.2'},package:{file:'stm32f103c8-uart-recovery-0.2.2.zip',size:7862,sha256:'a2c5a1e5b147fdad3a820e921ab071c52f86c15fc7196e8c37f2cd5b9acb1b33'}};
test('Public STM32 download uses same origin without token and rejects altered ZIP',async()=>{
 assert.ok(isPublicStmBoot(e));
 let seen=false;
 await assert.rejects(fetchBootRelease('do-not-send-this-token',e,async(url,options)=>{
   seen=true;assert.equal(url,'./boot-packages/stm32f103c8-uart-recovery-0.2.2.zip');
   assert.equal(options.credentials,'omit');assert.equal(options.headers,undefined);
   return {ok:true,arrayBuffer:async()=>new Uint8Array(7862).buffer};
 }),/SHA-256/);assert.ok(seen);
 assert.equal(isPublicStmBoot({...e,package:{...e.package,sha256:'0'.repeat(64)}}),false);
});
test('Staged released ZIP passes real STM32 installer validation',{skip:!existsSync(zip)},async()=>{
 const p=catalog.find(x=>x.manifest.id==='stm32f103c8-uart-recovery'&&x.manifest.version==='0.2.2');
 assert.ok(p);const entry={...p,version:p.manifest.version};
 assert.ok(isPublicStmBoot(entry));
 const bytes=new Uint8Array(readFileSync(zip));
 const result=await fetchBootRelease('',entry,async()=>({ok:true,arrayBuffer:async()=>bytes.buffer}));
 const checked=await stmBootPackage(result,entry);
 assert.ok(checked.image.length>8);
});
