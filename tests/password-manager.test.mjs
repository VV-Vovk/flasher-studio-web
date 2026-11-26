import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const manifest=JSON.parse(readFileSync(new URL('../public/manifest.webmanifest',import.meta.url),'utf8'));
test('installed PWA uses full name and preserves identity',()=>{
 assert.equal(manifest.name,'Flasher Studio');assert.equal(manifest.short_name,manifest.name);
 assert.equal(manifest.id,'/');assert.equal(manifest.start_url,'/');assert.equal(manifest.scope,'/');
});
test('GitHub credential form supports browser password manager and blocks native submission',()=>{
 const form=html.match(/<form id="githubCredentialForm"[\s\S]*?<\/form>/)?.[0];
 assert.ok(form);assert.match(form,/method="post"/);assert.match(form,/<input[^>]*id="repo"[^>]*name="username"[^>]*autocomplete="username"/);
 assert.match(form,/<input[^>]*id="token"[^>]*name="password"[^>]*type="password"[^>]*autocomplete="current-password"/);
 assert.match(form,/<button[^>]*id="checkRepo"[^>]*type="submit"/);
 assert.match(form,/<button[^>]*id="resetRepo"[^>]*type="button"/);
 assert.match(html,/content="form-action 'none'"/);
 assert.match(html,/githubCredentialForm'\)\.addEventListener\('submit',e=>\{e\.preventDefault\(\);/);
 assert.doesNotMatch(html,/\$\('token'\)\.autocomplete='new-password'/);
 for(const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new Function(script[1]);
});
test('only successfully verified credentials are offered to browser, failures are nonfatal',async()=>{
 const source=html.match(/async function offerGithubCredential\(repo,token\)\{[\s\S]*?\n\}/)?.[0];
 assert.ok(source);
 const calls=[];
 class Credential{constructor(data){this.data=data;}}
 const fn=(nav,ctor)=>new Function('navigator','PasswordCredential',source+';return offerGithubCredential;')(nav,ctor);
 assert.equal(await fn({credentials:{store:async c=>calls.push(c.data)}},Credential)('owner/repo','github_pat_test'),true);
 assert.deepEqual(calls,[{id:'owner/repo',password:'github_pat_test'}]);
 assert.equal(await fn({},undefined)('owner/repo','github_pat_test'),false);
 assert.equal(await fn({credentials:{store:async()=>{throw Error('denied');}}},Credential)('owner/repo','github_pat_test'),false);
 const handler=html.match(/async function verifyGithubAccess\(\)\{[\s\S]*?\n\}/)?.[0];
 assert.ok(handler);assert.ok(handler.indexOf('await c.check()')<handler.indexOf('offerGithubCredential(r,c.token)'));
 assert.match(handler,/if\(\$\('token'\)\.value\.trim\(\)!==c\.token/);
 assert.doesNotMatch(handler,/safeWrite\([^,]*,\s*(?:c\.token|\$\('token'\))/);
});
