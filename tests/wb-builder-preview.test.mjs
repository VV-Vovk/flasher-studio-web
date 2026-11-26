import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {UniversalBuilder,builderRefForRequest,WB_BUILDER_REF,checkWbBuildMetadata,checkWbFullProjectHex} from '../public/universal.js';
import {stmCompile} from '../public/target-support.js';
const catalog=JSON.parse(readFileSync(new URL('../public/stm32-targets.json',import.meta.url)));
const rid='a'.repeat(32),req={requestId:rid,engine:'stm32-bare',nativeTarget:'STM32WB55RGV6',ext:'c',builderRef:WB_BUILDER_REF};
test('WB preview exact templates, branch isolation and unsupported inputs',()=>{
 for(const x of catalog.filter(x=>x.family==='wb')){
  const name=x.name.replace('x','6');
  assert.equal(stmCompile(name,catalog),true,name);
  assert.equal(builderRefForRequest({...req,nativeTarget:name}),WB_BUILDER_REF);
 }
 for(const n of ['STM32WB55RG','STM32WB55RGVx','STM32WB55RGVA','STM32WB55RGX6','STM32WB99RGV6']){
  assert.equal(stmCompile(n,catalog),false,n);
  assert.throws(()=>builderRefForRequest({...req,nativeTarget:n}));
 }
 assert.throws(()=>builderRefForRequest({...req,builderRef:'main'}));
 assert.throws(()=>builderRefForRequest({...req,engine:'arduino'}));
 assert.throws(()=>builderRefForRequest({...req,ext:'ino'}));
 assert.equal(builderRefForRequest({engine:'stm32-bare',nativeTarget:'STM32F103C8T6',ext:'c'}),'main');
});
class Fake extends UniversalBuilder{
 constructor(){super('ghp_test','owner/private-builder');this.calls=[];this.private=true;}
 async api(path,method='GET',body){this.calls.push({path,method,body});
  if(path==='')return {private:this.private,full_name:this.repo};
  if(path==='/git/blobs')return {sha:'a'.repeat(40)};
  if(path.startsWith('/git/ref/heads/'))return {object:{sha:'b'.repeat(40)}};
  if(path==='/git/commits/'+'b'.repeat(40))return {tree:{sha:'c'.repeat(40)}};
  if(path==='/git/trees')return {sha:'d'.repeat(40)};
  if(path==='/git/commits')return {sha:'e'.repeat(40)};
  if(path.includes('/runs?'))return {workflow_runs:[{id:1,head_branch:'main',display_title:'Studio Compile '+rid},{id:2,head_branch:WB_BUILDER_REF,display_title:'Studio Compile '+rid}]};
  return {};
 }
}
test('WB upload, dispatch and run lookup stay on private preview branch',async()=>{
 const b=new Fake();
 await b.upload(req,new Blob(['int main(){}']));
 await b.dispatch(req);
 assert.equal((await b.findRun(rid,WB_BUILDER_REF)).id,2);
 assert.equal((await b.findRun(rid)).id,1);
 assert.ok(b.calls.some(c=>c.path==='/git/refs/heads/'+WB_BUILDER_REF&&c.method==='PATCH'&&c.body.force===false));
 assert.ok(!b.calls.some(c=>c.path==='/git/refs/heads/main'));
 assert.ok(b.calls.some(c=>c.path.endsWith('/dispatches')&&c.body.ref===WB_BUILDER_REF));
 b.private=false;b.calls=[];
 await assert.rejects(b.upload(req,new Blob(['x'])),/private Builder/);
 assert.equal(b.calls.length,1);
});
test('WB artifact metadata rejects mismatched CPU, SDK and memory budget',()=>{
 const m={target:req.nativeTarget,cubeTag:'v1.24.0',memory:{wbApplicationOnly:true,physicalFlashKiB:1024,ramKiB:192,flashKiB:32}};
 assert.doesNotThrow(()=>checkWbBuildMetadata(m,req));
 for(const b of [{...m,target:'STM32WB35CEU6A'},{...m,cubeTag:'v1.23.0'},{...m,memory:{...m.memory,wbApplicationOnly:false}},{...m,memory:{...m.memory,flashKiB:1024}},{...m,memory:{...m.memory,flashKiB:33}}])assert.throws(()=>checkWbBuildMetadata(b,req));
});

test('UI keeps legacy polling independent and saves WB request format for artifact revalidation',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const legacy=html.split('async function liveFollow(c,r){')[1].split('\n')[0];
 const preview=html.split('async function followUniversal(c,r){')[1].split('\n')[0];
 const save=html.split('async function saveUniversal(r,bytes){')[1].split('\n')[0];
 assert.match(legacy,/c\.findRun\(r\.requestId\);/);
 assert.doesNotMatch(legacy,/builderRefForRequest/);
 assert.match(preview,/c\.findRun\(r\.requestId,universal\.builderRefForRequest\(r\)\)/);
 assert.match(save,/ext:r\.ext,builderRef:universal\.builderRefForRequest\(r\)/);
});

test('WB full project routes only portable ZIP to private preview and validates actual HEX',()=>{
 const full={...req,engine:'stm32cubeide-gcc',ext:'zip'};
 assert.equal(builderRefForRequest(full),WB_BUILDER_REF);
 assert.throws(()=>builderRefForRequest({...full,ext:'c'}));
 const memory={wbApplicationOnly:true,physicalFlashKiB:1024,ramKiB:192,flashKiB:32};
 const ranges=[{start:0x08000000,endExclusive:0x08000008,size:8}];
 const m={target:req.nativeTarget,memory,wbFullProject:true,wbFlashRanges:ranges};
 assert.doesNotThrow(()=>checkWbBuildMetadata(m,full));
 assert.throws(()=>checkWbBuildMetadata({...m,wbFullProject:false},full));
 assert.throws(()=>checkWbBuildMetadata({...m,wbFlashRanges:[{start:0x08000000,endExclusive:0x08010000,size:65536}]},full));
 function rec(a,t,b=[]){const row=[b.length,a>>8,a&255,t,...b];row.push((-row.reduce((x,y)=>x+y,0))&255);return ':'+row.map(x=>x.toString(16).padStart(2,'0')).join('')+'\n';}
 const text=rec(0,4,[8,0])+rec(0,0,[0,0,3,32,1,0,0,8])+rec(0,1);
 const files=new Map([['firmware.hex',new TextEncoder().encode(text)]]);
 assert.doesNotThrow(()=>checkWbFullProjectHex(m,files));
 assert.throws(()=>checkWbFullProjectHex({...m,wbFlashRanges:[{...ranges[0],endExclusive:0x08000010,size:16}]},files));
 const h=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(h,/if\(r\.m\.build\.wbFullProject\)\{const b=r\.m\.build;if\(!b\.wbMemoryAudit/);
});
