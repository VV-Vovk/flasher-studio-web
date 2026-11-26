// Independent ARM ELF32 audit for WB55 with 192 KiB SRAM1 (RM0434, AN5289).
const F=0x08000000,R=0x20000000,A=0x20030000,B=0x20038000,E=0x20040000;
export const wbAuditLayout='wb55-sram192-rm0434';
export function auditWbElf(data,limitKiB,hexRanges){
 if(!(data instanceof Uint8Array)||data.length<52||data.length>32*1024*1024||![127,69,76,70,1,1,1].every((v,i)=>data[i]===v)||!Number.isInteger(limitKiB)||limitKiB<4||limitKiB>1024)throw Error('WB ELF header');
 const v=new DataView(data.buffer,data.byteOffset,data.byteLength),u16=n=>v.getUint16(n,true),u32=n=>v.getUint32(n,true);
 const entry=u32(24),ph=u32(28),sh=u32(32),pn=u16(44),sn=u16(48),str=u16(50),end=F+limitKiB*1024;
 if(u16(16)!==2||u16(18)!==40||u32(20)!==1||u16(40)!==52||u16(42)!==32||u16(46)!==40||pn<1||pn>128||sn<1||sn>512||str<1||str>=sn||ph<52||sh<52||ph+pn*32>data.length||sh+sn*40>data.length)throw Error('WB ELF tables');
 function region(lo,hi){for(const [area,a,b] of [['flash',F,end],['sram1',R,A],['sram2a',A,B],['sram2b',B,E]])if(a<=lo&&lo<hi&&hi<=b)return area;throw Error('WB ELF allocation outside CPU1 memory');}
 const loads=[];for(let i=0;i<pn;i++){const o=ph+i*32;if(u32(o)!==1)continue;const [offset,va,pa,fs,ms,flags]=[4,8,12,16,20,24].map(n=>u32(o+n));if(fs>ms||offset+fs>data.length)throw Error('WB ELF load segment');if(!ms)continue;const area=region(va,va+ms);if(fs&&!(F<=pa&&pa+fs<=end))throw Error('WB ELF load outside Flash');if(area.startsWith('sram2')&&(fs||(flags&1)))throw Error('WB shared SRAM requires NOLOAD');loads.push({offset,va,pa,fs,ms});}
 const st=sh+str*40,so=u32(st+16),sz=u32(st+20);if(u32(st+4)!==3||so+sz>data.length)throw Error('WB ELF string table');
 const names=data.subarray(so,so+sz),sections=[],loadRanges=[];
 for(let i=0;i<sn;i++){const o=sh+i*40,no=u32(o),kind=u32(o+4),flags=u32(o+8),start=u32(o+12),offset=u32(o+16),size=u32(o+20);if(!(flags&2)||!size)continue;const endExclusive=start+size,area=region(start,endExclusive),nul=names.indexOf(0,no);if(no>=names.length||nul<=no||nul-no>128||names.subarray(no,nul).some(x=>x>127))throw Error('WB ELF section name');const name=new TextDecoder().decode(names.subarray(no,nul));let loadStart=null;
 if(kind===8){if(area==='flash'||!loads.some(l=>l.va<=start&&endExclusive<=l.va+l.ms))throw Error('WB unmapped NOLOAD');}
 else{if(area.startsWith('sram2')||offset+size>data.length)throw Error('WB initialized shared SRAM unsupported');const m=loads.filter(l=>l.va<=start&&endExclusive<=l.va+l.fs&&offset===l.offset+start-l.va);if(m.length!==1)throw Error('WB ELF section load mapping');loadStart=m[0].pa+start-m[0].va;if(loadStart<F||loadStart+size>end)throw Error('WB ELF section load outside Flash');loadRanges.push({address:loadStart,data:data.subarray(offset,offset+size)});}
 if(area.startsWith('sram2')&&(flags&4))throw Error('WB executable shared SRAM');sections.push({name,start,endExclusive,area,loadStart});}
 sections.sort((a,b)=>a.start-b.start);
 if(!sections.length||sections.some((x,i)=>i&&sections[i-1].endExclusive>x.start)||!sections.some(x=>x.area==='flash'&&x.start<=(entry&~1)&&(entry&~1)<x.endExclusive))throw Error('WB ELF overlaps or entry');
 loadRanges.sort((a,b)=>a.address-b.address);if(!Array.isArray(hexRanges)||!hexRanges.length)throw Error('WB HEX required');
 let j=0,k=0;for(const x of loadRanges)for(let i=0;i<x.data.length;i++){const h=hexRanges[j];if(!h||h.address+k!==x.address+i||h.data[k]!==x.data[i])throw Error('WB ELF / HEX bytes differ');if(++k===h.data.length){j++;k=0;}}
 if(j!==hexRanges.length||k!==0)throw Error('WB ELF / HEX length differs');
 return {schema:1,layout:wbAuditLayout,sections};
}
export function wbSharedBounds(rv,ipcc){
 if(![rv,ipcc].every(x=>Number.isInteger(x)&&x>=0&&x<=0xffffffff))throw Error('WB live option registers required');
 return Object.freeze({aEnd:rv&0x800000?B:A+((rv>>>18)&31)*1024,bEnd:rv&0x40000000?E:B+((rv>>>25)&31)*1024,ipccDefault:(ipcc&0x3fff)===0});
}
export function wbCheckMemoryFit(project,limit,rv,ipcc){
 if(!project||project.audit?.schema!==1||project.audit.layout!==wbAuditLayout||!Number.isInteger(project.flashKiB)||project.flashKiB<4||project.flashKiB*1024>limit||!Array.isArray(project.audit.sections)||!project.audit.sections.length)throw Error('WB audited ELF and live Flash budget required');
 const b=wbSharedBounds(rv,ipcc),s=project.audit.sections;
 for(const x of s){const bounds={flash:[F,F+project.flashKiB*1024],sram1:[R,A],sram2a:[A,b.aEnd],sram2b:[B,b.bEnd]}[x.area];if(!bounds||!Number.isInteger(x.start)||!Number.isInteger(x.endExclusive)||x.start<bounds[0]||x.endExclusive>bounds[1]||x.start>=x.endExclusive||x.area.startsWith('sram2')&&x.loadStart!==null)throw Error('WB ELF section crosses live SRAM/Flash boundary: '+x.name);}
 if(s.some(x=>x.area.startsWith('sram2'))){const mapping=s.filter(x=>/^\.?MAPPING_TABLE$/.test(x.name));if(!b.ipccDefault||mapping.length!==1||mapping[0].area!=='sram2a'||mapping[0].start!==A)throw Error('WB shared RAM requires default IPCCDBA and MAPPING_TABLE at SRAM2a base');}
 return b;
}
