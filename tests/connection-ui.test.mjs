import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('Unified connection screen exposes all enabled methods and keeps legacy handlers',()=>{
 assert.match(html,/<div class="seg" id="devMode" hidden>/);
 assert.ok(html.includes('proposed().filter(methodOK34)'));
 assert.ok(html.includes("if(methodSelected===WIFI_OTA&&fi===0)return wifiProbe62()"));
 assert.ok(html.includes("return oldConnect62()"));
 assert.ok(html.includes("return $('wifiWrite23').click()"));
 assert.ok(html.includes("return $('wbBleProbe43').click()"));
 assert.ok(html.includes("return $('nrfProbe50').click()"));
 assert.ok(html.includes("if(expected&&expected!==id)throw Error('Подключено другое устройство')"));
});
test('Inline application JavaScript parses',()=>{for(const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new Script(m[1]);});

test('STK500 UART re-entry occurs after confirmation and before write flag, and on info read',()=>{
 const flash=html.slice(html.lastIndexOf("$('flash').onclick=async"),html.lastIndexOf('async function readPhysical'));
 const reset=flash.indexOf('await s.avr.reenter(s.pr.signature,undefined,logHW)');
 assert.ok(reset>flash.indexOf("Продолжить только при уверенности в совместимости."));
 assert.ok(reset<flash.indexOf('wrote=true'));
 assert.ok(flash.includes("s.kind==='avr'&&s.avr instanceof driver.Stk500"));
 assert.ok(html.includes("else if(s.kind==='avr'&&s.avr instanceof driver.Stk500){await s.avr.reenter(s.pr.signature,undefined,logHW);"));
 assert.ok(html.includes("if(hw?.kind==='avr'&&!hw.id)fsLocale.setText($('infoSummary17'),hw.desc)"));
});

test('STK500 initial connection uses the same reset and diagnostic handshake as re-entry',()=>{
 assert.ok(html.includes("sig=await avr.reenter(pr.signature,undefined,logHW)"));
});

test('Manual AVR record IDs are separate from physical IDs and never auto-selected by chip signature',()=>{
 assert.ok(html.includes('&&matchTarget12(d)&&!d.manual'));
 assert.ok(html.includes("else if(hw.kind==='avr'){active12=read12=linkTarget12='';chooseManualAvr73(hw,target);}"));
 assert.ok(html.includes('s.recordId=d.id;s.verifiedCurrent=false;'));
 assert.ok(html.includes("id:'manual-avr-'+"));
 assert.ok(html.includes('x.id===(s.recordId||s.id)'));
 assert.ok(html.includes('x.id===(input.session.recordId||input.session.id)'));
 assert.ok(html.includes("d.manual===true&&targetKey12(d.target)===targetKey12(target)"));
 assert.ok(html.includes("s.avr.readApplication(size,s.pr.limit)"));
});

test('Device target picker stays available after selecting a target and shares the existing modal',()=>{
 assert.match(html,/id="deviceTarget74"/);
 assert.ok(html.includes("targetState==='none'?'Выбрать целевую плату':'Изменить целевую плату'"));
 assert.ok(html.includes('b.disabled=!!hw||hwBusy||liveBusy||!!timer||analysisBusy'));
 assert.ok(html.includes("if(hw||hwBusy||liveBusy||timer||analysisBusy)return;\n $('pickTarget').click();"));
 assert.ok(html.includes("if(!$('targetDialog').open)renderDevice()"));
});

test('USB overrides live inside the connection panel; manual picker requires explicit model after family changes',()=>{
 assert.ok(html.includes("usbPanel23.className='usb-advanced75'"));
 assert.ok(html.includes("$('transportDemo').after(usbPanel23)"));
 assert.ok(html.includes("#device>.layout>.panel{margin-bottom:0"));
 assert.ok(html.includes("#nativePanel75>a.btn{display:flex"));
 assert.ok(html.includes("targetStage75!==null&&targetStage75!=='ready'"));
 assert.ok(html.includes("body.scrollTo({top,behavior:"));
});
