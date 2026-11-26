import {GithubBuilder,normalizeRepo} from './github-api.js';
import {sha256Hex} from './safety.js';
import {wbCpu1CompileTarget,wbProfile} from './stm32-wb.js';
import {parseHex} from './programmers.js';
import {auditWbElf} from './wb-memory.js';
import {checkWbOtaImage,wbOtaCandidate,WB_OTA_BASE} from './wb-ota.js';
export const WB_BUILDER_REF='develop/wb-cpu1';
export function builderRefForRequest(r){
 const n=String(r?.nativeTarget||'').trim().toUpperCase();
 let ref='main';
 if(n.startsWith('STM32WB')){
  if(!wbCpu1CompileTarget(n)||!(r.engine==='stm32-bare'&&['c','cpp','zip'].includes(r.ext)||r.engine==='stm32cubeide-gcc'&&r.ext==='zip'))throw Error('STM32WB: CPU1 C/C++/ZIP или полный CubeIDE GNU ZIP');
  ref=WB_BUILDER_REF;
 }
 if(r?.builderRef!==undefined&&r.builderRef!==ref)throw Error('Builder branch mismatch');
 return ref;
}
function checkedRef(ref){if(!['main',WB_BUILDER_REF].includes(ref))throw Error('Builder branch unsupported');return ref;}
export function checkWbBuildMetadata(build,r){
 if(builderRefForRequest(r)!==WB_BUILDER_REF)return;
 const p=wbProfile(r.nativeTarget),m=build?.memory;
 if(String(build?.target||'').toUpperCase()!==String(r.nativeTarget).toUpperCase()||(r.engine==='stm32-bare'?build?.cubeTag!=='v1.24.0'||build?.wbFullProject===true:build?.wbFullProject!==true)||m?.wbApplicationOnly!==true||m.physicalFlashKiB!==p.flash/1024||m.ramKiB!==p.ram/1024||!Number.isInteger(m.flashKiB)||m.flashKiB<p.pageSize/1024||m.flashKiB>=m.physicalFlashKiB||m.flashKiB%(p.pageSize/1024)!==0)throw Error('STM32WB: неверный профиль CPU1 в артефакте');
 const ota=build.wbOtaLayout!==undefined||build.wbOtaOrigin!==undefined;
 if(ota&&(r.engine!=='stm32cubeide-gcc'||build.wbOtaLayout!=='st-ble-app-0x7000'||build.wbOtaOrigin!==WB_OTA_BASE||!wbOtaCandidate(build.target)||!build.wbMemoryAudit||m.flashKiB<=28))throw Error('WB OTA manifest layout');
 const origin=ota?WB_OTA_BASE:0x08000000;
 if(r.engine==='stm32cubeide-gcc'&&(!Array.isArray(build.wbFlashRanges)||!build.wbFlashRanges.length||build.wbFlashRanges[0].start!==origin||build.wbFlashRanges.some((x,i,a)=>!Number.isInteger(x.start)||!Number.isInteger(x.endExclusive)||x.start<origin||x.start>=x.endExclusive||x.endExclusive>0x08000000+m.flashKiB*1024||x.size!==x.endExclusive-x.start||(i>0&&x.start<=a[i-1].endExclusive))))throw Error('STM32WB: неверные диапазоны полного проекта');
}
export function checkWbFullProjectHex(build,files){
 if(!build.wbFullProject)return;
 const hex=files.get('firmware.hex');if(!hex)throw Error('STM32WB: отсутствует HEX CPU1');
 const ranges=parseHex(new TextDecoder().decode(hex));const actual=ranges.map(x=>({start:x.address,endExclusive:x.address+x.data.length,size:x.data.length}));
 if(JSON.stringify(actual)!==JSON.stringify(build.wbFlashRanges.map(x=>({start:x.start,endExclusive:x.endExclusive,size:x.size}))))throw Error('STM32WB: HEX не совпадает с диапазонами манифеста');
 if(build.wbMemoryAudit!=null){if(!/^STM32WB55/.test(build.target)||build.memory?.ramKiB!==192)throw Error('WB ELF audit target');const audit=auditWbElf(files.get('firmware.elf'),build.memory.flashKiB,ranges,build.wbOtaOrigin??0x08000000);if(JSON.stringify(audit)!==JSON.stringify(build.wbMemoryAudit))throw Error('WB ELF audit mismatch');}
 if(build.wbOtaLayout!==undefined){const result=checkWbOtaImage(build.target,ranges,build.memory.flashKiB),b=files.get('firmware.bin');if(!b||b.length!==result.image.length||!b.every((v,i)=>v===result.image[i]))throw Error('WB OTA BIN differs from addressed HEX');}
}
const workflow='build-universal.yml';
export class UniversalBuilder extends GithubBuilder{
 async check(){const r=await this.requirePrivate();const w=await this.api('/actions/workflows/'+workflow);if(w.state!=='active')throw Error('Workflow не активен');return r.full_name;}
 async dispatch(r){if(!/^[a-f0-9]{32}$/.test(r.requestId))throw Error('Request ID');await this.requirePrivate();return this.api('/actions/workflows/'+workflow+'/dispatches','POST',{ref:builderRefForRequest(r),inputs:{request_id:r.requestId,input_type:r.ext,engine:r.engine,fqbn:r.fqbn||'',native_target:r.nativeTarget||'',environment:r.environment||'',libraries:r.libraries||''}});}
 async findRun(id,ref='main'){if(!/^[a-f0-9]{32}$/.test(id))throw Error('Request ID');const d=await this.api('/actions/workflows/'+workflow+'/runs?event=workflow_dispatch&branch='+encodeURIComponent(checkedRef(ref))+'&per_page=50');return d.workflow_runs?.find(r=>r.display_title==='Studio Compile '+id&&r.head_branch===ref)||null;}
 async upload(r,file){
  const branch=builderRefForRequest(r),encoded=encodeURIComponent(branch);
  if(!/^[a-f0-9]{32}$/.test(r.requestId)||!['ino','zip','c','cpp','ioc'].includes(r.ext))throw Error('Request ID / format');
  await this.requirePrivate();
  if(branch===WB_BUILDER_REF)await this.api('/git/ref/heads/'+branch);
  if(file.size<1||file.size>15*1024*1024)throw Error('Исходники: максимум 15 МиБ');
  const bytes=new Uint8Array(await file.arrayBuffer());let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));
  const blob=await this.api('/git/blobs','POST',{content:btoa(s),encoding:'base64'});
  if(!/^[a-f0-9]{40}$/.test(blob.sha))throw Error('Git blob не подтверждён');
  const path='requests/'+r.requestId+'/source.'+r.ext;
  for(let attempt=0;attempt<4;attempt++){
   const ref=await this.api('/git/ref/heads/'+branch);let head=ref.object.sha;
   const commit=await this.api('/git/commits/'+head);
   const tree=await this.api('/git/trees','POST',{base_tree:commit.tree.sha,tree:[{path,mode:'100644',type:'blob',sha:blob.sha}]});
   const next=await this.api('/git/commits','POST',{message:'Studio request '+r.requestId,tree:tree.sha,parents:[head]});
   try{await this.api('/git/refs/heads/'+branch,'PATCH',{sha:next.sha,force:false});return;}
   catch(e){try{const item=await this.api('/contents/'+path+'?ref='+encoded);if(item.sha===blob.sha)return;}catch{}if(attempt===3)throw e;}
  }
 }
 async dispatchSafely(r){const ref=builderRefForRequest(r);try{return await this.dispatch(r);}catch(e){for(let i=0;i<5;i++){await new Promise(r=>setTimeout(r,2500));try{if(await this.findRun(r.requestId,ref))return;}catch{}}throw e;}}
 async artifact(run,id){const d=await this.api('/actions/runs/'+run+'/artifacts?per_page=100');const a=d.artifacts?.find(a=>a.name==='firmware-'+id&&!a.expired);if(!a)throw Error('Артефакт не найден / истёк срок');return a;}
 async downloadArtifact(a){const r=await fetch(this.apiBase+'/actions/artifacts/'+a.id+'/zip',{headers:{Authorization:'Bearer '+this.token,Accept:'application/vnd.github+json'},cache:'no-store',redirect:'follow'});if(!r.ok)throw Error('ZIP: HTTP '+r.status);return new Uint8Array(await r.arrayBuffer());}
}
// No filenames are extracted to a filesystem. Strict, bounded ZIP reader (stored/deflated).
export async function unpackZip(bytes){if(!(bytes instanceof Uint8Array)||bytes.length>100*1024*1024||bytes.length<22)throw Error('Недопустимый размер ZIP');const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),u16=p=>v.getUint16(p,true),u32=p=>v.getUint32(p,true);let end=-1;for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--)if(u32(p)===0x06054b50&&p+22+u16(p+20)===bytes.length){end=p;break;}if(end<0||u16(end+4)||u16(end+6)||u16(end+8)!==u16(end+10))throw Error('ZIP: неверный каталог');let n=u16(end+10),p=u32(end+16),size=u32(end+12),total=0;if(n>2000||p+size!==end)throw Error('ZIP: каталог');const out=new Map();for(let i=0;i<n;i++){if(p+46>end||u32(p)!==0x02014b50)throw Error('ZIP: запись каталога');let flags=u16(p+8),method=u16(p+10),packed=u32(p+20),raw=u32(p+24),nl=u16(p+28),el=u16(p+30),cl=u16(p+32),local=u32(p+42),next=p+46+nl+el+cl;if(next>end||flags&1||![0,8].includes(method)||raw>48*1024*1024||(total+=raw)>150*1024*1024)throw Error('ZIP: предел / формат');let name=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(p+46,p+46+nl));p=next;if(name.startsWith('/')||name.includes('\\')||name.split('/').includes('..')||out.has(name))throw Error('ZIP: небезопасное имя');if(name.endsWith('/'))continue;if(local+30>end||u32(local)!==0x04034b50)throw Error('ZIP: локальный заголовок');let start=local+30+u16(local+26)+u16(local+28);if(start+packed>u32(end+16))throw Error('ZIP: границы');let data=bytes.slice(start,start+packed);if(method===8){let reader=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(),parts=[],count=0;try{while(true){let {done,value}=await reader.read();if(done)break;count+=value.length;if(count>raw)throw Error('ZIP: превышение размера');parts.push(value);}}finally{await reader.cancel().catch(()=>{});}data=new Uint8Array(count);let pos=0;for(let part of parts){data.set(part,pos);pos+=part.length;}}if(data.length!==raw)throw Error('ZIP: размер файла');out.set(name,data);}if(p!==end)throw Error('ZIP: лишние записи');return out;}
export async function checkArtifact(bytes,r){const zip=await unpackZip(bytes);let names=[...zip.keys()].filter(n=>/(^|\/)manifest\.json$/.test(n));if(names.length!==1)throw Error('Требуется один манифест сборки');let name=names[0],dir=name.slice(0,-'manifest.json'.length),m=JSON.parse(new TextDecoder().decode(zip.get(name)));if(m.schema!==2||m.requestId!==r.requestId||!m.build||!Array.isArray(m.files)||!m.files.length||m.files.length>500)throw Error('Манифест не соответствует запросу');if(r.engine!=='auto'&&m.build.engine!==r.engine)throw Error('Другая система сборки');if(r.fqbn&&m.build.fqbn!==r.fqbn)throw Error('Другой FQBN');if(r.sourceSha256&&m.build.sourceSha256!==r.sourceSha256)throw Error('Другой исходный файл');checkWbBuildMetadata(m.build,r);let files=new Map();for(let f of m.files){if(typeof f.file!=='string'||files.has(f.file)||!Number.isSafeInteger(f.size)||! /^[a-f0-9]{64}$/i.test(f.sha256))throw Error('Некорректный манифест файла');let b=zip.get(dir+f.file);if(!b||b.length!==f.size||await sha256Hex(b)!==f.sha256.toLowerCase())throw Error('SHA-256: '+f.file);files.set(f.file,b);}checkWbFullProjectHex(m.build,files);for(const [lock,expected] of Object.entries({...m.build.nativeDependencyFiles,...(m.build.lockFileSha256?{'flasher-lock.json':m.build.lockFileSha256}:{})})){let b=zip.get(dir+lock);if(!b||await sha256Hex(b)!==expected)throw Error('Контрольная сумма lock-файла: '+lock);}return {m,files};}
// Arduino ESP8266 core 3.1.2 has a fixed upload recipe (one combined BIN at 0x0).
// Do not infer this layout for other tools, core versions or multi-file builds.
export function selectedEsp8266Bin(result){const b=result?.m?.build;if(b?.engine!=='arduino'||b.core!=='esp8266:esp8266'||b.coreVersion!=='3.1.2'||!/^esp8266:esp8266:[a-zA-Z0-9_-]+(?::[^\s]+)?$/.test(b.fqbn||''))return null;const f=result.m.files.filter(x=>x.format==='bin'&&x.file.endsWith('.bin'));return f.length===1?f[0]:null;}
export function selectedBin(result){let f=result.m.files.filter(f=>f.file.endsWith('.merged.bin'));if(f.length!==1)return null;const entry=result.m.flashLayout?.entries?.find(x=>x.file===f[0].file);return entry?.addressSpace==='flash-offset'&&entry.ranges?.length===1&&entry.ranges[0].start===0&&entry.ranges[0].endExclusive===f[0].size?f[0]:null;}
