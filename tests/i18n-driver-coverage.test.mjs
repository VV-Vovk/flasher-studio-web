import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const dir=new URL('../public/',import.meta.url);
const cat=readFileSync(new URL('i18n-catalog.js',dir),'utf8');
const js=readFileSync(new URL('i18n.js',dir),'utf8');
const {dictionary,locale}=runInNewContext(cat+'\n'+js+'\n({dictionary:FS_I18N_MESSAGES,locale:fsLocale});');
test('Every literal Error message in shipped application modules has EN/DE dictionary entries',()=>{
 const missing=[];
 for(const file of readdirSync(dir).filter(n=>n.endsWith('.js')&&!/^(?:i18n|sw\.js|usb-vendor)/.test(n))){
  const s=readFileSync(new URL(file,dir),'utf8');
  for(const m of s.matchAll(/(?:throw |new )Error\((['"])(.*?)\1/g)){
   const key=m[2].trim();
   if(!Object.hasOwn(dictionary,key)||!dictionary[key].en||!dictionary[key].de)missing.push(file+': '+key);
  }
 }
 assert.deepEqual(missing,[]);
});
test('Numeric diagnostic suffixes retain their actual values',()=>{
 assert.equal(locale.decode(locale.errorMessage('STM32H72/H73 Flash status 0x800000'),'de'),'STM32H72/H73: Flash-Status 0x800000');
 assert.equal(locale.decode(locale.errorMessage('DAP status 255'),'de'),'DAP-Status 255');
 assert.equal(locale.decode(locale.errorMessage('USBasp request 4 failed'),'de'),'USBasp-Anfrage 4 failed');
 assert.equal(locale.decode(locale.errorMessage('unrecognized external driver diagnostic'),'de'),'unrecognized external driver diagnostic');
});
