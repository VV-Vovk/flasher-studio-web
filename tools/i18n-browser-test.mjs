import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve,extname } from 'node:path';
import assert from 'node:assert/strict';
const root=resolve('public');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.css':'text/css','.wasm':'application/wasm'};
const server=createServer(async(req,res)=>{try{
 const path=resolve(root,'.'+(new URL(req.url,'http://localhost').pathname==='/'?'/index.html':new URL(req.url,'http://localhost').pathname==='/guide/'?'/guide/index.html':new URL(req.url,'http://localhost').pathname));
 if(!path.startsWith(root+'/'))throw Error('invalid path');
 res.setHeader('content-type',types[extname(path)]||'application/octet-stream');res.end(await readFile(path));
}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;try{
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:430,height:900},serviceWorkers:'block'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.locator('#nav button[data-view=settings]').click();
 assert.equal(await page.locator('#settings h1').textContent(),'Настройки');
 const selector=page.locator('#fsLanguage');
 for(const [lang,label] of [['en','Settings'],['de','Einstellungen'],['ru','Настройки']]){
  await selector.selectOption(lang);
  assert.equal(await page.locator('html').getAttribute('lang'),lang);
  assert.equal(await page.locator('#settings h1').textContent(),label);
  assert.equal(await page.locator('#setupGuideLink').getAttribute('href'),'/guide/');
  assert.equal(await page.locator('#setupGuideLink').textContent(),{ru:'Пошаговая инструкция · RU / EN / DE',en:'Step-by-step setup guide · RU / EN / DE',de:'Schritt-für-Schritt-Anleitung · RU / EN / DE'}[lang]);
 }
 // Check actual geometry, not only the presence of the link.
 for(const width of [320,360,430,1280]){
  await page.setViewportSize({width,height:900});
  for(const lang of ['ru','en','de']){
   await selector.selectOption(lang);
   await page.locator('#setupGuideLink').scrollIntoViewIfNeeded();
   const geometry=await page.evaluate(()=>{
    const link=document.getElementById('setupGuideLink'),status=document.getElementById('liveRepoStatus'),form=document.getElementById('githubCredentialForm'),help=link.parentElement.querySelector('.github-help59');
    const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
    return {link:rect(link),status:rect(status),form:rect(form),help:rect(help),display:getComputedStyle(link).display,decoration:getComputedStyle(link).textDecorationLine};
   });
   assert.ok(geometry.link.top>=geometry.status.bottom+8,'guide overlaps access status '+lang+' '+width);
   assert.ok(geometry.help.top>=geometry.link.bottom,'guide overlaps help '+lang+' '+width);
   assert.ok(Math.abs(geometry.link.width-geometry.form.width)<=2,'guide width '+lang+' '+width);
   assert.ok(geometry.link.height>=44);
   assert.equal(geometry.display,'flex');
   assert.equal(geometry.decoration,'none');
  }
 }
 await page.setViewportSize({width:430,height:900});
 await selector.selectOption('ru');
 await page.evaluate(()=>{const e=document.createElement('span');e.id='i18nUser';fsLocale.setText(e,'Проект');document.body.append(e);const select=document.createElement('select');select.id='i18nValue';select.append(fsLocale.option(fsLocale.mark('Подключить устройство'),'Подключить устройство'));document.body.append(select);});
 await selector.selectOption('de');
 assert.equal(await page.locator('#i18nUser').textContent(),'Проект');
 assert.equal(await page.locator('#i18nValue').inputValue(),'Подключить устройство');
 assert.equal(await page.locator('#i18nValue option').textContent(),'Gerät verbinden');
 const confirmation=page.waitForEvent('dialog').then(async d=>{const message=d.message();await d.dismiss();assert.match(message,/Flash/i);assert.doesNotMatch(message,/[А-Яа-яЁё]/);});
 await Promise.all([confirmation,page.evaluate(()=>fsLocale.confirm(fsLocale.mark('Вся пользовательская Flash будет стёрта.')))]);
 await page.reload();await page.locator('#nav button[data-view=settings]').click();
 assert.equal(await selector.inputValue(),'de');
 assert.equal(await page.locator('#settings h1').textContent(),'Einstellungen');
 await page.locator('#nav button[data-view=device]').click();
 assert.equal(await page.locator('html').getAttribute('lang'),'de');
 // Target picker must work directly from Device before and after the first selection.
 await page.waitForFunction(()=>typeof support34!=='undefined'&&support34!==null);
 await page.evaluate(()=>{const el=document.getElementById('fsLanguage');el.value='ru';el.dispatchEvent(new Event('change'));});
 // Empty connection state: one target selection action, no transport hint.
 for(const lang of ['ru','en','de']){
  await page.evaluate(lang=>{const el=document.getElementById('fsLanguage');el.value=lang;el.dispatchEvent(new Event('change'));renderDevice();},lang);
  assert.ok(await page.locator('#deviceTarget74').isVisible());
  assert.ok(await page.locator('#deviceTarget74').evaluate(e=>e.classList.contains('primary')));
  for(const id of ['connect','transport','transportDemo','devStatus','usbAdvanced75'])assert.ok(await page.locator('#'+id).isHidden(),id+' in empty state '+lang);
  assert.ok(await page.locator('#transport + button.picker17').isHidden(),'custom transport picker in empty state '+lang);
  assert.ok(await page.locator('label[for="transport"]').isHidden());
 }
 await page.evaluate(()=>{const el=document.getElementById('fsLanguage');el.value='ru';el.dispatchEvent(new Event('change'));});
 await page.locator('#deviceTarget74').click();
 assert.ok(await page.locator('#targetDialog').isVisible());
 await page.locator('#families [data-i="2"]').click();
 assert.ok(await page.locator('#confirmTarget').isDisabled());
 await page.waitForFunction(()=>{const body=document.querySelector('#targetDialog .dialog-body').getBoundingClientRect(),r=document.getElementById('chipLabel').getBoundingClientRect();return r.top>=body.top-2&&r.bottom<=body.bottom+2;});
 await page.locator('#chips [data-chip="ATmega328P"]').click();
 assert.ok(await page.locator('#confirmTarget').isDisabled());
 await page.waitForFunction(()=>{const body=document.querySelector('#targetDialog .dialog-body').getBoundingClientRect(),r=document.getElementById('boardLabel75').getBoundingClientRect();return r.top>=body.top-2&&r.bottom<=body.bottom+2;});
 await page.locator('#boardList [data-board="Arduino Uno R3"]').click();
 assert.ok(await page.locator('#confirmTarget').isEnabled());
 await page.locator('#confirmTarget').click();
 assert.equal(await page.locator('#deviceTargetLabel74').textContent(),'Изменить целевую плату');
 assert.match(await page.locator('#devBoard').textContent(),/Arduino Uno R3/);
 await page.locator('#deviceTarget74').click();
 await page.locator('#boardList [data-board="Arduino Nano"]').click();
 await page.locator('#closeTarget').click();
 await page.waitForFunction(()=>board==='Arduino Uno R3'&&!document.getElementById('targetDialog').open);
 await page.locator('#deviceTarget74').click();
 await page.locator('#boardList [data-board="Arduino Nano"]').click();
 await page.locator('#confirmTarget').click();
 assert.match(await page.locator('#devBoard').textContent(),/Arduino Nano/);
 assert.ok(await page.locator('#deviceTarget74').isEnabled());
 assert.ok(await page.locator('#connect').isVisible());
 assert.ok(await page.locator('#transport').isHidden(),'native select remains visually replaced');
 const transportPicker77=page.locator('#transport + button.picker17');
 assert.ok(await transportPicker77.isVisible(),'custom transport picker visible after target selection');
 assert.ok(await transportPicker77.isEnabled());
 assert.ok(await page.locator('label[for="transport"]').isVisible());
 await transportPicker77.click();
 assert.ok(await page.locator('#selectItems17').isVisible());
 await page.locator('#selectClose17').click();
 assert.ok(await page.locator('#devStatus').isVisible());
 assert.ok(!(await page.locator('#deviceTarget74').evaluate(e=>e.classList.contains('primary'))));
 assert.doesNotMatch(await page.locator('#transportDemo').textContent(),/STM32:|AVR: нужен/);
 // Compact connection controls and link layout, including narrow/mobile screens.
 for(const width of [320,360,430,1280]){
  await page.setViewportSize({width,height:900});
  const result=await page.evaluate(()=>{
   const usb=document.getElementById('usbAdvanced75'),connect=document.getElementById('connect'),info=document.getElementById('deviceInfo12'),layout=document.querySelector('#device>.layout');
   const native=document.getElementById('nativePanel75');native.open=true;
   const a=native.querySelector('a.btn'),r=a.getBoundingClientRect(),prev=a.previousElementSibling.getBoundingClientRect(),next=a.nextElementSibling.getBoundingClientRect();
   const geometry={nested:usb.parentElement===connect.parentElement,collapsed:!usb.open,gap:getComputedStyle(layout).rowGap,margin:getComputedStyle(connect.parentElement).marginBottom,infoMargin:getComputedStyle(info).marginBottom,infoTopMargin:getComputedStyle(info).marginTop,linkWidth:r.width,available:native.clientWidth,above:r.top-prev.bottom,below:next.top-r.bottom,decoration:getComputedStyle(a).textDecorationLine};
   native.open=false;return geometry;
  });
  assert.ok(result.nested&&result.collapsed);
  assert.equal(result.gap,'14px');assert.equal(result.margin,'0px');assert.equal(result.infoMargin,'0px');assert.equal(result.infoTopMargin,'0px');
  if(width<=430){
   for(const expanded of [false,true]){
    const gaps=await page.evaluate(expanded=>{
     const info=document.getElementById('deviceInfo12'),connection=document.getElementById('connect').parentElement,flash=document.getElementById('flash').closest('.panel'),fold=document.getElementById('infoFold17');
     fold.open=expanded;
     const a=connection.getBoundingClientRect(),b=info.getBoundingClientRect(),c=flash.getBoundingClientRect();
     return [b.top-a.bottom,c.top-b.bottom];
    },expanded);
    for(const gap of gaps)assert.ok(Math.abs(gap-14)<1,'actual mobile panel gap '+gap+' at '+width+' expanded='+expanded);
   }
   await page.evaluate(()=>document.getElementById('infoFold17').open=false);
  }
  assert.ok(result.above>=0&&result.below>=0,'native download overlaps adjacent text at '+width);
  assert.ok(result.linkWidth<=result.available);assert.equal(result.decoration,'none');
 }
 await page.setViewportSize({width:430,height:900});
 // Returning to the empty state must hide the same custom control again.
 await page.evaluate(()=>{clearProject();go('device');renderDevice();});
 assert.ok(await transportPicker77.isHidden());
 assert.ok(await page.locator('#connect').isHidden());
 assert.ok(await page.locator('#deviceTarget74').isVisible());
 // Exercise actual browser IndexedDB, not only the metadata helper.
 await page.waitForFunction(()=>typeof live!=='undefined'&&live!==null);
 const stored=await page.evaluate(async()=>{
  const api=await import('/real-build.js');
  const input={filename:'local-test.HEX',bytes:new TextEncoder().encode(':00000001FF'),target:{board:'STM32F103C8T6',chip:'F1',family:'STM32'},session:{kind:'stm',route:'swd',pr:{flash:65536}},verified:true};
  const first=await api.saveLocalFirmware(input),second=await api.saveLocalFirmware({...input,filename:'duplicate.hex'});
  return {id:first.id,secondId:second.id,filename:api.firmwareFilename(second),count:(await api.list()).filter(x=>x.localFile).length};
 });
 assert.equal(stored.id,stored.secondId);assert.equal(stored.filename,'local-test.HEX');assert.equal(stored.count,1);
 await page.reload();await page.waitForFunction(()=>typeof live!=='undefined'&&live!==null&&lib.some(x=>x.localFile));
 assert.equal(await page.evaluate(async id=>{const api=await import('/real-build.js');return new TextDecoder().decode(await api.binary(id));},stored.id),':00000001FF');
 await page.locator('#nav button[data-view=library]').click();
 assert.ok(await page.getByText('local-test',{exact:true}).count());
 // Simulate a confirmed session in the test page only, without USB writes.
 await page.waitForFunction(()=>typeof extra!=='undefined'&&extra!==null);
 await page.evaluate(()=>{
  fi=5;chip='F1';board='STM32F103C8T6';custom='';targetState='manual';methodSelected='ST-LINK · SWD';renderFamily();
  methodSelected='ST-LINK · SWD';
  hw={kind:'stm',route:'swd',pr:{flash:65536},desc:'STM32F103C8T6 · ST-LINK/V2',key:targetKey12(target12())+'|'+methodSelected,io:{close:async()=>{}}};
  go('device');logHW(fsLocale.errorMessage('DFU: нет дескриптора внутренней Flash'));renderDevice();
 });
 for(const [lang,action,status,diagnostic] of [['en','Disconnect device','Connected','internal Flash descriptor missing'],['de','Gerät trennen','Verbunden','Deskriptor des internen Flash fehlt'],['ru','Отключить устройство','Подключено','нет дескриптора внутренней Flash']]){
  await page.evaluate(lang=>{const el=document.getElementById('fsLanguage');el.value=lang;el.dispatchEvent(new Event('change'));renderDevice();},lang);
  assert.equal(await page.locator('#connect').textContent(),action);
  assert.ok(await page.locator('#deviceTarget74').isDisabled());
  assert.ok((await page.locator('#devStatus').textContent()).startsWith(status));
  assert.ok((await page.locator('#flashLog').textContent()).includes(diagnostic));
 }
 await page.evaluate(()=>{hw=null;renderDevice();});
 assert.equal(await page.locator('#connect').textContent(),'Подключить устройство');
 assert.ok(await page.locator('#deviceTarget74').isEnabled());
 await page.evaluate(async()=>{await choose(new File(['void setup(){} void loop(){}'],'Blink.ino'));});
 assert.equal(await page.locator('#detFramework').textContent(),'Arduino');
 assert.equal(await page.locator('#detSystem').textContent(),'Arduino CLI');
 assert.match(await page.locator('#configRows').textContent(),/Выбрать микроконтроллер/);
 // Mock a real STK500 session with expired bootloader; no physical USB involved.
 await page.evaluate(()=>{
  fi=2;chip='ATmega328P';board='Arduino Nano';custom='';targetState='manual';methodSelected='USB-UART';renderFamily();methodSelected='USB-UART';
  const pr=driver.avrProfile(board);const io={buffer:[],closed:false,error:null,port:{async setSignals(v){window.testAvrSignals.push(v.dataTerminalReady);}},async send(a){this.buffer.push(0x14,...(a[0]===0x75?[0x1e,0x95,0x0f]:a[0]===0x41?[a[1]===0x81?8:3]:[]),0x10);},async read(n){return Uint8Array.from(this.buffer.splice(0,n));},async close(){this.closed=true;}};
  window.testAvrSignals=[];
  hw={kind:'avr',io,avr:new driver.Stk500(io),pr,desc:'ATmega328P · 1e950f',key:targetKey12(target12())+'|'+methodSelected};
  go('device');renderDevice();
 });
 assert.equal(await page.locator('#infoSummary17').textContent(),'ATmega328P · 1e950f');
 await page.locator('#infoFold17').evaluate(el=>el.open=true);
 await page.locator('#readDevice12').click();
 await page.waitForFunction(()=>!hwBusy);
 assert.deepEqual(await page.evaluate(()=>window.testAvrSignals),[false,true,false]);
 assert.equal(await page.locator('#infoSummary17').textContent(),'ATmega328P · 1e950f');
 assert.ok(await page.evaluate(()=>!!hw));
 assert.ok((await page.locator('#deviceDetails12').textContent()).includes('8.3'));
 assert.ok((await page.locator('#deviceDetails12').textContent()).includes('32 KiB'));
 // Exercise the real manual-device picker, naming and persistent records.
 await page.evaluate(()=>chooseManualAvr73(hw));
 await page.locator('#manualAvrNew73').click();
 await page.locator('#deviceNameInput13').fill('Nano A');
 await page.locator('#saveDeviceName13').click();
 const first=await page.evaluate(()=>({record:hw.recordId,hardware:hw.id,count:devices12.filter(d=>d.manual).length}));
 assert.ok(first.record.startsWith('manual-avr-'));assert.equal(first.hardware,undefined);assert.equal(first.count,1);
 await page.evaluate(()=>{delete hw.recordId;active12=linkTarget12='';renderDevice();chooseManualAvr73(hw);});
 await page.locator('#manualAvrNew73').click();
 await page.locator('#deviceNameInput13').fill('Nano B');
 await page.locator('#saveDeviceName13').click();
 const second=await page.evaluate(()=>hw.recordId);
 assert.notEqual(first.record,second);
 await page.evaluate(()=>{delete hw.recordId;active12=linkTarget12='';renderDevice();chooseManualAvr73(hw);});
 await page.locator('#manualAvrChoices73 button').filter({hasText:'Nano A'}).click();
 assert.equal(await page.evaluate(()=>hw.recordId),first.record);
 assert.equal(await page.evaluate(()=>hw.id),undefined);
 assert.ok((await page.locator('#infoSummary17').textContent()).includes('Nano A'));
 await page.evaluate(()=>{delete hw.recordId;active12=linkTarget12='';renderDevice();chooseManualAvr73(hw);});
 await page.locator('#manualAvrSkip73').click();
 assert.equal(await page.evaluate(()=>hw.recordId),undefined);
 await page.evaluate(()=>{hw=null;renderDevice();});
 await page.reload();
 await page.waitForFunction(()=>typeof driver!=='undefined'&&driver!==null);
 assert.deepEqual(await page.evaluate(()=>devices12.filter(d=>d.manual).map(d=>d.name).sort()),['Nano A','Nano B']);
 assert.deepEqual(await page.evaluate(()=>devices12.filter(d=>d.manual).map(d=>d.id).sort()),[first.record,second].sort());
 assert.deepEqual(errors,[]);
 console.log('RU/EN/DE browser localization smoke passed');
 const origin='http://127.0.0.1:'+server.address().port;
 for(const viewport of [{width:430,height:900},{width:1280,height:800}]){
  const guide=await browser.newPage({viewport,acceptDownloads:true,serviceWorkers:'block'});
  const guideErrors=[];guide.on('pageerror',e=>guideErrors.push(e.message));
  await guide.goto(origin+'/guide/');
  assert.equal(await guide.locator('[data-lang]').count(),3);
  for(const lang of ['ru','en','de']){
   await guide.locator('[data-lang='+lang+']').click();
   assert.equal(await guide.locator('html').getAttribute('lang'),lang);
   assert.equal(await guide.locator('#steps button').count(),9);
   for(let i=0;i<9;i++){
    await guide.locator('#steps button').nth(i).click();
    assert.equal(await guide.locator('.slide h2').count(),1);
    assert.ok((await guide.locator('.slide h2').textContent()).length>0);
    assert.equal(await guide.locator('#progress').getAttribute('aria-valuenow'),String(i+1));
    assert.ok(await guide.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'horizontal overflow '+lang+' '+i);
   }
   await guide.locator('#steps button').nth(3).click();
   const zipButton=guide.locator('[data-download$=".zip"]');
   const [zipDownload]=await Promise.all([guide.waitForEvent('download'),zipButton.click()]);
   const zipBytes=await readFile(await zipDownload.path());
   assert.equal(zipBytes.subarray(0,4).toString('hex'),'504b0304');
   await guide.locator('#steps button').nth(7).click();
   await guide.locator('#username').fill('test-user');
   assert.equal(await guide.locator('#repo').textContent(),'test-user/flasher-studio-builder');
   await guide.locator('#steps button').nth(8).click();
   const [testDownload]=await Promise.all([guide.waitForEvent('download'),guide.locator('[data-download="test.ino"]').click()]);
   assert.match(await readFile(await testDownload.path(),'utf8'),/void setup/);
   await guide.locator('#language').click();
  }
  const [htmlDownload]=await Promise.all([guide.waitForEvent('download'),guide.locator('#saveGuide').click()]);
  const htmlText=await readFile(await htmlDownload.path(),'utf8');
  assert.match(htmlText,/data-lang="de"/);assert.match(htmlText,/const payload=/);
  assert.deepEqual(guideErrors,[]);
  await guide.close();
 }
 // Verify the real service-worker path after the app has installed it.
 const offline=await browser.newContext({serviceWorkers:'allow'});
 const op=await offline.newPage();
 await op.goto(origin);
 await op.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;});
 await op.waitForFunction(()=>!!navigator.serviceWorker.controller);
 await op.goto(origin+'/guide/');
 await op.locator('[data-lang=de]').click();
 await offline.setOffline(true);
 await op.reload();
 await op.locator('[data-lang=de]').click();
 assert.equal(await op.locator('.slide h2').textContent(),'Was du brauchst');
 await offline.close();
 console.log('Setup guide: RU/EN/DE, mobile/desktop, local downloads and offline navigation passed');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
