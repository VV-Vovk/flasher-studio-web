// Private Builder cloud recovery. No public binary mirror, no saved GitHub token.
import {sameRepo,base64ToBytes} from './github-api.js';
import {sha256Hex} from './safety.js';
import {verifyLocalEsp} from './local-esp.js';
const WORKFLOW='build-esp-recovery.yml', SOURCE='ffd278c096256906119b27b604dfcc0b4087cb76', MAX=16*1024*1024;
const hash=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const rid=s=>typeof s==='string'&&/^[a-f0-9]{32}$/.test(s);
export function validateCloudRequest(r){
 if(!rid(r?.requestId)||r.target!=='esp32c3'||![4,8,16].includes(r.flash)||!['wifi','ble','wifi-ble'].includes(r.radio)||![3,4,5,6,7,10].includes(r.gpio)||!Number.isInteger(r.hold)||r.hold<0||r.hold>5)throw Error('Неверные параметры ESP Recovery');
 return r;
}
export async function checkPrivateBuilder(c){
 const repo=await c.api('');
 if(repo?.private!==true||!repo.full_name||!sameRepo(repo.full_name,c.repo))throw Error('Для Recovery нужен твой приватный Builder. Публичный репозиторий запрещён.');
 return repo;
}
export async function dispatchCloud(c,r){
 validateCloudRequest(r);if(!sameRepo(c.repo,r.repo))throw Error('Выбран другой Builder');
 await checkPrivateBuilder(c);
 const w=await c.api('/actions/workflows/'+WORKFLOW);
 if(w?.state!=='active')throw Error('В Builder не подключён активный workflow ESP Recovery');
 return c.api('/actions/workflows/'+WORKFLOW+'/dispatches','POST',{ref:'main',inputs:{request_id:r.requestId,target:r.target,radio:r.radio,flash:String(r.flash),gpio:String(r.gpio),hold:String(r.hold)}});
}
export async function findCloudRun(c,r){
 validateCloudRequest(r);if(!sameRepo(c.repo,r.repo))throw Error('Выбран другой Builder');
 const d=await c.api('/actions/workflows/'+WORKFLOW+'/runs?event=workflow_dispatch&branch=main&per_page=50');
 const matches=(d?.workflow_runs||[]).filter(x=>x.display_title==='Studio Recovery '+r.requestId);
 if(matches.length>1)throw Error('Обнаружено несколько сборок с одинаковым ID');
 return matches[0]||null;
}
export function validateResult(d,r){
 validateCloudRequest(r);
 const c=d?.catalog,e=c?.packages?.[0],m=e?.manifest,t=m?.target,u=m?.update,p=e?.package;
 if(d?.schema!==1||d.requestId!==r.requestId||c?.releaseState!=='local-only-review-hold'||c.packages?.length!==1||m?.source?.sourceCommit!==SOURCE||t?.mcu!==r.target||t.flashBytes!==r.flash*1048576||t.activationGpio!==r.gpio||t.holdSeconds!==r.hold||u?.transports?.join(',')!==r.radio.replace('-',',')||!Number.isSafeInteger(p?.size)||p.size<1||p.size>MAX||!hash(p.sha256))throw Error('Результат не совпадает с запросом');
 if(!Array.isArray(d.chunks)||!d.chunks.length||d.chunks.length>43)throw Error('Некорректные части ZIP');
 let n=0;
 for(const [i,x] of d.chunks.entries()){
   if(x.file!=='part-'+String(i).padStart(3,'0')+'.bin'||!Number.isSafeInteger(x.size)||x.size<1||x.size>384*1024||!hash(x.sha256))throw Error('Неверная часть ZIP');
   n+=x.size;
 }
 if(n!==p.size)throw Error('Размер ZIP не совпадает');
 return d;
}
export async function receiveCloud(c,r,baseCatalog,layouts,progress=()=>{}){
 validateCloudRequest(r);if(!sameRepo(c.repo,r.repo))throw Error('Выбран другой Builder');
 await checkPrivateBuilder(c);
 const branch='recovery-results/'+r.requestId,ref=await c.api('/git/ref/heads/'+branch),sha=ref?.object?.sha;
 if(!/^[a-f0-9]{40}$/.test(sha||'')||ref.ref!=='refs/heads/'+branch)throw Error('Результат GitHub не найден');
 const d=validateResult(JSON.parse(new TextDecoder().decode(await c.readContents('result.json',sha))),r);
 const bytes=new Uint8Array(d.catalog.packages[0].package.size);let offset=0;
 for(const x of d.chunks){
   let b=await c.readContents(x.file,sha);
   if(!(b instanceof Uint8Array)||b.length!==x.size||await sha256Hex(b)!==x.sha256)throw Error('SHA-256 '+x.file);
   bytes.set(b,offset);offset+=b.length;progress(offset,bytes.length);
 }
 const result=await verifyLocalEsp(d.catalog,bytes,baseCatalog,layouts);
 return {...result,bytes,catalog:d.catalog,branch,sha};
}
// Separate IndexedDB avoids mixing loader packages with ordinary user firmware.
function db(){return new Promise((resolve,reject)=>{let r=indexedDB.open('flasher-studio-recovery-v1',1);r.onupgradeneeded=()=>{r.result.createObjectStore('packages',{keyPath:'id'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function trans(mode,fn){let d=await db();return new Promise((resolve,reject)=>{let t=d.transaction('packages',mode),req=fn(t.objectStore('packages'));t.oncomplete=()=>{d.close();resolve(req.result);};t.onerror=t.onabort=()=>{d.close();reject(t.error||Error('Хранилище Recovery'));};});}
export const saveCloudPackage=(id,bytes)=>trans('readwrite',s=>s.put({id,bytes}));
export const readCloudPackage=async id=>(await trans('readonly',s=>s.get(id)))?.bytes;
export async function cleanCloudBranch(c,r,result){
 validateCloudRequest(r);if(!sameRepo(c.repo,r.repo)||result.branch!=='recovery-results/'+r.requestId)throw Error('Wrong result branch');
 await checkPrivateBuilder(c);
 const ref=await c.api('/git/ref/heads/'+result.branch);
 if(ref?.object?.sha!==result.sha)throw Error('Result branch changed');
 return c.api('/git/refs/heads/'+result.branch,'DELETE');
}
