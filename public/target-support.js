// Target capability policy. Catalogue presence is NOT a build/flash capability.
import {swdProfile} from './stm32-swd.js';
import {stmUartProfile} from './stm32-rom-profiles.js';
import {DFU_PROFILES,extendedAvrProfile} from './extra-programmers.js';
import {avrProfile} from './programmers.js';
const STATIC_STM_BASES=new Set(["STM32F030F4","STM32F030K6","STM32F030C6","STM32F030C8","STM32F030R8","STM32F103C8","STM32F103CB","STM32C011F4","STM32C011F6","STM32C031C6","STM32C031F6","STM32G071CB","STM32G071RB","STM32G030F6","STM32G030K8","STM32G431CB","STM32G431RB","STM32G431KB","STM32F401CC","STM32F401RC","STM32F411CE","STM32F411RE","STM32F303CB","STM32F303CC","STM32F303RC","STM32F205RG","STM32L072CB","STM32L072CZ","STM32L432KC","STM32F070F6","STM32F042F6","STM32F042C6","STM32F042K6","STM32F070C6","STM32F070CB","STM32F070RB","STM32F072RB","STM32F072CB","STM32F103R8","STM32F103RB","STM32F103V8","STM32F103VB"]);
const ALIASES={'Blue Pill STM32F103':'STM32F103C8T6','Black Pill F411':'STM32F411CEU6'};
export function stmTarget(name){return ALIASES[name]||String(name||'').trim().toUpperCase();}
function matchCatalog(pattern,name){
 if(!pattern)return false;
 const p=String(pattern).replace(/TR$/,'');
 if(!/^[A-Za-z0-9]+$/.test(p))return false;
 const regex=new RegExp('^'+p.split('').map(c=>c==='x'?'[A-Z0-9]':c.toUpperCase()).join('')+'$');
 const n=name.replace(/TR$/,'');
 return regex.test(n)||(!p.includes('x')&&p.length===11&&n.length===13&&n.slice(0,11)===p.toUpperCase()&&/^[A-Z][0-9]$/.test(n.slice(11)));
}
export function stmCompile(name,catalog=[]){
 const n=stmTarget(name);if(!/^STM32[A-Z0-9]{6,20}$/.test(n)||/X/.test(n))return false;
 if([...STATIC_STM_BASES].some(k=>n===k||new RegExp('^'+k+'[A-Z][0-9](?:TR)?$').test(n)))return true;
 return catalog.some(x=>x.profile===true&&matchCatalog(x.name,n));
}
const ESP=new Set(['ESP32','ESP32-C3','ESP32-S3','ESP32-C6','ESP32-S2','ESP32-H2']);
const E8266=new Set(['NodeMCU','Wemos D1 Mini','Generic ESP8266']);
const UF2=new Set(['Raspberry Pi Pico','Raspberry Pi Pico W','Raspberry Pi Pico 2','Pico 2 W']);
export function targetCapability({fi,chip,board,name=board,arduino=false,bareAvr=false,legacy=false,legacyEsp=false},catalog=[]){
 const n=String(name||'');let compile=false,methods=[];
 if(fi===5){const x=stmTarget(n);compile=stmCompile(x,catalog);if(swdProfile(x))methods.push('ST-LINK · SWD','CMSIS-DAP · SWD');if(stmUartProfile(x)&&!x.includes('X'))methods.push('UART');if(Object.hasOwn(DFU_PROFILES,x))methods.push('USB DFU');}
 else if(fi===0&&ESP.has(chip)&&n&&n!=='—'){compile=true;methods=['USB-UART','Native USB','Native USB (если доступен)'];}
 else if(fi===1&&E8266.has(n)){compile=true;methods=['USB-UART'];}
 else if(fi===2){compile=arduino||bareAvr;if(bareAvr)methods=['ISP-программатор'];else if(extendedAvrProfile(n))methods=['USB','USB-UART','Native USB'];else if(avrProfile(n))methods=['USB','USB-UART'];}
 else if(fi===3||fi===6){compile=arduino;}
 else if(fi===4){compile=arduino;if(UF2.has(n))methods=['UF2'];}
 if(legacy)compile=legacyEsp;
 const state=compile?(methods.length?'both':'compile'):methods.length?'flash':'none';
 return {compile,methods,state,selectable:state!=='none'};
}
export const CAPTION={both:'Сборка и прошивка',compile:'Только компиляция',flash:'Только запись готового файла',none:'Пока не поддерживается'};
