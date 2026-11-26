// Fail closed for changes to the exact public npm dependency inventory.
import {readFileSync,readdirSync,statSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join,relative} from 'node:path';
const approved={
 'atob-lite': ['2.0.0','MIT'],
 'crypto-js': ['4.2.0','MIT'],
 'esptool-js': ['0.7.1','Apache-2.0'],
 'pako': ['2.2.0','(MIT AND Zlib)'],
 'web-serial-polyfill': ['1.0.15','Apache']
};
const lock=JSON.parse(readFileSync('package-lock.json','utf8')),seen=new Set(),sections=[];
for(const [path,meta] of Object.entries(lock.packages)){
 if(!path||meta.dev)continue;
 const name=path.replace(/^node_modules\//,'');
 const rule=approved[name];
 if(!rule||seen.has(name)||meta.version!==rule[0]||meta.license!==rule[1])throw Error('Public dependency requires review: '+path);
 const actual=JSON.parse(readFileSync(join(path,'package.json'),'utf8'));
 if(actual.name!==name||actual.version!==meta.version||actual.license!==meta.license)throw Error('Dependency metadata mismatch: '+name);
 const licenseFile=n=>/^(licen[cs]e|copying)([._-].*)?$/i.test(n);
 const noticeFile=n=>/^(notice|copyright|third[-_ ]party[-_ ](?:notices|licenses))([._-].*)?$/i.test(n);
 const root=readdirSync(path).filter(n=>licenseFile(n)&&statSync(join(path,n)).isFile());
 if(!root.length)throw Error('Missing upstream license: '+name);
 const documents=[];
 function walk(dir){
  for(const n of readdirSync(dir).sort()){
   if(n==='node_modules'||n.startsWith('.'))continue;
   const full=join(dir,n),st=statSync(full);
   if(st.isDirectory())walk(full);
   else if(st.isFile()&&(licenseFile(n)||noticeFile(n))){
    const body=readFileSync(full,'utf8').trim();
    if(!body)throw Error('Empty license/notice '+full);
    documents.push(relative(path,full)+'\n'+body);
   }
  }
 }
 walk(path);seen.add(name);
 sections.push(name+' '+actual.version+' — '+meta.license+'\n'+documents.join('\n\n'));
}
if(seen.size!==Object.keys(approved).length)throw Error('Public dependency inventory changed');
const dir='public/licenses';mkdirSync(dir,{recursive:true});
writeFileSync(join(dir,'npm-THIRD-PARTY-NOTICES.txt'),'Flasher Studio browser bundle: upstream license and notice files\n\n'+sections.join('\n\n========================================\n\n')+'\n');
console.log('Public npm inventory: '+seen.size+' exact dependencies; upstream notices collected.');
