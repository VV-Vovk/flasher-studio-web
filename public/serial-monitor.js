// Local serial monitor and numeric plotter. No network, external libraries or persistence of serial data.
export const BAUD_RATES=[1200,2400,4800,9600,19200,38400,57600,74880,115200,230400,460800,921600,1000000];
export const ENDINGS=Object.freeze({none:'',lf:'\n',cr:'\r',crlf:'\r\n'});
const NUM=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const NAME=/^[A-Za-z_][A-Za-z0-9_.-]{0,31}$/;
export function parsePlotLine(line){
 if(typeof line!=='string'||line.length>1024)return null;
 const fields=line.trim().split(/[\s,;]+/).filter(Boolean);
 if(!fields.length||fields.length>8)return null;
 const result=Object.create(null);let named=null;
 for(let i=0;i<fields.length;i++){
   const f=fields[i],p=f.indexOf(':'),has=p>=0;
   if(named!==null&&named!==has)return null;named=has;
   const name=has?f.slice(0,p):'Value '+(i+1),raw=has?f.slice(p+1):f;
   if((has&&!NAME.test(name))||Object.hasOwn(result,name)||!NUM.test(raw))return null;
   const n=Number(raw);if(!Number.isFinite(n)||Math.abs(n)>1e100)return null;result[name]=n;
 }
 return result;
}
export class SerialLines {
 constructor(onText,onLine){this.onText=onText;this.onLine=onLine;this.decoder=new TextDecoder();this.tail='';this.discard=false;this.cr=false;}
 feed(bytes){this.consume(this.decoder.decode(bytes,{stream:true}));}
 consume(s){
   if(!s)return;this.onText(s);
   for(const c of s){
     if(c==='\n'&&this.cr){this.cr=false;continue;}
     this.cr=c==='\r';
     if(c==='\r'||c==='\n'){if(!this.discard&&this.tail)this.onLine(this.tail);this.tail='';this.discard=false;}
     else if(!this.discard){this.tail+=c;if(this.tail.length>1024){this.tail='';this.discard=true;}}
   }
 }
 finish(){this.consume(this.decoder.decode());this.tail='';}
}
export class PlotHistory {
 constructor(limit=10000){this.limit=Math.min(10000,Math.max(1,limit));this.clear();}
 clear(){this.rows=[];this.names=[];this.seq=0;}
 add(values,t){
   if(!values)return false;
   const names=Object.keys(values);if(new Set([...this.names,...names]).size>8)return false;
   for(const n of names)if(!this.names.includes(n))this.names.push(n);
   this.rows.push({i:++this.seq,t,values});
   if(this.rows.length>this.limit)this.rows.splice(0,this.rows.length-this.limit);
   return true;
 }
 csv(){return ['sample,time_s,'+this.names.join(','),...this.rows.map(r=>[r.i,r.t.toFixed(3),...this.names.map(n=>r.values[n]??'')].join(','))].join('\r\n')+'\r\n';}
}
export function encodeSend(text,ending){
 if(typeof text!=='string'||text.length>4096||!Object.hasOwn(ENDINGS,ending))throw Error('Сообщение или окончание строки недопустимо');
 return new TextEncoder().encode(text+ENDINGS[ending]);
}
export class MonitorSession {
 constructor({onText=()=>{},onLine=()=>{},onEnd=()=>{}}={}){
   this.onEnd=onEnd;this.lines=new SerialLines(onText,onLine);this.closing=false;this.closed=false;
 }
 async open(port,options){
   this.port=port;
   try{
     await port.open(options);
     this.reader=port.readable.getReader();this.writer=port.writable.getWriter();
     this.loop=this.readLoop();
   }catch(e){await this.close();throw e;}
 }
 async readLoop(){
   let error=null;
   try{while(!this.closing){const {value,done}=await this.reader.read();if(done)break;if(value)this.lines.feed(value);}}
   catch(e){if(!this.closing)error=e;}
   finally{this.lines.finish();if(!this.closing)queueMicrotask(()=>this.onEnd(error||Error('Порт отключён')));}
 }
 async send(text,ending){if(this.closing||!this.writer)throw Error('Порт не подключён');await this.writer.write(encodeSend(text,ending));}
 async close(){
   if(this.closeTask)return this.closeTask;
   this.closing=true;
   this.closeTask=(async()=>{
     // Cancel stream first; USB-UART's underlying pending transfer may need USB close to settle.
     const cancel=this.reader?.cancel().catch(()=>{});
     const abort=this.writer?.abort().catch(()=>{});
     if(this.port?.device?.opened)await this.port.close().catch(()=>{});
     await Promise.all([cancel,abort,this.loop]);
     try{this.reader?.releaseLock();}catch{}try{this.writer?.releaseLock();}catch{}
     await this.port?.close().catch(()=>{});
     this.closed=true;
   })();
   return this.closeTask;
 }
}
const COLORS=['#5598ff','#28bd91','#eaa74e','#c084fc','#f87171','#22c6dc','#e5d457','#94a3b8'];
const $=(root,id)=>root.querySelector('#'+id);
export function mountMonitor(root,{requestPort,available,canOpen,onLock,onUnlock}){
 const el=id=>$(root,id);let session=null,locked=false,opening=false,closing=false,paused=false,mode='text',dirty=true,frame=0,txt='',t0=performance.now(),stamp=true,atLine=true,txBusy=false;
 const history=new PlotHistory(),hidden=new Set();let bytesRx=0,bytesTx=0,previousStamp='';
 const ui=globalThis.fsLocale, tr=s=>ui?.mark(s)??s, err=s=>ui?.errorMessage(s)??s;
 const put=(id,v)=>{if(ui)ui.setText(el(id),v);else el(id).textContent=v;};
 const status=s=>put('monStatus',s);
 function refresh(){
   el('monConnect').disabled=opening||closing||(!locked&&(!available(el('monTransport').value)||!canOpen()));
   put('monConnect',tr(opening?'Подключение…':closing?'Закрытие…':locked?'Отключить':'Подключить'));
   for(const id of ['monTransport','monBaud','monParity','monBits','monStop'])el(id).disabled=locked||opening||closing;
   el('monSend').disabled=!session||opening||closing||txBusy;
   el('monCommand').disabled=!session||opening||closing;
   put('monPause',tr(paused?'Продолжить':'Пауза'));
   el('monDot').classList.toggle('ok',!!session&&!opening&&!closing);
 }
 function append(s){
   txt=(txt+s).slice(-180000);dirty=true;
 }
 function textRx(s){
   bytesRx+=new TextEncoder().encode(s).length;
   if(!stamp){append(s);return;}
   // Prefix at the start of each physical line, including split USB packets.
   let out='';
   for(const c of s){if(atLine&&c!=='\r'&&c!=='\n'){out+='['+new Date().toLocaleTimeString('ru-RU',{hour12:false})+'] ';atLine=false;}out+=c;if(c==='\n'||c==='\r')atLine=true;}
   append(out);
 }
 function draw(){
   const canvas=el('monCanvas'),rect=canvas.getBoundingClientRect();if(rect.width<1||rect.height<1)return;
   const dpr=Math.min(devicePixelRatio||1,2),w=rect.width,h=rect.height;
   if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
   const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
   const css=getComputedStyle(root),fg=css.getPropertyValue('--text').trim()||'#e9f0fa',grid=css.getPropertyValue('--line').trim()||'#303a4b';
   ctx.font='11px system-ui';ctx.fillStyle=fg;ctx.strokeStyle=grid;ctx.lineWidth=1;
   const rows=history.rows.slice(-Number(el('monWindow').value)),names=history.names.filter(n=>!hidden.has(n));
   const left=65,right=Math.max(66,w-12),top=16,bottom=Math.max(top+1,h-30);
   if(!rows.length||!names.length){ctx.textAlign='center';ctx.fillText(ui?.translate('Ожидаем числовые данные…',ui.language())??'Ожидаем числовые данные…',w/2,h/2);return;}
   let lo=Infinity,hi=-Infinity;for(const r of rows)for(const n of names){const v=r.values[n];if(v!==undefined){lo=Math.min(lo,v);hi=Math.max(hi,v);}}
   if(!Number.isFinite(lo)||!Number.isFinite(hi))return;
   if(lo===hi){const p=Math.max(Math.abs(lo)*.05,1);lo-=p;hi+=p;}else{const p=(hi-lo)*.08;lo-=p;hi+=p;}
   const x0=rows[0].i,x1=Math.max(x0+1,rows.at(-1).i);
   const X=i=>left+(i-x0)/(x1-x0)*(right-left),Y=v=>bottom-(v-lo)/(hi-lo)*(bottom-top);
   ctx.textAlign='right';ctx.textBaseline='middle';
   for(let i=0;i<=4;i++){const y=top+(bottom-top)*i/4,v=hi-(hi-lo)*i/4;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();ctx.fillText(Number(v.toPrecision(4)).toString(),left-5,y);}
   ctx.textAlign='center';for(let i=0;i<=4;i++){const x=left+(right-left)*i/4;ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,bottom);ctx.stroke();ctx.fillText(String(Math.round(x0+(x1-x0)*i/4)),x,bottom+13);}
   ctx.save();ctx.beginPath();ctx.rect(left,top,right-left,bottom-top);ctx.clip();
   for(const n of names){ctx.strokeStyle=COLORS[history.names.indexOf(n)];ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=1.6;ctx.beginPath();let started=false,last=null;
     for(const r of rows){const v=r.values[n];if(v===undefined){started=false;continue;}const x=X(r.i),y=Y(v);if(started)ctx.lineTo(x,y);else ctx.moveTo(x,y);started=true;last=[x,y];}ctx.stroke();if(last){ctx.beginPath();ctx.arc(...last,2.4,0,Math.PI*2);ctx.fill();}
   }ctx.restore();
 }
 function legend(){
   const container=el('monLegend');container.replaceChildren();
   history.names.forEach((n,i)=>{const b=document.createElement('button');b.type='button';b.className='monSeries';b.style.setProperty('--series',COLORS[i]);b.textContent=n;b.setAttribute('aria-pressed',String(!hidden.has(n)));b.onclick=()=>{hidden.has(n)?hidden.delete(n):hidden.add(n);legend();draw();};container.append(b);});
 }
 let lastDraw=0,lastNames='';
 function tick(t){
   frame=requestAnimationFrame(tick);
   if(!root.hidden&&t-lastDraw>500&&!locked&&!opening&&!closing){const disabled=!available(el('monTransport').value)||!canOpen();if(el('monConnect').disabled!==disabled)el('monConnect').disabled=disabled;}
   if(root.hidden||paused||!dirty||t-lastDraw<100)return;
   lastDraw=t;dirty=false;
   if(mode==='text'){
     const pre=el('monText'),follow=el('monScroll').checked;pre.textContent=txt;if(follow)pre.scrollTop=pre.scrollHeight;
   }else{const k=history.names.join('|');if(k!==lastNames){lastNames=k;legend();}draw();}
   put('monStats','RX '+bytesRx.toLocaleString('ru-RU')+' '+tr('Б')+' · TX '+bytesTx.toLocaleString('ru-RU')+' '+tr('Б')+' · '+history.rows.length+' '+tr('точек'));
 }
 frame=requestAnimationFrame(tick);
 async function disconnect(message='Не подключено'){
   if(closing)return;
   closing=true;refresh();const s=session;session=null;
   try{await s?.close();status(err(message));}catch(e){status(tr('Ошибка закрытия: ')+err(e.message));}
   finally{opening=false;closing=false;if(locked){locked=false;onUnlock();}refresh();}
 }
 el('monConnect').onclick=async()=>{
   if(locked){await disconnect();return;}
   if(opening||closing||!canOpen())return;
   opening=true;locked=true;onLock();refresh();status(tr('Выбери последовательный порт…'));
   let current=null;
   try{
     const port=await requestPort(el('monTransport').value);
     t0=performance.now();atLine=true;history.clear();hidden.clear();lastNames='';txt='';bytesRx=bytesTx=0;dirty=true;
     current=new MonitorSession({onText:textRx,onLine:line=>{if(history.add(parsePlotLine(line),(performance.now()-t0)/1000))dirty=true;},onEnd:e=>{if(session===current)void disconnect(e.message);}});
     session=current;await current.open(port,{baudRate:Number(el('monBaud').value),dataBits:Number(el('monBits').value),stopBits:Number(el('monStop').value),parity:el('monParity').value,flowControl:'none'});
     opening=false;
     if(root.hidden){await disconnect();return;}
     status(tr('Подключено')+' · '+el('monBaud').value+' '+tr('бод'));refresh();
   }catch(e){await disconnect(e.name==='NotFoundError'?tr('Порт не выбран'):tr('Ошибка: ')+err(e.message));}
 };
 async function send(){
   if(!session||txBusy||opening||closing)return;
   const s=session,cmd=el('monCommand').value,ending=el('monEnding').value;
   if(!cmd&&ending==='none')return;
   txBusy=true;refresh();
   try{await s.send(cmd,ending);bytesTx+=encodeSend(cmd,ending).length;if(el('monEcho').checked){append('\n→ '+cmd+ENDINGS[ending]);atLine=true;}el('monCommand').value='';dirty=true;}
   catch(e){status(tr('Ошибка передачи: ')+err(e.message));}
   finally{txBusy=false;refresh();}
 }
 el('monSend').onclick=send;el('monCommand').onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();void send();}};
 function setMode(m){mode=m;el('monTextPanel').hidden=m!=='text';el('monPlotPanel').hidden=m!=='plot';el('monTabText').classList.toggle('active',m==='text');el('monTabPlot').classList.toggle('active',m==='plot');dirty=true;if(m==='plot'){legend();draw();}}
 el('monTabText').onclick=()=>setMode('text');el('monTabPlot').onclick=()=>setMode('plot');
 el('monPause').onclick=()=>{paused=!paused;dirty=true;refresh();};
 el('monClear').onclick=()=>{txt='';history.clear();hidden.clear();lastNames='';bytesRx=bytesTx=0;atLine=true;t0=performance.now();el('monText').textContent='';legend();draw();dirty=true;};
 el('monStamp').onchange=()=>{stamp=el('monStamp').checked;};
 el('monWindow').onchange=()=>{dirty=true;draw();};
 el('monScroll').onchange=()=>{dirty=true;};
 function download(data,type,name){const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
 el('monExport').onclick=()=>{if(mode==='text')download(txt,'text/plain;charset=utf-8','serial-log.txt');else download(history.csv(),'text/csv;charset=utf-8','serial-plot.csv');};
 el('monTransport').onchange=refresh;
 // Auto uses the shared wired routing, including Android WebUSB.
 new ResizeObserver(()=>{dirty=true;if(mode==='plot'&&!paused)draw();}).observe(el('monCanvas'));
 document.addEventListener('fs-language-change',()=>{dirty=true;if(mode==='plot')draw();});
 refresh();
 return {refresh,disconnect,isLocked:()=>locked,isOpening:()=>opening};
}
