// MCUdude MicroCore v2.5.2 / TinyCore v0.8.0 boards.txt and AVR datasheets.
// Clock selection is a compilation option, never a request to change fuses.
const part=(signature,limit,page,group,number)=>Object.freeze({signature,limit,page,group,number});
export const TINY_ISP=Object.freeze({
 ATtiny13:part('1e9007',1024,32,'13','13'),
 ATtiny25:part('1e9108',2048,32,'x5','25'),
 ATtiny45:part('1e9206',4096,64,'x5','45'),
 ATtiny85:part('1e930b',8192,64,'x5','85'),
 ATtiny24:part('1e910b',2048,32,'x4','24'),
 ATtiny44:part('1e9207',4096,64,'x4','44'),
 ATtiny84:part('1e930c',8192,64,'x4','84'),
 ATtiny2313:part('1e910a',2048,32,'x313','2313'),
 ATtiny4313:part('1e920d',4096,64,'x313','4313'),
 ATtiny87:part('1e9387',8192,128,'x7','87'),
 ATtiny167:part('1e9487',16384,128,'x7','167'),
 ATtiny48:part('1e9209',4096,64,'x8','48'),
 ATtiny88:part('1e9311',8192,64,'x8','88'),
 ATtiny441:part('1e9215',4096,16,'x41','441'),
 ATtiny841:part('1e9315',8192,16,'x41','841'),
 ATtiny261:part('1e910c',2048,32,'x61','261'),
 ATtiny461:part('1e9208',4096,64,'x61','461'),
 ATtiny861:part('1e930d',8192,64,'x61','861'),
 ATtiny1634:part('1e9412',16384,32,'1634','1634'),
 ATtiny828:part('1e9314',8192,64,'828','828'),
 ATtiny43U:part('1e920c',4096,64,'43','43'),
 ATtiny26:part('1e9109',2048,32,'26','26')
});
export const TINY_BOARDS=Object.freeze(Object.fromEntries(Object.keys(TINY_ISP).flatMap(chip=>{
 const clocks=chip==='ATtiny13'?[['1.2 MHz','1M2'],['9.6 MHz','9M6']]:[['1 MHz','1MHz_internal'],['8 MHz','8MHz_internal']];
 return clocks.map(([label,clock])=>[chip+' · '+label+' internal',Object.freeze({chip,clock})]);
}).concat([['Digispark ATtiny85 · ISP (no bootloader)',Object.freeze({chip:'ATtiny85',clock:'16MHz_internal_PLL'})]])));
export function tinyProfile(name,chip){const b=TINY_BOARDS[name];return b&&b.chip===chip?TINY_ISP[chip]:null;}
export function tinyFqbn(name,chip){const b=TINY_BOARDS[name],p=tinyProfile(name,chip);if(!p)return '';return p.group==='13'?'MicroCore:avr:13:clock='+b.clock+',bootloader=no_bootloader':'TinyCore:avr:'+p.group+':'+(p.group.startsWith('x')?'chip='+p.number+',':'')+'clock='+b.clock+',bootloader=no_bootloader';}
export function tinyBuildFqbn(fqbn){return Object.keys(TINY_BOARDS).some(n=>tinyFqbn(n,TINY_BOARDS[n].chip)===fqbn)||Object.values(DIGISPARK_BOARDS).some(p=>p.fqbn===fqbn);}

export const DIGISPARK_BOARDS=Object.freeze({
 'Digispark ATtiny85 · USB':Object.freeze({chip:'ATtiny85',fqbn:'digistump:avr:digispark-tiny:clock=clock165,micronucleus=recommended',max:6586,flash:8192,page:64,signature:'1e930b'}),
 'Digispark Pro ATtiny167 · USB':Object.freeze({chip:'ATtiny167',fqbn:'digistump:avr:digispark-pro:micronucleus=recommended',max:14970,flash:16384,page:128,signature:'1e9487'}),
 'MH-ET LIVE Tiny88 · USB':Object.freeze({chip:'ATtiny88',fqbn:'TinyCore:avr:x8:chip=88,clock=16MHz_external,bootloader=micronucleus',max:6588,flash:8192,page:64,signature:'1e9311'}),
 'Adafruit Trinket 3.3V · USB':Object.freeze({chip:'ATtiny85',fqbn:'adafruit:avr:trinket3',max:5248,flash:8192,page:64,signature:'1e930b',trinket:true}),
 'Adafruit Trinket 5V · USB':Object.freeze({chip:'ATtiny85',fqbn:'adafruit:avr:trinket5',max:5248,flash:8192,page:64,signature:'1e930b',trinket:true}),
 'Adafruit Gemma ATtiny85 · USB':Object.freeze({chip:'ATtiny85',fqbn:'adafruit:avr:gemma',max:5248,flash:8192,page:64,signature:'1e930b',trinket:true})
});
export function digisparkProfile(name,chip){const p=DIGISPARK_BOARDS[name];return p&&p.chip===chip?p:null;}
