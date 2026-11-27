import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const js=readFileSync(new URL('../public/i18n.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const catalog=readFileSync(new URL('../public/i18n-catalog.js',import.meta.url),'utf8');
const locale=runInNewContext(catalog+'\n'+js+'\nfsLocale;');
test('Russian default, English and German translation, unknown text is untouched',()=>{
 assert.equal(locale.load({getItem:()=>null}),'ru');
 assert.equal(locale.load({getItem:()=> 'xx'}),'ru');
 assert.equal(locale.translate('Подключить устройство','en'),'Connect device');
 assert.equal(locale.translate('Подключить устройство','de'),'Gerät verbinden');
 assert.equal(locale.translate('Подключить устройство','ru'),'Подключить устройство');
 assert.equal(locale.translate('STM32F103C8T6','de'),'STM32F103C8T6');
 assert.equal(locale.translate('custom project','en'),'custom project');
});
test('Language preference round trips and storage failure is safe',()=>{
 const map=new Map(),storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};
 assert.equal(locale.save(storage,'de'),true);
 assert.equal(locale.load(storage),'de');
 assert.equal(locale.save(storage,'unknown'),true);
 assert.equal(locale.load(storage),'ru');
 assert.equal(locale.load(undefined),'ru');
 assert.equal(locale.save(undefined,'en'),false);
});
test('All original static Russian text and attributes have both translations',()=>{
 const markup=html.slice(0,html.indexOf('<script'));
 const strings=[...markup.matchAll(/>([^<>]*[А-Яа-яЁё][^<>]*)</g)].map(x=>x[1].trim()).filter(x=>x.length<400&&x!=='Русский');
 strings.push(...[...markup.matchAll(/(?:aria-label|placeholder|title)="([^"]*[А-Яа-яЁё][^"]*)"/g)].map(x=>x[1]));
 for(const source of new Set(strings))for(const lang of ['en','de'])assert.notEqual(locale.translate(source,lang),source,source+' '+lang);
 assert.match(html,/<select id="fsLanguage">/);
 assert.ok(html.includes('fsLocale.capture()'));
 assert.ok(html.includes('fsLocale.start(fsLocaleStorage)'));
});

test('Dynamic inventory translated and user data stays verbatim',()=>{
 const source=JSON.parse(readFileSync(new URL('../tools/i18n-source-ru.json',import.meta.url),'utf8'));
 const dictionary=runInNewContext(catalog+'\nFS_I18N_MESSAGES;');
 for(const k of source)for(const lang of ['en','de'])assert.ok(typeof dictionary[k]?.[lang]==='string'&&dictionary[k][lang].length,k+' '+lang);
 const user='Проект';
 const marked=locale.mark('Записать ')+user;
 assert.equal(locale.decode(marked,'ru'),'Записать '+user);
 assert.ok(locale.decode(marked,'de').endsWith(user));
 assert.notEqual(locale.decode(marked,'de'),locale.decode(marked,'ru'));
 const html=locale.htmlStatic('<button data-method="Запись приложения" title="Подключить устройство">Подключить устройство</button>');
 assert.match(locale.decode(html,'en'),/data-method="Запись приложения" title="Connect device">Connect device/);
 assert.equal(locale.decode('Проект','de'),'Проект');
});
