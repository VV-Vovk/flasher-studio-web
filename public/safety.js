// Fail-closed, side-effect-free firmware metadata validation. No USB operations here.
export const BOARD_PROFILES = Object.freeze({
  'esp32c3-supermini': {label: 'ESP32-C3 SuperMini', chip: 'esp32c3'},
  'esp32c3-devkit': {label: 'ESP32-C3 DevKit', chip: 'esp32c3'},
  'esp32-devkit': {label: 'ESP32 DevKit', chip: 'esp32'},
  'esp32s3-devkit': {label: 'ESP32-S3 DevKit', chip: 'esp32s3'},
  'esp32c6-devkit': {label: 'ESP32-C6 DevKit', chip: 'esp32c6'},
});
export const CHIPS = Object.freeze({esp32: 'ESP32', esp32c3:'ESP32-C3', esp32s3:'ESP32-S3', esp32c6:'ESP32-C6', esp32s2:'ESP32-S2', esp32h2:'ESP32-H2', esp8266:'ESP8266'});
// Image-header chip IDs from Espressif's esptool format.
const HEADER_IDS = Object.freeze({esp32:0, esp32c3:5, esp32s3:9, esp32c6:13, esp32s2:2, esp32h2:16});
const HEX64 = /^[0-9a-f]{64}$/i;
const SAFE_NAME = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const MAX_IMAGE = 32 * 1024 * 1024;
const MAX_FLASH_MB = 32;

export function chipFromDescription(value) {
  const s = String(value || '').toUpperCase().replace(/_/g,'-');
  if (/ESP32-C3(?![0-9])/.test(s)) return 'esp32c3';
  if (/ESP32-S3(?![0-9])/.test(s)) return 'esp32s3';
  if (/ESP32-C6(?![0-9])/.test(s)) return 'esp32c6';
  if (/ESP32-S2(?![0-9])/.test(s)) return 'esp32s2';
  if (/ESP32-H2(?![0-9])/.test(s)) return 'esp32h2';
  if (/\bESP8266(?:EX)?\b/.test(s)) return 'esp8266';
  // Do not mistake unhandled variants, e.g. ESP32-C5 or C2, for ESP32.
  if (/\bESP32\b/.test(s) && !/ESP32[- ]/.test(s)) return 'esp32';
  return null;
}
export function flashBytesFromDescription(value) {
  const s = String(value ?? '').trim();
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(MB|KB)$/i);
  if (!m) return null;
  const n = Number(m[1]) * (m[2].toUpperCase() === 'MB' ? 1048576 : 1024);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
function isSafeText(value,max=160) { return typeof value==='string' && value.length>0 && value.length<=max; }

export function validateRelease(release) {
  const errors = [];
  if (!release || typeof release !== 'object' || Array.isArray(release)) return ['Некорректные метаданные релиза'];
  if (release.schemaVersion !== 1) errors.push('Неизвестная версия формата');
  if (!SAFE_NAME.test(release.id||'')) errors.push('Некорректный идентификатор');
  if (!isSafeText(release.name)) errors.push('Отсутствует название');
  if (!isSafeText(release.version,40)) errors.push('Отсутствует версия');
  if (!isSafeText(release.createdAt,40) || !/^\d{4}-\d\d-\d\dT/.test(release.createdAt) || !Number.isFinite(Date.parse(release.createdAt))) errors.push('Некорректная дата');
  if (!Object.hasOwn(CHIPS,release.chip)) errors.push('Неизвестный чип');
  if (!Object.hasOwn(BOARD_PROFILES,release.boardId)) errors.push('Неизвестный профиль платы');
  if (BOARD_PROFILES[release.boardId]?.chip !== release.chip) errors.push('Чип не соответствует профилю платы');
  if (!Number.isInteger(release.minFlashMB) || release.minFlashMB<1 || release.minFlashMB>MAX_FLASH_MB) errors.push('Некорректное требование к Flash');
  if (!['merged','segments'].includes(release.layout)) errors.push('Неизвестная разметка прошивки');
  if (!['dio','dout','qio','qout'].includes(release.flashMode)) errors.push('Неизвестный flashMode');
  if (!['20m','26m','40m','80m'].includes(release.flashFreq)) errors.push('Неизвестный flashFreq');
  if (!Array.isArray(release.images) || release.images.length<1 || release.images.length>12) {errors.push('Нет корректного списка файлов'); return errors;}
  const intervals=[], names=new Set();
  for (const i of release.images) {
    if (!i || typeof i !== 'object') {errors.push('Некорректное описание файла');continue;}
    if (!SAFE_NAME.test(i.file||'') || !i.file.endsWith('.bin')) errors.push('Некорректное имя BIN');
    if (names.has(i.file)) errors.push('Повторяющееся имя BIN'); names.add(i.file);
    if (!Number.isSafeInteger(i.offset) || i.offset < 0 || i.offset % 0x1000 !== 0) errors.push('Адрес должен быть кратен 4096');
    if (!Number.isSafeInteger(i.size) || i.size < 24 || i.size > MAX_IMAGE) errors.push('Некорректный размер BIN');
    if (!HEX64.test(i.sha256||'')) errors.push('Некорректный SHA-256');
    if (Number.isSafeInteger(i.offset) && Number.isSafeInteger(i.size)) {
      const end = i.offset + Math.ceil(i.size/0x1000)*0x1000;
      intervals.push([i.offset, end]);
      if (end > MAX_FLASH_MB * 1048576) errors.push('Образ выходит за поддерживаемый диапазон');
    }
  }
  intervals.sort((a,b)=>a[0]-b[0]);
  for (let j=1;j<intervals.length;j++) if (intervals[j][0] < intervals[j-1][1]) errors.push('Пересекаются сектора прошивки');
  if (release.layout==='merged' && (release.images.length!==1 || release.images[0].offset !== 0)) errors.push('Merged образ должен быть одним файлом по адресу 0x0');
  if (release.layout==='segments' && release.images.length===1 && release.images[0].offset===0) errors.push('Для образа 0x0 используй тип merged');
  return errors;
}
export function compatible(release, detectedChip, chosenBoard, flashBytes) {
  const reasons = validateRelease(release);
  if (!detectedChip) reasons.push('Модель чипа не определена');
  if (!chosenBoard) reasons.push('Профиль платы не выбран');
  if (detectedChip && release.chip!==detectedChip) reasons.push(`Не тот чип: требуется ${CHIPS[release.chip]||release.chip}`);
  if (chosenBoard && release.boardId!==chosenBoard) reasons.push('Не тот профиль платы');
  if (BOARD_PROFILES[chosenBoard]?.chip !== detectedChip && chosenBoard && detectedChip) reasons.push('Выбранная плата не соответствует чипу');
  if (!Number.isSafeInteger(flashBytes) || flashBytes<1) reasons.push('Объём Flash не определён');
  if (Number.isSafeInteger(flashBytes) && flashBytes>0) {
    if (release.minFlashMB * 1048576>flashBytes) reasons.push('Недостаточный объём Flash');
    for (const i of release.images) {
      if (Number.isInteger(i.offset) && Number.isInteger(i.size) && i.offset+Math.ceil(i.size/4096)*4096>flashBytes) reasons.push('Файл не помещается во Flash');
    }
  }
  return [...new Set(reasons)];
}
export async function sha256Hex(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (!globalThis.crypto?.subtle) throw new Error('SHA-256 недоступен. Открой сайт через HTTPS.');
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function checkImageHeader(bytes, expectedChip) {
  if (!(bytes instanceof Uint8Array) || bytes.length<24) throw Error('Образ слишком короткий');
  // Partition tables and other data blobs are not ESP image files, do not infer chip from them.
  if (bytes[0]!==0xe9) return {kind:'data', info:'В файле нет заголовка ESP image; доверяем только манифесту и хешу'};
  if (bytes[1]<1 || bytes[1]>16) throw Error('Повреждён заголовок ESP image');
  const imageChipId = bytes[12] | (bytes[13] << 8);
  const expected = HEADER_IDS[expectedChip];
  if (imageChipId !== expected) throw Error(`Заголовок BIN: chip ID ${imageChipId}, но ожидался ${expected} (${CHIPS[expectedChip]}). Запись заблокирована.`);
  return {kind:'esp-image', info:`ESP image · Chip ID ${imageChipId}`};
}

// ESP8266 Arduino core 3.1.2 image: eboot at zero, app at 0x1000.
// Different from ESP32 extended headers; legacy ESP8266 does not encode chip ID.
// Format references: Espressif ESP8266 firmware image format; Arduino ESP8266 3.1.2
// platform.txt / tools/elf2bin.py. This independent validator does not include upstream code.
export function validateEsp8266Arduino(b,flashBytes){
 if(!(b instanceof Uint8Array)||!Number.isSafeInteger(flashBytes)||flashBytes<262144||b.length<=0x1020||b.length>flashBytes||b.length>16*1048576)throw Error('ESP8266: недопустимый размер BIN');
 const v=new DataView(b.buffer,b.byteOffset,b.byteLength),sizes=[512,256,1024,2048,4096,2048,4096,0,8192,16384];
 function image(offset,limit,check){
   if(b[offset]!==0xe9||b[offset+1]===0||b[offset+1]>16||b[offset+2]>3||![0,1,2,15].includes(b[offset+3]&15))throw Error('ESP8266: неверный заголовок eboot/app');
   if(sizes[b[offset+3]>>>4]*1024!==flashBytes)throw Error('ESP8266: размер Flash в образе не совпадает с чипом');
   const entry=v.getUint32(offset+4,true);
   if(entry<0x40100000||entry>=0x40110000)throw Error('ESP8266: неверная точка входа');
   let p=offset+8,checksum=0xef;
   for(let i=0;i<b[offset+1];i++){
     if(p+8>limit)throw Error('ESP8266: неполный сегмент');
     let addr=v.getUint32(p,true),n=v.getUint32(p+4,true);p+=8;
     if(p+n>limit||addr<0x3ffe0000||addr>=0x40400000||addr+n>0x40400000)throw Error('ESP8266: недопустимый сегмент');
     if(check)for(let k=p;k<p+n;k++)checksum^=b[k];
     p+=n;
   }
   const end=offset+Math.ceil((p-offset+1)/16)*16;
   if(end>limit||(check&&b[end-1]!==checksum))throw Error('ESP8266: контрольная сумма eboot');
   return end;
 }
 const bootEnd=image(0,0x1000,true);
 // Arduino fills the remainder of the first sector with 0xAA.
 if(!b.subarray(bootEnd,0x1000).every(x=>x===0xaa))throw Error('ESP8266: неверный раздел eboot');
 const appEnd=image(0x1000,b.length,false);
 if(appEnd!==b.length||v.getUint32(0x1010,true)!==b.length)throw Error('ESP8266: требуется полный несжатый Arduino BIN');
 // CRC-32/MPEG-2 over the complete image with its two embedded CRC fields zeroed.
 // The app segment XOR predates inserting the CRC fields, so use the full CRC.
 let crc=0xffffffff;
 for(let i=0;i<b.length;i++){
   crc=(crc^((i>=0x1010&&i<0x1018?0:b[i])<<24))>>>0;
   for(let j=0;j<8;j++)crc=((crc<<1)^((crc&0x80000000)?0x04c11db7:0))>>>0;
 }
 if(crc!==v.getUint32(0x1014,true))throw Error('ESP8266: CRC32 образа не совпадает');
 return {kind:'esp8266-arduino',offset:0,size:b.length,flashBytes};
}
