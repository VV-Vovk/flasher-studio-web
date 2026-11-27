export {GithubBuilder, validateRequest, validateBuildResult, normalizeRepo, REPO, WORKFLOW} from './github-api.js';
import {validateBuildResult} from './github-api.js';
import {validateRelease,sha256Hex,checkImageHeader} from './safety.js';
export async function receive(client, request, progress=()=>{}) {
 const doc=validateBuildResult(await client.resultManifest(request.requestId), request.requestId, validateRelease);
 if(doc.release.boardId!==request.profile || doc.release.name!==request.name || doc.release.version!==request.version) throw Error('Метаданные сборки не совпадают с запросом');
 const firmware=new Uint8Array(doc.size);let offset=0;
 for(const p of doc.chunks){const b=await client.resultChunk(request.requestId,p.file,p);if(b.length!==p.size||await sha256Hex(b)!==p.sha256.toLowerCase())throw Error('SHA-256 части не совпадает');firmware.set(b,offset);offset+=b.length;progress(offset/doc.size);}
 if(await sha256Hex(firmware)!==doc.sha256.toLowerCase())throw Error('SHA-256 BIN не совпадает');
 if(checkImageHeader(firmware.subarray(doc.release.chip==='esp32'?0x1000:0),doc.release.chip).kind!=='esp-image')throw Error('Неверный заголовок ESP BIN');
 return {doc,firmware};
}
function db(){return new Promise((resolve,reject)=>{const r=indexedDB.open('flasher-studio-real-v1',1);r.onupgradeneeded=()=>{r.result.createObjectStore('metadata',{keyPath:'id'});r.result.createObjectStore('binary');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function tx(stores,mode,fn){const d=await db();return new Promise((resolve,reject)=>{const t=d.transaction(stores,mode);let value;try{const r=fn(t);if(r)r.onsuccess=()=>value=r.result;}catch(e){t.abort();d.close();reject(e);return;}t.oncomplete=()=>{d.close();resolve(value);};t.onabort=t.onerror=()=>{d.close();reject(t.error||Error('Ошибка хранилища'));};});}
export const save=(meta,bytes)=>tx(['metadata','binary'],'readwrite',t=>{t.objectStore('metadata').put(meta);return t.objectStore('binary').put(bytes,meta.id);});
export const list=()=>tx(['metadata'],'readonly',t=>t.objectStore('metadata').getAll());
export const binary=id=>tx(['binary'],'readonly',t=>t.objectStore('binary').get(id));
export const remove=id=>tx(['metadata','binary'],'readwrite',t=>{t.objectStore('metadata').delete(id);return t.objectStore('binary').delete(id);});
// Preserve original imported file (including Intel HEX addresses); never infer a build version.
export function firmwareFilename(meta){
 if(meta?.localFile===true){
  if(typeof meta.filename!=='string'||!/[.](hex|bin)$/i.test(meta.filename))throw Error('Некорректное имя локальной прошивки');
  return meta.filename;
 }
 return meta?.universal?'firmware.zip':'merged.bin';
}
export function localFirmwareEligible(session,verified){
 return verified===true&&['esp','stm','avr'].includes(session?.kind)&&!['micro56','trinket58'].includes(session.route);
}
export function checkLocalFirmwareTarget(meta,target,session){
 if(meta.localFile!==true)return;
 if(meta.board!==target.board||meta.family!==target.family||meta.chip!==target.chip||
    meta.localKind!==session.kind||(session.kind!=='esp'&&meta.localRoute!==session.route)||
    (session.kind==='esp'&&meta.localFlash!==session.flash)||
    (session.kind==='stm'&&meta.localFlash!==session.pr?.flash)||
    (session.kind==='avr'&&meta.localFlash!==session.pr?.limit))
  throw Error('Локальная прошивка сохранена для другой конфигурации устройства');
}
export async function localFirmwareRecord({filename,bytes,target,session,verified,now=Date.now()}){
 if(!localFirmwareEligible(session,verified))throw Error('Запись локальной прошивки не подтверждена');
 if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>100*1024*1024||
    typeof filename!=='string'||!/[.](hex|bin)$/i.test(filename)||
    !target?.board||!target?.chip||!target?.family)
  throw Error('Некорректный файл локальной прошивки');
 const fmt=filename.slice(-3).toUpperCase(),name=filename.replace(/[.](hex|bin)$/i,'');
 if((session.kind==='esp'&&fmt!=='BIN')||(session.kind!=='esp'&&fmt!=='HEX'))throw Error('Некорректный файл локальной прошивки');
 const sha256=await sha256Hex(bytes),localKind=session.kind,localRoute=session.kind==='esp'?'esp':session.route;
 const localFlash=session.kind==='esp'?session.flash:session.kind==='stm'?session.pr?.flash:session.pr?.limit;
 if(!Number.isSafeInteger(localFlash)||localFlash<1||!localRoute)throw Error('Не определена конфигурация локальной прошивки');
 const config=[target.family,target.chip,target.board,localKind,localRoute,localFlash,fmt];
 const hash=async v=>sha256Hex(new TextEncoder().encode(JSON.stringify(v)));
 const id='local-'+await hash([...config,sha256]),projectId='local-project-'+await hash([...config,name]);
 return {id,projectId,name,version:'—',filename,fmt,board:target.board,chip:target.chip,family:target.family,localFile:true,localKind,localRoute,localFlash,sha256,size:bytes.length,date:new Date(now).toLocaleString('ru'),createdAt:now};
}
export async function saveLocalFirmware(input){
 const meta=await localFirmwareRecord(input);
 // Keep the first entry and its project association for identical bytes/configuration.
 const existing=(await list()).find(x=>x.id===meta.id&&x.localFile===true);
 if(existing){
  const b=await binary(existing.id);
  if(b instanceof Uint8Array&&await sha256Hex(b)===meta.sha256)return existing;
 }
 await save(meta,input.bytes);
 return meta;
}
export async function download(meta){const bytes=await binary(meta.id);if(!(bytes instanceof Uint8Array)||await sha256Hex(bytes)!==meta.sha256)throw Error('BIN отсутствует или повреждён');const url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'}));const a=document.createElement('a');a.href=url;a.download=(meta.localFile?firmwareFilename(meta):meta.name+'-'+meta.version+(meta.universal?'.zip':'.merged.bin')).replace(/[\\/:*?"<>|]/g,'_');a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
