// Flasher Studio: presentation-only localization. Source strings are canonical.
// Only explicitly marked UI literals are translated. Never translate user data,
// protocol IDs, file paths, stored state or raw compiler/serial output.
const fsLocale = (() => {
  const MESSAGES=FS_I18N_MESSAGES, KEY='flasher-studio.ui-language.v1';
  const keys=Object.keys(MESSAGES), ids=new Map(keys.map((k,i)=>[k,i]));
  const nonce=Math.random().toString(36).slice(2);
  const prefix='\uE100'+nonce+':', suffix='\uE101', slotStart='\uE102'+nonce+':', slotEnd='\uE103';
  const re=new RegExp(prefix+'(\\d+)'+suffix,'g'), slotRe=new RegExp(slotStart+'(\\d+)'+slotEnd,'g');
  const supported=v=>['ru','en','de'].includes(v)?v:'ru';
  function load(storage){try{return supported(storage.getItem(KEY));}catch{return 'ru';}}
  function save(storage,v){try{storage.setItem(KEY,supported(v));return true;}catch{return false;}}
  function translate(source,lang){return lang==='ru'?source:(Object.hasOwn(MESSAGES,source)?MESSAGES[source][supported(lang)]:undefined)??source;}
  let language='ru', observer;
  const nodes=new Set(), attributes=new Set(), textRecords=new WeakMap(), attrRecords=new WeakMap();
  function mark(value){
    if(typeof value!=='string')return value;
    const k=value.trim(),id=ids.get(k);if(id===undefined)return value;
    const start=value.indexOf(k);return value.slice(0,start)+prefix+id+suffix+value.slice(start+k.length);
  }
  function decode(value,lang=language){return String(value??'').replace(re,(match,id)=>keys[Number(id)]===undefined?match:translate(keys[Number(id)],lang));}
  function hasMarker(s){return typeof s==='string'&&s.includes(prefix);}
  function markParts(s){let out='',cursor=0;for(const m of s.matchAll(slotRe)){out+=mark(s.slice(cursor,m.index))+m[0];cursor=m.index+m[0].length;}return out+mark(s.slice(cursor));}
  function msg(strings,...values){let out='';for(let i=0;i<strings.length;i++)out+=mark(strings[i])+(i<values.length?String(values[i]):'');return out;}
  const attrRe=/\b(title|aria-label|placeholder|alt)=(["'])(.*?)\2/gs;
  function markAttrs(s){return s.replace(attrRe,(_,name,q,v)=>name+'='+q+markParts(v)+q);}
  function htmlStatic(s){
    let out='',cursor=0;
    for(const t of s.matchAll(/<!--[\s\S]*?-->|<[^>]*>/g)){
      let part=s.slice(cursor,t.index);
      if(cursor===0&&/^[^<]*["']>/.test(part)){const end=part.indexOf('>')+1;out+=markAttrs(part.slice(0,end));part=part.slice(end);}
      out+=markParts(part)+markAttrs(t[0]);cursor=t.index+t[0].length;
    }
    let tail=s.slice(cursor);
    if(cursor===0&&/^[^<]*["']>/.test(tail)){const end=tail.indexOf('>')+1;out+=markAttrs(tail.slice(0,end));tail=tail.slice(end);}
    const lt=tail.indexOf('<');
    if(lt>=0)out+=markParts(tail.slice(0,lt))+markAttrs(tail.slice(lt));
    else if(/^\s*[^<]*?=["']/.test(tail))out+=markAttrs(tail);
    else out+=markParts(tail);
    return out;
  }
  function html(strings,...values){let raw='';for(let i=0;i<strings.length;i++)raw+=strings[i]+(i<values.length?slotStart+i+slotEnd:'');return htmlStatic(raw).replace(slotRe,(_,i)=>String(values[Number(i)]));}
  function renderNode(n,source){
    if(!hasMarker(source))return;
    let record=textRecords.get(n);
    if(!record){record={node:n,source,last:n.data};textRecords.set(n,record);}
    record.source=source;
    const p=n.parentElement;
    if(p?.tagName==='OPTION'&&!p.hasAttribute('value'))p.setAttribute('value',decode(source,'ru'));
    record.last=decode(source);
    if(n.data!==record.last)n.data=record.last;
    nodes.add(record);
  }
  function renderAttr(el,name,source){
    if(!hasMarker(source))return;
    let map=attrRecords.get(el);if(!map){map=new Map();attrRecords.set(el,map);}
    let record=map.get(name);if(!record){record={element:el,name,source,last:el.getAttribute(name)};map.set(name,record);}
    record.source=source;record.last=decode(source);
    if(el.getAttribute(name)!==record.last)el.setAttribute(name,record.last);
    attributes.add(record);
  }
  const names=['title','aria-label','placeholder','alt'];
  function scan(root,initial=false){
    if(!root)return;
    const text=n=>{
      const p=n.parentElement;if(p?.closest('script,style,code,textarea,input'))return;
      const rec=textRecords.get(n);
      const source=rec&&n.data===rec.last?rec.source:hasMarker(n.data)?n.data:initial?mark(n.data):n.data;
      if(hasMarker(source))renderNode(n,source);
    };
    const attrs=el=>{
      for(const name of names){const v=el.getAttribute(name);if(v===null)continue;const rec=attrRecords.get(el)?.get(name);const source=rec&&v===rec.last?rec.source:hasMarker(v)?v:initial?mark(v):v;if(hasMarker(source))renderAttr(el,name,source);}
    };
    if(root.nodeType===3){text(root);return;}
    if(root.nodeType===1)attrs(root);
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);while(walker.nextNode())text(walker.currentNode);
    for(const el of root.querySelectorAll?.('[title],[aria-label],[placeholder],[alt]')??[])attrs(el);
  }
  function sourceText(n){
    if(n==null)return undefined;
    if(n.nodeType===3||n.nodeType===4){const rec=textRecords.get(n);return rec&&n.data===rec.last?rec.source:n.data;}
    if(!n.childNodes)return n.textContent;
    let out='';for(const c of n.childNodes)if(c.nodeType!==8)out+=sourceText(c)??'';
    return out;
  }
  function rawText(n){const s=sourceText(n);return s===undefined?undefined:decode(s,'ru');}
  function sourceAttr(el,name){const v=el.getAttribute(name),r=attrRecords.get(el)?.get(name);return r&&v===r.last?r.source:v;}
  function setText(el,value){
    const s=String(value??'');
    if(el.childNodes.length===1&&el.firstChild.nodeType===3&&sourceText(el)===s){scan(el);return value;}
    el.textContent=s;scan(el);return value;
  }
  function appendText(el,value){setText(el,(sourceText(el)??'')+String(value));return value;}
  function setHTML(el,value){el.innerHTML=value;scan(el);return value;}
  function insertHTML(el,position,value){el.insertAdjacentHTML(position,value);scan(position==='beforebegin'||position==='afterend'?el.parentNode:el);}
  function setAttr(el,name,value){el.setAttribute(name,value);if(names.includes(name))scan(el);return value;}
  function setProperty(el,name,value){el[name]=value;scan(el);return value;}
  function option(label,...rest){const canonical=decode(label,'ru');const o=new Option(canonical,...(rest.length?rest:[canonical]));setText(o,label);return o;}
  function createText(value){const n=document.createTextNode(String(value));scan(n);return n;}
  const errorFragments=keys.filter(k=>k.length>=18&&(k.endsWith(':')||k.endsWith('(')||k.startsWith(').')||k.startsWith(', но '))).sort((a,b)=>b.length-a.length);
  function errorMessage(value){
    if(typeof value!=='string')return value;const exact=mark(value);if(exact!==value||hasMarker(value))return exact;
    for(const k of errorFragments){if(value.startsWith(k))return mark(k)+value.slice(k.length);if(value.endsWith(k))return value.slice(0,-k.length)+mark(k);}
    return value;
  }
  function confirmMessage(value){return globalThis.confirm(decode(value));}
  function apply(value){
    language=supported(value);document.documentElement.lang=language;
    for(const r of nodes){if(!r.node.isConnected||r.node.data!==r.last){nodes.delete(r);continue;}renderNode(r.node,r.source);}
    for(const r of attributes){if(!r.element.isConnected||r.element.getAttribute(r.name)!==r.last){attributes.delete(r);continue;}renderAttr(r.element,r.name,r.source);}
    document.dispatchEvent(new Event('fs-language-change'));
  }
  function capture(){scan(document.body,true);}
  function start(storage){
    const selector=document.getElementById('fsLanguage');if(!selector)return;
    selector.value=load(storage);apply(selector.value);
    observer=new MutationObserver(records=>{
      for(const r of records){if(r.type==='characterData'||r.type==='attributes'){scan(r.target);continue;}for(const n of r.addedNodes)scan(n);}
      for(const r of nodes)if(!r.node.isConnected)nodes.delete(r);
      for(const r of attributes)if(!r.element.isConnected)attributes.delete(r);
    });
    observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:names});
    selector.addEventListener('change',()=>{save(storage,selector.value);apply(selector.value);});
    scan(document.body);
  }
  return {capture,start,translate,load,save,supported,mark,msg,html,htmlStatic,decode,sourceText,rawText,sourceAttr,setText,appendText,setHTML,insertHTML,setAttr,setProperty,option,createText,errorMessage,confirm:confirmMessage,language:()=>language};
})();
globalThis.fsLocale=fsLocale;
