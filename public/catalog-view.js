// Catalogue view only. Never change record IDs, target metadata or storage.
export const UNKNOWN_FAMILY='Не определено',UNKNOWN_CHIP='Микроконтроллер не указан';
const clean=x=>typeof x==='string'?x.trim():'';
export function catalogScope(record,kind,families,catalog){
 const target=kind==='app'?record:record?.target||{},board=clean(target.board==='Custom PCB / другая модель'?target.custom:target.board);
 const explicit=clean(record?.family),indexed=Number.isInteger(target.fi)?families[target.fi]:undefined;
 let family=explicit||indexed||'';
 if(explicit&&indexed&&explicit!==indexed)return {family:UNKNOWN_FAMILY,chip:UNKNOWN_CHIP};
 if(family&&!families.includes(family))return {family:UNKNOWN_FAMILY,chip:UNKNOWN_CHIP};
 if(!family&&board){const matches=families.filter(f=>Object.values(catalog[f]||{}).some(a=>Array.isArray(a)&&a.includes(board)));if(matches.length===1)family=matches[0];}
 if(!family)return {family:UNKNOWN_FAMILY,chip:UNKNOWN_CHIP};
 const known=Object.entries(catalog[family]||{}).filter(([,a])=>Array.isArray(a)&&a.includes(board)).map(([k])=>k);
 const declared=clean(target.chip);
 if(declared&&known.length&&!known.includes(declared))return {family,chip:UNKNOWN_CHIP};
 let chip=declared||(known.length===1?known[0]:'');
 // Exact STM32 target markings are useful; never infer density from a series or generic label.
 if(family==='STM32'){
  const exact=({'Blue Pill STM32F103':'STM32F103C8T6','Black Pill F411':'STM32F411CEU6'})[board]||(/^STM32[A-Z0-9]{6,20}$/i.test(board)&&!/[xX]/.test(board)?board.toUpperCase():'');
  if(exact&&(!chip||exact.startsWith('STM32'+chip.replace(/\+$/,''))))chip=exact;
 }
 return {family,chip:chip||UNKNOWN_CHIP};
}
export function splitCatalogGroups(groups,scopeOf,usage){
 const out=[];
 for(const g of groups){
  const buckets=new Map();
  for(const x of g.versions){const scope=scopeOf(x),key=JSON.stringify([scope.family,scope.chip]);if(!buckets.has(key))buckets.set(key,{scope,versions:[]});buckets.get(key).versions.push(x);}
  for(const [key,b] of buckets){const versions=b.versions;
   out.push({...g,scope:b.scope,viewKey:JSON.stringify([g.id,key]),versions,latest:versions[0],boards:[...new Set(versions.map(x=>x.board||x.target?.board).filter(Boolean))],used:new Set(versions.flatMap(usage)).size,time:Math.max(...versions.map(x=>Number(x.createdAt||String(x.id).split('-')[0])||0))});
  }
 }
 return out;
}
export function catalogBuckets(entries,families){
 const map=new Map();
 for(const x of entries){const {family,chip}=x.scope;if(!map.has(family))map.set(family,new Map());const chips=map.get(family);if(!chips.has(chip))chips.set(chip,[]);chips.get(chip).push(x);}
 const order=x=>families.includes(x)?families.indexOf(x):families.length;
 return [...map.entries()].sort((a,b)=>order(a[0])-order(b[0])||a[0].localeCompare(b[0])).map(([family,chips])=>({family,count:[...chips.values()].reduce((n,a)=>n+a.length,0),chips:[...chips.entries()].sort((a,b)=>a[0]===UNKNOWN_CHIP?1:b[0]===UNKNOWN_CHIP?-1:a[0].localeCompare(b[0],undefined,{numeric:true})).map(([chip,items])=>({chip,items}))}));
}
