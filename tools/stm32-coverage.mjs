// Repeatable coverage audit of the existing catalog. No network or SDK builds.
import {readFileSync} from 'node:fs';
import {targetCapability} from '../public/target-support.js';
import {swdProfile} from '../public/stm32-swd.js';
const catalog=JSON.parse(readFileSync(new URL('../public/stm32-targets.json',import.meta.url)));
const groups=new Map();
for(const row of catalog){
 const base=row.name.slice(0,11);
 // A synthetic substitution is only a way to evaluate a template in software,
 // never a claim that the resulting ordering code exists.
 const candidate=row.name.replace(/x/g,'6');
 const cap=targetCapability({fi:5,name:candidate},catalog);
 const group=groups.get(row.family)||new Map();
 const v=group.get(base)||{compile:false,swd:false,both:false,entries:0};
 v.compile||=cap.compile;v.swd||=!!swdProfile(candidate);v.both||=cap.compile&&!!swdProfile(candidate);v.entries++;
 group.set(base,v);groups.set(row.family,group);
}
const report=Object.fromEntries([...groups.entries()].map(([family,m])=>{
 const a=[...m.values()];
 return [family,{bases:a.length,compile:a.filter(x=>x.compile).length,swd:a.filter(x=>x.swd).length,both:a.filter(x=>x.both).length}];
}));
console.log(JSON.stringify({scope:'Catalogue base groups; software eligibility only; not hardware or SDK build validation',families:report},null,2));
