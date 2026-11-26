import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePlotLine,SerialLines,PlotHistory,encodeSend,MonitorSession} from '../public/serial-monitor.js';
test('Arduino plotter numeric and named values, strict finite input',()=>{
 assert.deepEqual({...parsePlotLine('12 -3.4 1e-2')},{'Value 1':12,'Value 2':-3.4,'Value 3':.01});
 assert.deepEqual({...parsePlotLine('temp:25.4,voltage:3.3')},{temp:25.4,voltage:3.3});
 for(const s of ['hello','NaN','temp:1 2','x:1 x:2','x:Infinity','1 2 3 4 5 6 7 8 9','__proto__:1 x:foo'])assert.equal(parsePlotLine(s),null);
});
test('Line decoder handles split UTF8 and CRLF, multiple lines and oversize discard',()=>{
 const text=[],lines=[],d=new SerialLines(s=>text.push(s),s=>lines.push(s)),enc=new TextEncoder();
 const b=enc.encode('Привет\r\n1,2\n3');d.feed(b.slice(0,1));d.feed(b.slice(1));d.feed(enc.encode('\r'));d.feed(enc.encode('\n4\n'+'x'.repeat(1025)+'\n5\n'));d.finish();
 assert.deepEqual(lines,['Привет','1,2','3','4','5']);assert.ok(text.join('').startsWith('Привет'));
});
test('History bounded, 8 channels maximum, CSV uses numeric columns and sample sequence',()=>{
 const h=new PlotHistory(2);h.add(parsePlotLine('temp:1'),.1);h.add(parsePlotLine('temp:2'),.2);h.add(parsePlotLine('temp:3 voltage:4'),.3);assert.equal(h.rows.length,2);assert.equal(h.csv(),'sample,time_s,temp,voltage\r\n2,0.200,2,\r\n3,0.300,3,4\r\n');assert.equal(h.add(parsePlotLine('a:1 b:2 c:3 d:4 e:5 f:6 g:7'),.4),false);
});
test('Send endings and limit',()=>{
 for(const [key,value] of [['none','x'],['lf','x\n'],['cr','x\r'],['crlf','x\r\n']])assert.equal(new TextDecoder().decode(encodeSend('x',key)),value);assert.throws(()=>encodeSend('x','bad'));assert.throws(()=>encodeSend('x'.repeat(4097),'lf'));
});
test('Session opens, receives partial chunks, sends, closes streams and port',async()=>{
 let c,options,closed=0,writes=[],lines=[];const port={readable:new ReadableStream({start(x){c=x;}}),writable:new WritableStream({write(b){writes.push([...b]);}}),open:async o=>options=o,close:async()=>closed++};
 const s=new MonitorSession({onLine:x=>lines.push(x)});await s.open(port,{baudRate:115200});c.enqueue(Uint8Array.of(49));c.enqueue(Uint8Array.of(10));await s.send('ok','crlf');await new Promise(r=>setTimeout(r,0));assert.deepEqual(lines,['1']);assert.deepEqual(writes,[[111,107,13,10]]);await s.close();assert.equal(options.baudRate,115200);assert.equal(closed,1);assert.equal(port.readable.locked,false);assert.equal(port.writable.locked,false);
});
