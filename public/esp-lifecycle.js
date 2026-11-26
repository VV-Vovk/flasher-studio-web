// Bounded ESP session cleanup and small local diagnostics. No token, firmware,
// device serial number, MAC, project names or raw exception messages are stored.
export const USB_LOG_KEY='fs-usb-diagnostics-v1';
const events=new Set(['connect-start','connected','connect-error','write-start','readback-start','flash-verified','usb-disconnect','close-start','close-ok','close-error','close-timeout','write-error']);
const chips=new Set(['esp32','esp32c3','esp32s3','esp32c6','esp32s2','esp32h2','esp8266']);
function storageDefault(){try{return globalThis.localStorage;}catch{return null;}}
export function usbJournal(storage=storageDefault()){
 const read=()=>{try{const a=JSON.parse(storage?.getItem(USB_LOG_KEY)||'[]');return Array.isArray(a)?a.filter(x=>x&&Number.isFinite(x.t)&&events.has(x.event)).slice(-80).map(x=>({t:x.t,event:x.event,chip:chips.has(x.chip)?x.chip:'',vid:Number.isInteger(x.vid)&&x.vid>=0&&x.vid<=65535?x.vid:0,pid:Number.isInteger(x.pid)&&x.pid>=0&&x.pid<=65535?x.pid:0})):[];}catch{return [];}};
 return {read,record(event,session={}){
  if(!events.has(event))return;
  try{const p=session.transport?.device??session.port;const info=p?.getInfo?.()||{};
   const row={t:Date.now(),event,chip:chips.has(session.chip)?session.chip:'',vid:0,pid:0};
   for(const [k,v] of [['vid',info.usbVendorId],['pid',info.usbProductId]])if(Number.isInteger(v)&&v>=0&&v<=65535)row[k]=v;
   storage?.setItem(USB_LOG_KEY,JSON.stringify([...read(),row].slice(-80)));
  }catch{}
 },clear(){try{storage?.removeItem(USB_LOG_KEY);}catch{}}};
}
export function createEspLifecycle({timeout=5000,journal=usbJournal()}={}){
 const tasks=new WeakMap(),lost=new WeakSet();let pending=0,unsafe=false;
 const record=(event,s)=>journal.record(event,s);
 function close(s){
  if(!s?.transport)return Promise.resolve(false);
  const t=s.transport;if(tasks.has(t))return tasks.get(t);
  pending++;record('close-start',s);
  const task=(async()=>{
   let timer;
   try{
    await Promise.race([Promise.resolve().then(()=>t.disconnect()),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('USB close timeout'),{timedOut:true})),timeout);})]);
    const p=t.device;
    if(p?.device?.opened===true||p?.readable?.locked||p?.writable?.locked)throw Error('USB not released');
    record('close-ok',s);return true;
   }catch(e){unsafe=true;record(e?.timedOut?'close-timeout':'close-error',s);return false;}
   finally{clearTimeout(timer);pending--;}
  })();
  tasks.set(t,task);return task;
 }
 function matches(s,event){const p=s?.transport?.device;return !!p&&(event?.device?event.device===p.device||event.device===p.device_:event?.port?event.port===p:event?.target===p);}
 function markLost(s){if(s?.transport&&!lost.has(s.transport)){lost.add(s.transport);record('usb-disconnect',s);}}
 function assertLive(s){if(lost.has(s?.transport))throw Error('ESP USB отключён во время операции');}
 return {close,matches,markLost,assertLive,record,blocked:()=>pending>0||unsafe,unsafe:()=>unsafe,journal};
}
export const espLifecycle=createEspLifecycle();
export const ESP_CLOSE_WARNING='USB-соединение не удалось подтвердить как закрытое. Не нажимай RESET при подключённом USB. Отсоедини кабель, закрой приложение и только потом снова открой его.';
