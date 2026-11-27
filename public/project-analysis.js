// Read-only evidence collection. Never execute project code or select a board
// from a generic MCU/library name. Keep build-system and hardware evidence separate.
const skip=/(^|\/)(?:\.git|\.pio|build|debug|release|firmware|drivers|middlewares|managed_components|node_modules|libraries|lib|examples|test|tests|vendor|__macosx)(\/|$)/i;
const leaf=p=>p.split('/').pop();
const source=/\.(?:ino|c|cc|cpp|cxx|h|hpp|s)$/i;
const config=/(?:^|\/)(?:Makefile|GNUmakefile|CMakeLists\.txt|platformio\.ini|sdkconfig(?:\.[^/]+)?|prj\.conf|west\.yml|flasher-native\.json|sketch\.json|\.cproject|\.project)$/i;
const docs=/(?:^|\/)(?:readme[^/]*|[^/]+\.(?:md|txt|rst))$/i;
const relevant=p=>!skip.test(p)&&(source.test(p)||config.test(p)||docs.test(p)||/\.(?:ioc|ld|cmake|mk|json|yaml|yml|ini|conf)$/i.test(p));
const unique=a=>[...new Set(a)];
const norm=v=>v.toUpperCase().replace(/[-_]/g,'');
const espChip=v=>({ESP32:'ESP32',ESP32C2:'ESP32-C2',ESP32C3:'ESP32-C3',ESP32C6:'ESP32-C6',ESP32S2:'ESP32-S2',ESP32S3:'ESP32-S3',ESP32H2:'ESP32-H2',ESP32P4:'ESP32-P4',ESP8266:'ESP8266'})[norm(v)];
export function analyzeProject(entries,filename=''){
 const e=entries.filter(x=>relevant(x.path));
 const names=e.map(x=>x.path).join('\n'),code=e.filter(x=>source.test(x.path)).map(x=>x.text||'').join('\n'),cfg=e.filter(x=>config.test(x.path)||/\.(ioc|ld|cmake|mk)$/i.test(x.path)).map(x=>x.text||'').join('\n');
 const doc=e.filter(x=>docs.test(x.path)).map(x=>x.text||'').join('\n');
 const actual=names+'\n'+code+'\n'+cfg,all=actual+'\n'+doc+'\n'+filename;
 const pio=e.filter(x=>/^platformio\.ini$/i.test(leaf(x.path))),make=e.some(x=>/^(?:GNUmakefile|Makefile)$/i.test(leaf(x.path))),cmake=e.some(x=>/^CMakeLists\.txt$/i.test(leaf(x.path)));
 const ioc=e.some(x=>/\.ioc$/i.test(x.path)),cubeide=e.some(x=>/^\.cproject$/i.test(leaf(x.path)));
 const ino=/\.ino(?:\n|$)/i.test(names+'\n'+filename);
 const fw=[],systems=[];
 if(pio.length){systems.push('PlatformIO');const vals=unique(pio.flatMap(x=>[...String(x.text||'').matchAll(/^\s*framework\s*=\s*([^\r\n;#]+)/gmi)].map(m=>m[1].trim().toLowerCase())));for(const v of vals){if(v==='arduino')fw.push('Arduino');else if(v==='espidf')fw.push('ESP-IDF');else if(v==='stm32cube')fw.push('STM32 HAL');else if(v==='zephyr')fw.push('Zephyr / nRF Connect SDK');else if(v==='cmsis')fw.push('CMSIS');}}
 else{
  if(/idf_component_register|(?:IDF_PATH).{0,80}project\.cmake/i.test(cfg)||e.some(x=>/^sdkconfig(?:\.defaults)?$/i.test(leaf(x.path)))){systems.push('ESP-IDF');fw.push('ESP-IDF');}
  if(/find_package\s*\(\s*Zephyr\b/i.test(cfg)||e.some(x=>/^(?:prj\.conf|west\.yml)$/i.test(leaf(x.path)))){systems.push('West / CMake');fw.push('Zephyr / nRF Connect SDK');}
  if(/pico_sdk_(?:import|init)/i.test(actual)){systems.push('CMake');fw.push('Pico SDK');}
  if(cubeide)systems.push('CubeIDE');else if(!systems.length){if(make)systems.push('Makefile');if(cmake)systems.push('CMake');}
  if(ino||/#\s*include\s*[<"]Arduino\.h[>"]/i.test(code)){fw.push('Arduino');if(!systems.length)systems.push('Arduino CLI');}
  if(ioc||/#\s*include\s*[<"]stm32\w*_hal(?:_\w+)?\.h[>"]|\bHAL_(?:Init|GPIO|RCC|UART)/i.test(code))fw.push('STM32 HAL');
  if(/#\s*include\s*[<"]stm32\w*_ll_\w+\.h[>"]|\bLL_(?:GPIO|RCC|USART)/i.test(code))fw.push('STM32 LL');
  if(!fw.length&&/#\s*include\s*[<"](?:stm32\w+|nrf\d*|core_cm\d+)\.h[>"]/i.test(code))fw.push('CMSIS');
  if(!fw.length&&(/-ffreestanding|-nostdlib\b/.test(cfg)||/\bvolatile\b[\s\S]{0,80}\b(?:0x[0-9a-f]{6,8}|uint32_t)\b/i.test(code)))fw.push('Bare Metal');
 }
 const frames=unique(fw),builds=unique(systems);
 const mcu=[],boards=[];
 const add=(family,chip,part='',board='')=>mcu.push({family,chip,part,board});
 // Full orderable STM32 marking, not CMSIS xx wildcard or short device line.
 const exact=unique([...all.matchAll(/(?:^|[^A-Z0-9])(STM32(?:[CFGHLUN]\d{3}|WB\d{2}|WL\d{2}|WBA\d{2}|H7[RS]\d)[A-Z][0-9A-WYZ][A-Z][0-9])(?=$|[^A-Z0-9])/gi)].map(m=>m[1].toUpperCase()).filter(x=>!x.includes('XX')));
 const short=unique([...all.matchAll(/(?:^|[^A-Z0-9])(STM32(?:[CFGHLUN]\d{3}|WB\d{2}|WL\d{2}|WBA\d{2}|H7[RS]\d))(?=[^0-9]|$)/gi)].map(m=>m[1].toUpperCase()));
 const series=x=>x.startsWith('STM32H7R')||x.startsWith('STM32H7S')?'H7RS':/^STM32WBA/.test(x)?'WBA':/^STM32W[BL]/.test(x)?x.slice(5,7):x.slice(5,7);
 if(exact.length)for(const x of exact)add('STM32',series(x),x);
 else for(const x of short)add('STM32',series(x),'');
 const esp=unique([...actual.matchAll(/(?:^|[^A-Z0-9])(ESP32(?:[-_]?S[23]|[-_]?C[236]|[-_]?H2|[-_]?P4)?|ESP8266)(?=$|[^A-Z0-9])/gi)].map(m=>espChip(m[1])).filter(Boolean));
 // A generic ESP32 reference often accompanies a specific variant.
 const concrete=esp.filter(x=>x!=='ESP32');
 for(const x of concrete.length?concrete:esp)add(x==='ESP8266'?'ESP8266':'ESP32',x);
 for(const m of actual.matchAll(/(?:^|[^A-Z0-9])(ATmega\d+[A-Z]*|ATtiny\d+[A-Z]*)(?=$|[^A-Z0-9])/gi)){const x=m[1].replace(/^atmega/i,'ATmega').replace(/^attiny/i,'ATtiny');add('Arduino AVR',x);}
 for(const m of actual.matchAll(/(?:^|[^A-Z0-9])(nRF(?:51|52|53|54)\d{3})(?=$|[^A-Z0-9])/gi))add('Nordic nRF','nRF'+m[1].slice(3));
 for(const m of actual.matchAll(/(?:^|[^A-Z0-9])(RP2040|RP2350)(?=$|[^A-Z0-9])/gi))add('RP2040 / RP2350',m[1].toUpperCase());
 for(const m of actual.matchAll(/(?:^|[^A-Z0-9])(SAMD21|RA4M1)(?=$|[^A-Z0-9])/gi))add('Arduino ARM',m[1].toUpperCase());
 // Board IDs from explicit build settings; library names do not prove a board.
 const aliases={
  uno:['Arduino AVR','ATmega328P','Arduino Uno R3'],nanoatmega328:['Arduino AVR','ATmega328P','Arduino Nano'],megaatmega2560:['Arduino AVR','ATmega2560','Arduino Mega 2560'],leonardo:['Arduino AVR','ATmega32U4','Arduino Leonardo'],micro:['Arduino AVR','ATmega32U4','Arduino Micro'],
  esp32dev:['ESP32','ESP32','ESP32 Dev Module'],esp32c3dev:['ESP32','ESP32-C3','ESP32C3 Dev Module'],esp32c3devkitm1:['ESP32','ESP32-C3','ESP32-C3 DevKitM-1'],esp32s3devkitc1:['ESP32','ESP32-S3','ESP32-S3 DevKitC-1'],seeedxiaoesp32c3:['ESP32','ESP32-C3','Seeed XIAO ESP32-C3'],
  nodemcuv2:['ESP8266','ESP8266','NodeMCU'],d1mini:['ESP8266','ESP8266','Wemos D1 Mini'],
  pico:['RP2040 / RP2350','RP2040','Raspberry Pi Pico'],picow:['RP2040 / RP2350','RP2040','Raspberry Pi Pico W'],pico2:['RP2040 / RP2350','RP2350','Raspberry Pi Pico 2'],pico2w:['RP2040 / RP2350','RP2350','Pico 2 W'],
  nrf52840dk:['Nordic nRF','nRF52840','nRF52840 DK'],nrf52833dk:['Nordic nRF','nRF52833','nRF52833 DK'],unor4minima:['Arduino ARM','RA4M1','Arduino Uno R4 Minima'],unor4wifi:['Arduino ARM','RA4M1','Arduino Uno R4 WiFi'],zero:['Arduino ARM','SAMD21','Arduino Zero']
 };
 const ids=[...cfg.matchAll(/^\s*(?:board|PICO_BOARD)\s*=\s*["']?([\w-]+)/gmi),...cfg.matchAll(/\bset\s*\(\s*PICO_BOARD\s+["']?([\w-]+)/gi),...cfg.matchAll(/"fqbn"\s*:\s*"[^":]+:[^":]+:([^":]+)(?::[^"]*)?"/gi)].map(m=>m[1]);
 for(const id of ids){const a=aliases[norm(id).toLowerCase()];if(a)boards.push({family:a[0],chip:a[1],part:'',board:a[2]});}
 // STM32 short names are evidence, not a package or a Flash density.
 const seen=new Map();for(const x of [...mcu,...boards]){const k=x.family+'|'+x.chip+'|'+x.part+'|'+x.board;seen.set(k,x);}
 const targets=[...seen.values()],families=unique(targets.map(x=>x.family+'|'+x.chip));
 const exactParts=unique(targets.map(x=>x.part).filter(Boolean)),explicitBoards=unique(boards.map(x=>x.board));
 const conflict=families.length>1||exactParts.length>1||explicitBoards.length>1;
 const target=!conflict?(exactParts.length===1?targets.find(x=>x.part===exactParts[0]):explicitBoards.length===1?boards.find(x=>x.board===explicitBoards[0]):null):null;
 const hint=conflict?targets.map(x=>x.part||x.board||x.chip).filter((v,i,a)=>a.indexOf(v)===i).join(' / '):target?target.part||target.board:short.length===1?short[0]:targets[0]?.chip||'';
 const cpu=unique([...cfg.matchAll(/-mcpu[=\s]+(cortex-[a-z0-9+]+)/gi),...code.matchAll(/^\s*\.cpu\s+(cortex-[a-z0-9+]+)/gmi)].map(m=>m[1].toLowerCase()));
 const compiler=/arm-none-eabi-/i.test(cfg)?'arm-none-eabi-gcc':/\bavr-g(?:cc|\+\+)\b/i.test(cfg)?'avr-gcc':/\briscv(?:32|64)[\w-]*-gcc\b/i.test(cfg)?(cfg.match(/\briscv(?:32|64)[\w-]*-gcc\b/i)||[])[0]:'';
 const memory=[];for(const x of e.filter(x=>/\.ld$/i.test(x.path))){for(const m of String(x.text||'').matchAll(/\b(FLASH|RAM)\s*(?:\([^)]*\))?\s*:\s*ORIGIN\s*=\s*(0x[0-9a-f]+|\d+)\s*,\s*LENGTH\s*=\s*(0x[0-9a-f]+|\d+)\s*([KM])?/gi)){memory.push({region:m[1].toUpperCase(),origin:Number(m[2]),bytes:Number(m[3])*({K:1024,M:1048576}[m[4]?.toUpperCase()]||1)});}}
 return {framework:frames.length===1?frames[0]:frames.length===2&&frames.includes('STM32 HAL')&&frames.includes('STM32 LL')?'STM32 HAL / LL':'',system:builds.length===1?builds[0]:'',compiler,cpu:cpu.length===1?cpu[0]:'',target,hint,conflict:conflict||builds.length>1,targets,memory};
}
// ZIP metadata is read first; extract only evidence files under strict byte budgets.
export async function readProjectEntries(file){
 if(!file||file.size>15*1024*1024)throw Error('Размер исходников не должен превышать 15 МиБ.');
 if(!/\.zip$/i.test(file.name))return [{path:file.name,text:(await file.text()).slice(0,512*1024)}];
 const b=new Uint8Array(await file.arrayBuffer()),v=new DataView(b.buffer),u16=p=>v.getUint16(p,true),u32=p=>v.getUint32(p,true);
 let end=-1;for(let i=b.length-22;i>=Math.max(0,b.length-65557);i--)if(u32(i)===0x06054b50&&i+22+u16(i+20)===b.length){end=i;break;}
 if(end<0||u16(end+4)||u16(end+6)||u16(end+8)!==u16(end+10))throw Error('ZIP не распознан');
 const n=u16(end+10),start=u32(end+16);let p=start,total=0;
 if(n>10000||start+u32(end+12)!==end)throw Error('ZIP повреждён');
 const entries=[],seen=new Set();
 for(let i=0;i<n;i++){
  if(p+46>end||u32(p)!==0x02014b50)throw Error('ZIP повреждён');
  const flags=u16(p+8),method=u16(p+10),packed=u32(p+20),raw=u32(p+24),nl=u16(p+28),off=u32(p+42),next=p+46+nl+u16(p+30)+u16(p+32);
  if(next>end)throw Error('ZIP повреждён');
  const path=new TextDecoder().decode(b.subarray(p+46,p+46+nl));p=next;
  if(path.endsWith('/')||!relevant(path))continue;
  if(path.startsWith('/')||path.includes('\\')||path.split('/').includes('..')||seen.has(path))throw Error('ZIP: небезопасное имя');seen.add(path);
  const x={path,text:''};entries.push(x);
  if(raw>512*1024||total+raw>8*1024*1024||flags&1||![0,8].includes(method))continue;
  if(off+30>start||u32(off)!==0x04034b50)throw Error('ZIP повреждён');
  const at=off+30+u16(off+26)+u16(off+28);if(at+packed>start)throw Error('ZIP повреждён');
  let data=b.subarray(at,at+packed);
  if(method===8){const reader=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();let parts=[],count=0;try{while(true){const {done,value}=await reader.read();if(done)break;count+=value.length;if(count>raw)throw Error('ZIP: превышение размера');parts.push(value);}}finally{await reader.cancel().catch(()=>{});}data=new Uint8Array(count);let j=0;for(const part of parts){data.set(part,j);j+=part.length;}}
  if(data.length!==raw)throw Error('ZIP: размер файла');total+=raw;x.text=new TextDecoder().decode(data);
 }
 if(p!==end)throw Error('ZIP повреждён');return entries;
}
