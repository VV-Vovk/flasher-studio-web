import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sha256Hex} from '../public/safety.js';
import {zipStored,fetchBootRelease} from '../public/recovery-integration.js';
import {localEspEntry,verifyLocalEsp} from '../public/local-esp.js';
const c=JSON.parse(readFileSync(new URL('../public/boot-catalog.json',import.meta.url),'utf8')).packages.map(x=>({...x,id:x.manifest.id+'@'+x.manifest.version}));
const layouts=JSON.parse(readFileSync(new URL('../public/recovery-layouts.json',import.meta.url),'utf8'));
const base=c.find(x=>x.id==='esp32c3-recovery-wifi-ble-4mb@0.2.1'),enc=new TextEncoder();
async function candidate(){
 const m=structuredClone(base.manifest);m.id+='-gpio5-hold0s';m.version='0.2.3';m.target.activationGpio=5;m.target.holdSeconds=0;m.validation='local-build-not-hardware-tested';m.source={localBuild:true,redistributionReview:'HOLD',sourceRepo:'https://github.com/VV-Vovk/flasher-studio-bootloaders-public',sourceCommit:'a'.repeat(40),sdkImage:'espressif/idf@sha256:4317595a911886e04cbc6d731315d5fc2918e510b6733fc7d03381ab2d270082'};
 const files=new Map();const layout=layouts[base.id];
 for(const f of m.files){let b=new Uint8Array(32);if(f.role==='partition-table'){b=new Uint8Array((layout.records.length+1)*32).fill(255);for(const [i,[t,s,a,n,name,flags]] of layout.records.entries()){let v=new DataView(b.buffer,i*32,32);v.setUint16(0,0x50aa,true);v.setUint8(2,t);v.setUint8(3,s);v.setUint32(4,a,true);v.setUint32(8,n,true);b.fill(0,i*32+12,i*32+28);b.set(enc.encode(name),i*32+12);v.setUint32(28,flags,true);}}else if(['bootloader','recovery'].includes(f.role)){b[0]=0xe9;b[12]=5;}f.size=b.length;f.sha256=await sha256Hex(b);files.set(f.file,b);}
 const csv=enc.encode(layout.csv);m.partitionTable={file:'partitions.csv',size:csv.length,sha256:await sha256Hex(csv)};files.set('partitions.csv',csv);
 const notice=enc.encode('DRAFT; LOCAL TEST ONLY');m.notices={file:'THIRD_PARTY_NOTICES.txt',size:notice.length,sha256:await sha256Hex(notice)};files.set(m.notices.file,notice);files.set('LICENSE',enc.encode('Apache License'));files.set('manifest.json',enc.encode(JSON.stringify(m)));const bytes=zipStored(files);
 return {bytes,catalog:{schemaVersion:1,releaseState:'local-only-review-hold',packages:[{manifest:m,package:{file:m.id+'-0.2.3.zip',size:bytes.length,sha256:await sha256Hex(bytes)}}]}};
}
test('Exact local C3 profile, notice, partition and image verification',async()=>{
 const x=await candidate(),r=await verifyLocalEsp(x.catalog,x.bytes,c,layouts);
 assert.equal(r.entry.manifest.target.holdSeconds,0);assert.equal(r.entry.manifest.target.activationGpio,5);assert.equal(r.entry.localOnly,true);assert.equal(r.image.images.length,4);
 await assert.rejects(fetchBootRelease('secret',r.entry,()=>{throw Error('network called')}),/Локальный пакет/);
 const changed=x.bytes.slice();changed[12]^=1;await assert.rejects(verifyLocalEsp(x.catalog,changed,c,layouts),/SHA-256/);
 const p=structuredClone(x.catalog.packages[0]);p.manifest.target.activationGpio=9;assert.throws(()=>localEspEntry(p,c,layouts));
});
