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
export async function download(meta){const bytes=await binary(meta.id);if(!(bytes instanceof Uint8Array)||await sha256Hex(bytes)!==meta.sha256)throw Error('BIN отсутствует или повреждён');const url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'}));const a=document.createElement('a');a.href=url;a.download=(meta.name+'-'+meta.version+(meta.universal?'.zip':'.merged.bin')).replace(/[\\/:*?"<>|]/g,'_');a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
