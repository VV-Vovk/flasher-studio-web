// Browser-only GitHub REST client; the token is kept only in memory.
// This module never calls Firebase APIs and never writes credentials to storage.
export const REPO = 'VV-Vovk/esp-firmware-builder';
export const WORKFLOW = 'build-esp32.yml';
export function normalizeRepo(value) {
  const raw=String(value??'').trim();
  const repo=raw.replace(/^https:\/\/github\.com\//i,'').replace(/\/$/,'').replace(/\.git$/i,'');
  const parts=repo.split('/');
  if(parts.length!==2 || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(parts[0]) || !/^[A-Za-z0-9_.-]{1,100}$/.test(parts[1]) || ['.','..'].includes(parts[1]))
    throw Error('Укажи репозиторий в формате владелец/репозиторий или https://github.com/владелец/репозиторий');
  return repo;
}
export function sameRepo(a,b){return normalizeRepo(a).toLowerCase()===normalizeRepo(b).toLowerCase();}
// Legacy saved builds were always sent to the original repository.
export function buildBelongsToRepo(build,repo){return Boolean(build?.requestId) && sameRepo(build.repo??REPO,repo);}
const MAX_SOURCE = 950000;
export class GithubNetworkError extends Error {}
const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));
export const PROFILES = ['esp32c3-supermini','esp32c3-devkit','esp32-devkit','esp32s3-devkit','esp32c6-devkit'];

export function bytesToBase64(bytes) {
  if (!(bytes instanceof Uint8Array)) throw Error('Ожидается Uint8Array');
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s);
}
export function base64ToBytes(encoded) {
  const binary = atob(String(encoded).replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i=0; i<binary.length; i++) bytes[i]=binary.charCodeAt(i);
  return bytes;
}
export function validateRequest({file,profile,name,version,libraries}) {
  const problems=[];
  if (!(file instanceof File)) problems.push('Не выбран файл');
  else {
    if (!/\.(ino|zip)$/i.test(file.name)) problems.push('Нужен .ino или .zip');
    if (file.size < 1 || file.size > MAX_SOURCE) problems.push('Размер исходников должен быть от 1 байта до 950 КБ');
  }
  if (!PROFILES.includes(profile)) problems.push('Выбери тип платы');
  if (!name?.trim() || name.length > 120) problems.push('Название должно быть от 1 до 120 символов');
  if (!version?.trim() || version.length > 40) problems.push('Некорректная версия');
  if (String(libraries||'').length > 1500) problems.push('Слишком длинный список библиотек');
  return problems;
}
export function validateBuildResult(doc, requestedId, validateRelease) {
  if (!doc || doc.schema!==1 || doc.requestId!==requestedId || !Array.isArray(doc.chunks)) throw Error('Неверный результат сборки');
  const problems=validateRelease(doc.release);
  if (problems.length) throw Error('Неверный манифест прошивки: '+problems.join('; '));
  if (doc.release.id!=='gh-'+requestedId || doc.release.layout!=='merged' || doc.release.images.length!==1 || doc.release.images[0].offset!==0)
    throw Error('Неверный формат merged firmware');
  if (!Number.isSafeInteger(doc.size) || doc.size < 24 || doc.size>12*1024*1024 || doc.size!==doc.release.images[0].size)
    throw Error('Недопустимый размер BIN');
  if (!/^[0-9a-f]{64}$/i.test(doc.sha256) || doc.sha256.toLowerCase()!==doc.release.images[0].sha256.toLowerCase())
    throw Error('Несовпадение общего SHA256');
  const chunks=doc.chunks;
  if (!chunks.length || chunks.length>24) throw Error('Недопустимое количество частей');
  let total=0;
  for (const [index,chunk] of chunks.entries()) {
    if (chunk.file!==`part-${String(index).padStart(3,'0')}.bin` || !Number.isSafeInteger(chunk.size) || chunk.size<=0 || chunk.size>524288 || !/^[a-f0-9]{64}$/i.test(chunk.sha256))
      throw Error('Недопустимый манифест части BIN');
    total+=chunk.size;
  }
  if (total!==doc.size) throw Error('Размер частей BIN не совпадает');
  return doc;
}
function validateId(rid) {if(!/^[a-f0-9]{32}$/.test(rid))throw Error('Неверный идентификатор запроса');}

export class GithubBuilder {
  constructor(token, repo=REPO) {
    if (!/^(github_pat_|ghp_)[A-Za-z0-9_]+$/.test(token)) throw Error('Введи GitHub fine-grained token (github_pat_...)');
    this.token=token;
    this.repo=normalizeRepo(repo);
    this.apiBase='https://api.github.com/repos/'+this.repo;
  }
  async api(path, method='GET', json) {
    const headers={
      'Accept':'application/vnd.github+json',
      'Authorization':`Bearer ${this.token}`
    };
    if (json !== undefined) headers['Content-Type']='application/json';
    let response;
    try {
      response=await fetch(this.apiBase+path, {method,headers,body:json===undefined?undefined:JSON.stringify(json),cache:'no-store',redirect:'follow'});
    }catch(e){
      const endpoint = path.split('?')[0];
      throw new GithubNetworkError(`Запрос к GitHub (${method} ${endpoint}) не получил доступного ответа: ${e.message}. Операция могла выполниться на сервере; повтор без проверки может создать дубликат.`, {cause:e});
    }
    if (response.status===204) return null;
    if (!response.ok) {
      let message = '';
      try {const data=await response.json();message=data?.message || '';}catch{}
      throw Error(`GitHub HTTP ${response.status}${message?': '+message:''}`);
    }
    return response.json();
  }
  async requirePrivate() {
    const repo=await this.api('');
    if(!repo?.full_name || !sameRepo(repo.full_name,this.repo))throw Error('GitHub вернул другой репозиторий');
    if(repo.private!==true)throw Error('Для личных исходников нужен private Builder (приватный репозиторий). Публичная загрузка запрещена.');
    return repo;
  }
  async check() {
    const repo=await this.requirePrivate();
    const workflow=await this.api(`/actions/workflows/${WORKFLOW}`);
    if(workflow?.state!=='active')throw Error('Workflow не активен. Проверь вкладку Actions в репозитории.');
    return repo.full_name;
  }
  async uploadSource({file,requestId}) {
    validateId(requestId);
    await this.requirePrivate();
    const ext = file.name.toLowerCase().endsWith('.zip')?'zip':'ino';
    const bytes=new Uint8Array(await file.arrayBuffer());
    return this.api(`/contents/requests/${requestId}/source.${ext}`,'PUT',{
      message:`ESP Flasher request ${requestId}`,
      content:bytesToBase64(bytes),
      branch:'main'
    });
  }
  // GitHub may commit a PUT even when Chrome cannot read the HTTP response.
  // Only recover after independently observing the exact uploaded source file.
  async uploadSourceSafely({file,requestId}) {
    try { await this.uploadSource({file,requestId}); return false; }
    catch (error) {
      if (!(error instanceof GithubNetworkError)) throw error;
      const ext = file.name.toLowerCase().endsWith('.zip')?'zip':'ino';
      for (let attempt=0;attempt<4;attempt++) {
        if (attempt) await delay(1200);
        try {
          const item=await this.api(`/contents/requests/${requestId}/source.${ext}?ref=main`);
          if (item?.type==='file' && item.size===file.size) return true;
        } catch { /* retry read-only verification; never blindly repeat PUT */ }
      }
      throw new GithubNetworkError('Ответ на загрузку потерян, а GitHub пока не подтвердил файл. Не запускай повторно без проверки истории репозитория.');
    }
  }
  async dispatchSafely({requestId,profile,name,version,libraries,file}) {
    try { await this.dispatch({requestId,profile,name,version,libraries,file}); return false; }
    catch (error) {
      if (!(error instanceof GithubNetworkError)) throw error;
      // Dispatch can return a network error although the Actions run was created.
      for(let attempt=0;attempt<7;attempt++) {
        await delay(attempt<3?1800:3000);
        try { if(await this.findRun(requestId)) return true; }catch { /* only read-only checks */ }
      }
      throw new GithubNetworkError('GitHub не подтвердил запуск. Он мог уже принять команду. Нажми «Проверить последнюю сборку» или посмотри Actions; не отправляй проект повторно вслепую.');
    }
  }
  async dispatch({requestId,profile,name,version,libraries,file}) {
    validateId(requestId);
    await this.requirePrivate();
    return this.api(`/actions/workflows/${WORKFLOW}/dispatches`,'POST',{
      ref:'main', inputs:{
        request_id:requestId,
        input_type:file.name.toLowerCase().endsWith('.zip')?'zip':'ino',
        board_profile:profile,
        release_name:name.trim(),
        release_version:version.trim(),
        libraries:String(libraries||'').trim()
      }
    });
  }
  async findRun(requestId) {
    validateId(requestId);
    const doc=await this.api(`/actions/workflows/${WORKFLOW}/runs?event=workflow_dispatch&branch=main&per_page=50`);
    return doc?.workflow_runs?.find(r => String(r.display_title).includes(requestId)) || null;
  }
  async readContents(path, branch) {
    const r=await this.api('/contents/'+path+'?ref='+encodeURIComponent(branch));
    if (r?.type!=='file' || r.encoding!=='base64' || typeof r.content!=='string')throw Error('GitHub не вернул содержимое файла');
    return base64ToBytes(r.content);
  }
  async resultManifest(requestId) {
    validateId(requestId);
    const data=await this.readContents(`results/${requestId}/result.json`,'build-results');
    return JSON.parse(new TextDecoder().decode(data));
  }
  // Verify *every* downloaded piece before accepting it. If one GitHub Contents
  // response is bad, retry the same piece via its immutable Git blob object.
  // This never triggers another compilation or disables the SHA-256 guard.
  async resultChunk(requestId, filename, expected) {
    validateId(requestId);
    if(!/^part-\d{3}\.bin$/.test(filename))throw Error('Неверное имя части BIN');
    if (!expected || expected.file !== filename ||
        !Number.isSafeInteger(expected.size) || expected.size < 1 || expected.size > 524288 ||
        !/^[a-f0-9]{64}$/i.test(expected.sha256)) throw Error('Некорректные метаданные части BIN');
    const resource = `/contents/results/${requestId}/chunks/${filename}?ref=build-results`;
    const observations=[];
    let sha = null;
    const examine = async (doc, channel) => {
      if (typeof doc?.sha === 'string' && /^[a-f0-9]{40}$/i.test(doc.sha)) sha=doc.sha;
      if (doc?.encoding !== 'base64' || typeof doc?.content !== 'string') {
        observations.push(`${channel}: нет данных base64`); return null;
      }
      const bytes=base64ToBytes(doc.content);
      const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))
        .map(n=>n.toString(16).padStart(2,'0')).join('');
      if(bytes.length===expected.size && digest===expected.sha256.toLowerCase())return bytes;
      observations.push(`${channel}: ${bytes.length}/${expected.size} байт, SHA256 ${digest.slice(0,16)}…`);
      return null;
    };
    for (let attempt=1;attempt<=2;attempt++) {
      try {
        const item=await this.api(resource);
        if (item?.type!=='file') throw Error('Ответ GitHub не является файлом');
        const bytes=await examine(item,`Contents ${attempt}`);
        if(bytes)return bytes;
      } catch (e) {observations.push(`Contents ${attempt}: ${e.message}`);}
      if (attempt===1) await delay(650);
    }
    if(sha) {
      for(let attempt=1;attempt<=2;attempt++) {
        try {
          const blob=await this.api(`/git/blobs/${sha}`);
          const bytes=await examine(blob,`Git blob ${attempt}`);
          if(bytes)return bytes;
        } catch(e) {observations.push(`Git blob ${attempt}: ${e.message}`);}
        if(attempt===1)await delay(650);
      }
    }
    throw Error(`Не удалось проверить ${filename}. ${observations.join('; ')}. `+
      'Не запускай новую сборку: можно повторить загрузку через «Проверить последнюю сборку» или скачать готовый firmware.bin из GitHub Actions → Artifacts.');
  }
  async listResults() {
    const content=await this.readContents('result-index.json','build-results');
    const ids=JSON.parse(new TextDecoder().decode(content));
    return Array.isArray(ids)?ids.filter(id=>/^[a-f0-9]{32}$/.test(id)).slice(-10).reverse():[];
  }
}
