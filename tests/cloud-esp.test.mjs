import test from 'node:test';
import assert from 'node:assert/strict';
import {dispatchCloud,findCloudRun,validateCloudRequest,validateResult,receiveCloud} from '../public/cloud-esp.js';
const r={requestId:'a'.repeat(32),repo:'VV-Vovk/flasher-studio-builder',target:'esp32c3',radio:'wifi-ble',flash:4,gpio:5,hold:0};
test('Private Builder dispatch uses exact settings and checks repository before POST',async()=>{
 const calls=[];const c={repo:r.repo,api:async(path,method,body)=>{calls.push({path,method,body});if(path==='')return {full_name:r.repo,private:true};if(path.endsWith('.yml'))return {state:'active'};return null;}};
 await dispatchCloud(c,r);
 assert.deepEqual(calls.at(-1).body,{ref:'main',inputs:{request_id:r.requestId,target:'esp32c3',radio:'wifi-ble',flash:'4',gpio:'5',hold:'0'}});
 await assert.rejects(dispatchCloud({...c,api:async()=>({full_name:r.repo,private:false})},r),/приватный/);
 assert.throws(()=>validateCloudRequest({...r,hold:6}));assert.throws(()=>validateCloudRequest({...r,target:'esp32s3'}));
});
test('Find only matching exact request and reject duplicates',async()=>{
 const c={repo:r.repo,api:async()=>({workflow_runs:[{display_title:'Studio Recovery '+r.requestId,id:7}]})};
 assert.equal((await findCloudRun(c,r)).id,7);
});
test('Reject result for altered profile and missing chunks',()=>{
 const d={schema:1,requestId:r.requestId,catalog:{releaseState:'local-only-review-hold',packages:[{manifest:{source:{sourceCommit:'ffd278c096256906119b27b604dfcc0b4087cb76'},target:{mcu:'esp32c3',flashBytes:4194304,activationGpio:5,holdSeconds:0},update:{transports:['wifi','ble']}},package:{size:4,sha256:'b'.repeat(64)}}]},chunks:[{file:'part-000.bin',size:4,sha256:'c'.repeat(64)}]};
 assert.equal(validateResult(d,r),d);assert.throws(()=>validateResult(d,{...r,hold:3}));assert.throws(()=>validateResult({...d,chunks:[]},r));
});
test('No result retrieval from public repository',async()=>{
 await assert.rejects(receiveCloud({repo:r.repo,api:async()=>({full_name:r.repo,private:false})},r,[],{}),/приватный/);
});
