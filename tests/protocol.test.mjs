import test from 'node:test';import assert from 'node:assert/strict';import {parseHex,denseImage,Stm32Rom,Stk500,validateStmVector,avrProfile} from '../public/programmers.js';
const rec=(type,addr,data)=>{let b=[data.length,addr>>8,addr&255,type,...data];b.push((-b.reduce((s,v)=>s+v,0))&255);return ':'+b.map(x=>x.toString(16).padStart(2,'0')).join('');};
test('Intel HEX checks addresses, gaps and EOF',()=>{let a=parseHex([rec(4,0,[8,0]),rec(0,0,[1,2]),rec(0,4,[3]),rec(1,0,[])].join('\n'));assert.deepEqual([...denseImage(a,0x08000000,0x08001000)],[1,2,255,255,3]);assert.throws(()=>denseImage(a,0,100));assert.throws(()=>parseHex(':02000000010200\n:00000001ff'));assert.throws(()=>parseHex(rec(0,0,[1])));assert.throws(()=>parseHex([rec(0,0,[1]),rec(0,0,[2]),rec(1,0,[])].join('\n')));});
class IO{constructor(rx){this.rx=rx;this.tx=[];}async send(x){this.tx.push([...x]);}async read(n){assert.ok(this.rx.length>=n);return Uint8Array.from(this.rx.splice(0,n));}}
test('STM32 GET and PID framing',async()=>{let io=new IO([0x79,0x79,4,0x31,0,2,0x11,0x31,0x79,0x79,1,4,0x10,0x79]);let r=new Stm32Rom(io);assert.equal(await r.init(),0x410);assert.deepEqual(io.tx,[[0x7f],[0,255],[2,253]]);assert.deepEqual(r.commands,[0,2,0x11,0x31]);});
test('STM32 read/write checksums and NACK',async()=>{let io=new IO([0x79,0x79,0x79,1,2,3,4,0x79,0x79,0x79]);let r=new Stm32Rom(io);r.commands=[0x11,0x31];assert.deepEqual([...await r.read(0x08000000,4)],[1,2,3,4]);await r.write(0x08000000,Uint8Array.of(1,2,3,4));assert.deepEqual(io.tx,[[17,238],[8,0,0,0,8],[3,252],[49,206],[8,0,0,0,8],[3,1,2,3,4,7]]);await assert.rejects(new Stm32Rom(new IO([31])).init(),/NACK/);});
test('STM32 erase requires explicit protocol, readback mismatch stops',async()=>{let r=new Stm32Rom(new IO([]));r.commands=[0x11,0x31,0x44];let erased=0,writes=0;r.eraseAll=async()=>erased++;r.read=async(a,n)=>new Uint8Array(n);r.write=async()=>writes++;await assert.rejects(r.program(Uint8Array.of(1,2,3,4)),/проверка/);assert.equal(erased,1);assert.equal(writes,1);});
test('AVR signature and address units',async()=>{let io=new IO([20,16,20,0x1e,0x95,0x0f,16,20,16]);let a=new Stk500(io);assert.equal(await a.init(),'1e950f');await a.address(128);assert.deepEqual(io.tx,[[48,32],[117,32],[85,64,0,32]]);assert.equal(avrProfile('Arduino Nano (старый загрузчик)').baud,57600);assert.equal(avrProfile('Arduino Nano Every'),null);});
test('STM vector range and thumb bit',()=>{let b=new Uint8Array(32),v=new DataView(b.buffer);v.setUint32(0,0x20001000,true);v.setUint32(4,0x08000011,true);validateStmVector(b,{ram:4096});v.setUint32(4,0x08004001,true);assert.throws(()=>validateStmVector(b,{ram:4096}));});

test('BLE recovery accepts only app-only image and checks acknowledged length',async()=>{const {validateRecoveryApp,updateRecovery}=await import('../public/programmers.js');const b=new Uint8Array(64),v=new DataView(b.buffer);b[0]=0xe9;b[1]=1;v.setUint16(12,5,true);v.setUint32(28,16,true);v.setUint32(32,0xabcd5432,true); // segment ends at 48, checksum padding to 64
validateRecoveryApp(b,'esp32c3',1000);assert.throws(()=>validateRecoveryApp(b,'esp32',1000));assert.throws(()=>validateRecoveryApp(new Uint8Array(64),'esp32c3',1000));let packets=[];let s={chip:'esp32c3',maxBytes:1000,send:async b=>packets.push([...b]),info:async()=>({received:64,busy:1})};await updateRecovery(s,b);assert.deepEqual(packets[0],[2,64,0,0,0]);assert.deepEqual(packets.at(-1),[5]);assert.equal(packets.filter(p=>p[0]===4).length,5);s.info=async()=>({received:63,busy:1});await assert.rejects(updateRecovery(s,b));assert.deepEqual(packets.at(-1),[6]);});

test('STK500 re-enters expired bootloader and discards stale sketch output before each operation',async()=>{
 const signals=[],tx=[],waits=[];let active=false,signature=[0x1e,0x95,0x0f],page=null,io={
  buffer:[0x42,0x43],closed:false,error:null,
  port:{async setSignals(s){signals.push([s.dataTerminalReady,s.requestToSend]);if(s.dataTerminalReady)active=true;}},
  async send(a){assert.ok(active,'bootloader expired');assert.equal(a.at(-1),0x20);tx.push(a[0]);
   let reply=[];if(a[0]===0x75)reply=signature;
   if(a[0]===0x64)page=a.slice(4,-1);
   if(a[0]===0x74)reply=page;
   this.buffer.push(0x14,...reply,0x10);
  },
  async read(n){assert.ok(this.buffer.length>=n);return Uint8Array.from(this.buffer.splice(0,n));}
 };
 const avr=new Stk500(io),wait=async ms=>{waits.push(ms);if(ms===150)io.buffer.push(0x99);};
 assert.equal(await avr.reenter('1e950f',wait),'1e950f');
 active=false;io.buffer.push(0x41);
 assert.equal(await avr.reenter('1e950f',wait),'1e950f');
 await avr.program(Uint8Array.of(1,2,3));
 assert.deepEqual(tx,[0x30,0x75,0x30,0x75,0x50,0x55,0x64,0x55,0x74,0x51]);
 assert.deepEqual(signals,[[false,false],[true,true],[false,false],[false,false],[true,true],[false,false]]);
 assert.deepEqual(waits,[250,10,150,250,10,150]);
 assert.deepEqual(page.slice(0,4),[1,2,3,255]);
});
test('STK500 re-entry refuses wrong signature, disconnected port and signal failures before write',async()=>{
 let commands=[],io={buffer:[],closed:false,error:null,port:{async setSignals(){}},
  async send(a){commands.push(a[0]);this.buffer.push(0x14,...(a[0]===0x75?[0x1e,0x95,0x14]:[]),0x10);},
  async read(n){return Uint8Array.from(this.buffer.splice(0,n));}};
 const avr=new Stk500(io),wait=async()=>{};
 await assert.rejects(async()=>{await avr.reenter('1e950f',wait);await avr.program(Uint8Array.of(1));},/Сигнатура/);
 assert.deepEqual(commands,[0x30,0x75]);
 io.error=Error('USB lost');await assert.rejects(avr.reenter('1e950f',wait),/USB lost/);
 io.error=null;io.closed=true;await assert.rejects(avr.reenter('1e950f',wait),/USB отключён/);
 io.closed=false;io.port.setSignals=async()=>{throw Error('signal failure');};await assert.rejects(avr.reenter('1e950f',wait),/signal failure/);
 assert.deepEqual(commands,[0x30,0x75]);
});

test('STK500 bounded reset retries log failed synchronization and never write Flash',async()=>{
 const signals=[],commands=[],waits=[],trace=[];let attempt=0;
 const io={buffer:[],closed:false,error:null,port:{getInfo(){return {usbVendorId:0x1a86,usbProductId:0x7523};},async setSignals(s){signals.push(s.dataTerminalReady);if(s.dataTerminalReady)attempt++;}},
 async send(a){commands.push(a[0]);if(attempt===1)return;this.buffer.push(0x14,...(a[0]===0x75?[0x1e,0x95,0x0f]:[]),0x10);},
 async read(n,ms){assert.equal(ms,700);if(this.buffer.length<n)throw Error('Нет ответа микроконтроллера');return Uint8Array.from(this.buffer.splice(0,n));}};
 const avr=new Stk500(io);
 assert.equal(await avr.reenter('1e950f',async ms=>waits.push(ms),s=>trace.push(s)),'1e950f');
 assert.deepEqual(commands,[0x30,0x30,0x75]);
 assert.deepEqual(signals,[false,true,false,false,true,false]);
 assert.deepEqual(waits,[250,10,150,250,10,300]);
 assert.ok(trace.includes('USB VID:PID 1a86:7523'));
 assert.ok(trace.includes('STK500 1/3: sync/signature failed'));
 assert.ok(trace.includes('STK500 2/3: RX 141e950f10'));
 commands.length=0;attempt=0;io.send=async a=>commands.push(a[0]);
 await assert.rejects(avr.reenter('1e950f',async()=>{},()=>{}),/Нет ответа/);
 assert.equal(attempt,3);assert.deepEqual(commands,[0x30,0x30,0x30]);
});
