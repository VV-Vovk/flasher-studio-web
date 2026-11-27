import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve,extname } from 'node:path';
import assert from 'node:assert/strict';
const root=resolve('public');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.css':'text/css','.wasm':'application/wasm'};
const server=createServer(async(req,res)=>{try{
 const path=resolve(root,'.'+(new URL(req.url,'http://localhost').pathname==='/'?'/index.html':new URL(req.url,'http://localhost').pathname));
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
 }
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
 assert.deepEqual(errors,[]);
 console.log('RU/EN/DE browser localization smoke passed');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
