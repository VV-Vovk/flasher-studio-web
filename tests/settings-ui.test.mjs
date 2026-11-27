import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('GitHub settings use one reset action with no orphan button references',()=>{
 assert.ok(!html.includes('liveForget'));
 const handlers=[...html.matchAll(/\$\('resetRepo'\)\.onclick=\(\)=>\{([^}]+)\}/g)];
 const handler=handlers.at(-1)?.[1]||'';
 assert.ok(handler.includes("$('token').value=''"));
 assert.ok(handler.includes("$('repo').value=defaultRepo"));
 assert.ok(handler.includes("safeWrite(liveRepoKey,defaultRepo)"));
 assert.ok(handler.includes("$('liveRepoStatus').textContent='Доступ ещё не проверен.'"));
 assert.ok(html.includes('help.append(notice)'));
});
