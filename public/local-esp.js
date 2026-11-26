// Explicit local-only ESP32-C3 import, no network/token or automatic install.
import {sha256Hex} from './safety.js';
import {unpackZip} from './universal.js';
import {espBootPackage} from './extra-programmers.js';
import {partitionRecords} from './recovery-integration.js';
const PIN=[4,3,5,6,7,10],MAX_ZIP=16*1024*1024,enc=new TextEncoder(),dec=new TextDecoder('utf-8',{fatal:true});
const isHash=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const validFile=f=>f&&typeof f.file==='string'&&/^[A-Za-z0-9_.-]+$/.test(f.file)&&Number.isSafeInteger(f.size)&&f.size>0&&f.size<=MAX_ZIP&&isHash(f.sha256);
const stable=v=>Array.isArray(v)?'['+v.map(stable).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}':JSON.stringify(v);
export function localEspEntry(p,baseCatalog,layouts){
 const m=p?.manifest,t=m?.target,u=m?.update,s=m?.source;
 if(!m||m.schemaVersion!==1||m.kind!=='esp-recovery'||m.version!=='0.2.3'||m.autoInstall!==false||m.validation!=='local-build-not-hardware-tested'||s?.localBuild!==true||s.redistributionReview!=='HOLD'||s.sourceRepo!=='https://github.com/VV-Vovk/flasher-studio-bootloaders-public'||!/^[a-f0-9]{40}$/.test(s.sourceCommit||'')||s.sdkImage!=='espressif/idf@sha256:4317595a911886e04cbc6d731315d5fc2918e510b6733fc7d03381ab2d270082')throw Error('Это не локальный кандидат нашего сборщика ESP Recovery v0.2.3');
 if(t?.mcu!=='esp32c3'||![4,8,16].includes(t.flashBytes/1048576)||!PIN.includes(t.activationGpio)||t.activationLevel!==0||!Number.isInteger(t.holdSeconds)||t.holdSeconds<0||t.holdSeconds>5)throw Error('Некорректный профиль ESP32-C3');
 let radios=u?.transports;
 if(!Array.isArray(radios)||!['wifi','ble','wifi,ble'].includes(radios.join(',')))throw Error('Радиоинтерфейс');
 let radio=radios.length===2?'wifi-ble':radios[0],flash=t.flashBytes/1048576,id='esp32c3-recovery-'+radio+'-'+flash+'mb'+(t.activationGpio!==4?'-gpio'+t.activationGpio:'')+(t.holdSeconds!==3?'-hold'+t.holdSeconds+'s':'');
 if(m.id!==id||!validFile(p.package)||p.package.file!==id+'-0.2.3.zip'||!validFile(m.partitionTable)||m.partitionTable.file!=='partitions.csv'||!validFile(m.notices)||m.notices.file!=='THIRD_PARTY_NOTICES.txt')throw Error('Идентификатор / контрольные суммы');
 if(!Array.isArray(m.files)||m.files.length!==4||m.files.some(f=>!validFile(f)))throw Error('Файлы Recovery');
 const roles={'bootloader':['bootloader.bin',0,0x8000],'partition-table':['partition-table.bin',0x8000,0x9000],'ota-data':['ota_data_initial.bin',0xf000,0x11000],recovery:['flasher_recovery.bin',0x20000,0x1a0000]};
 let seen=new Set();
 for(const f of m.files){let a=Object.hasOwn(roles,f.role)?roles[f.role]:null;if(!a||seen.has(f.role)||f.file!==a[0]||f.format!=='bin'||f.offset!==a[1]||f.offset+Math.ceil(f.size/4096)*4096>a[2])throw Error('Адрес/размер образа');seen.add(f.role);}
 const base=baseCatalog.find(x=>!x.localOnly&&x.manifest?.kind==='esp-recovery'&&x.manifest.target.mcu==='esp32c3'&&x.manifest.target.flashBytes===t.flashBytes&&x.manifest.partitionTable.sha256===m.partitionTable.sha256&&layouts[x.id]);
 const layout=base&&layouts[base.id],slot=(t.flashBytes-0x1a0000)/2;
 if(!base||!layout||m.partitionTable.size!==enc.encode(layout.csv).length||u.protocolVersion!==1||u.maxAppBytes!==slot||stable(u.slots)!==stable([0x1a0000,0x1a0000+slot])||u.appOnly!==true||u.requiresMatchingPartitionLayout!==true)throw Error('Непроверенная разметка Recovery');
 const eid=id+'@'+m.version+'-local-'+p.package.sha256.slice(0,16);
 return {entry:{id:eid,bootProjectId:id,version:m.version,name:'Локальный · ESP32-C3 '+radio+' '+flash+' МиБ · GPIO'+t.activationGpio+' · '+t.holdSeconds+' с',methods:radios,target:{fi:0,chip:'ESP32-C3',board:'ESP32-C3',custom:''},manifest:m,package:p.package,type:'candidate',localOnly:true},layout};
}
export async function verifyLocalEsp(catalog,bytes,baseCatalog,layouts){
 if(catalog?.schemaVersion!==1||catalog.releaseState!=='local-only-review-hold'||!Array.isArray(catalog.packages)||catalog.packages.length!==1||!(bytes instanceof Uint8Array)||bytes.length>MAX_ZIP)throw Error('Требуются catalog.json и ZIP из собственного локального сборщика');
 const result=localEspEntry(catalog.packages[0],baseCatalog,layouts),{entry,layout}=result;
 if(bytes.length!==entry.package.size||await sha256Hex(bytes)!==entry.package.sha256)throw Error('SHA-256 локального ZIP');
 const files=await unpackZip(bytes),expected=['LICENSE','THIRD_PARTY_NOTICES.txt','manifest.json','partitions.csv',...entry.manifest.files.map(f=>f.file)].sort();
 if(stable([...files.keys()].sort())!==stable(expected))throw Error('Неожиданные файлы ZIP');
 if(stable(JSON.parse(dec.decode(files.get('manifest.json'))))!==stable(entry.manifest))throw Error('manifest.json не совпадает с каталогом');
 for(const f of [entry.manifest.notices,entry.manifest.partitionTable]){const data=files.get(f.file);if(!data||data.length!==f.size||await sha256Hex(data)!==f.sha256)throw Error('SHA-256 '+f.file);}
 if(dec.decode(files.get('partitions.csv'))!==layout.csv||stable(partitionRecords(files.get('partition-table.bin')))!==stable(layout.records))throw Error('Таблица разделов не совпадает с известной разметкой');
 if(!dec.decode(files.get('LICENSE')).includes('Apache License')||!dec.decode(files.get('THIRD_PARTY_NOTICES.txt')).includes('LOCAL TEST ONLY'))throw Error('Отсутствуют лицензионные материалы');
 const image=await espBootPackage(bytes,entry);
 return {...result,image};
}
