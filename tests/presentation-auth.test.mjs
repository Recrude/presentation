import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { handleAuth, sessionValid } from '../server/presentation-auth.mjs';
const password = 'test-only-password';
const salt = randomBytes(16);
const settings = {salt:salt.toString('hex'),hash:pbkdf2Sync(password,salt,120000,32,'sha256').toString('hex'),sessionKey:randomBytes(32).toString('hex')};
function request(path, options={}) { return new Request('https://example.test'+path,options); }
function login(value, next='/presentations/edit/260909-ahn/') {
  return request('/presentations/login/',{method:'POST',headers:{Origin:'https://example.test','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({password:value,next})});
}
test('server password gate protects editing while public presentations stay available', async () => {
  const original = process.env.PRESENTATION_AUTH;
  try {
    delete process.env.PRESENTATION_AUTH;
    assert.equal(await handleAuth(request('/presentations/260909-ahn/')),null);
    assert.equal((await handleAuth(request('/presentations/edit/'))).status,503);
    process.env.PRESENTATION_AUTH=JSON.stringify(settings);
    for(const path of ['/presentations/edit','/presentations/edit/','/presentations/edit/261103-yun/','/presentations/edit/2026-09-09-ahn-byunghak-graduation-project/','/presentations//edit/','/presentations/%65dit/','/presentations/migrate/']) {
      const r=await handleAuth(request(path));assert.equal(r.status,303);assert.match(r.headers.get('location'),/^\/presentations\/login\//);
    }
    const form=await handleAuth(request('/presentations/login/'));
    assert.match(form.headers.get('cache-control'),/no-store/);
    const html=await form.text();assert.ok(!html.includes(settings.hash));assert.ok(!html.includes(password));assert.ok(!html.includes(settings.sessionKey));
    assert.equal((await handleAuth(login('wrong'))).status,401);
    const accepted=await handleAuth(login(password));assert.equal(accepted.status,303);assert.equal(accepted.headers.get('location'),'/presentations/edit/260909-ahn/');
    const cookie=accepted.headers.get('set-cookie');assert.match(cookie,/HttpOnly; Secure; SameSite=Strict; Max-Age=28800/);
    const cookieHeader=cookie.split(';')[0];const authed=request('/presentations/edit/',{headers:{cookie:cookieHeader}});
    assert.equal(sessionValid(authed,settings),true);assert.equal(await handleAuth(authed),null);
    assert.equal(sessionValid(authed,settings,Date.now()+9*3600000),false);
    assert.equal(sessionValid(request('/presentations/edit/',{headers:{cookie:cookieHeader.slice(0,-1)+(cookieHeader.endsWith('0')?'1':'0')}}),settings),false);
    assert.deepEqual(await (await handleAuth(request('/presentations/auth/session/',{headers:{cookie:cookieHeader}}))).json(),{authenticated:true});
    assert.equal((await handleAuth(request('/presentations/api/capture/?url=https://ved.kr/'))).status,401);
    assert.equal(await handleAuth(request('/presentations/api/capture/?url=https://ved.kr/',{headers:{cookie:cookieHeader}})),null);
    const csrf=login(password);csrf.headers.set('origin','https://attacker.test');assert.equal((await handleAuth(csrf)).status,403);
    assert.equal((await handleAuth(login(password,'https://attacker.test/'))).headers.get('location'),'/presentations/edit/');
    const logout=await handleAuth(request('/presentations/logout/',{method:'POST',headers:{origin:'https://example.test',cookie:cookieHeader}}));assert.equal(logout.status,303);assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
    for(let i=0;i<8;i++)assert.equal((await handleAuth(login('wrong'))).status,401);
    assert.equal((await handleAuth(login('wrong'))).status,429);
  } finally { if(original===undefined)delete process.env.PRESENTATION_AUTH;else process.env.PRESENTATION_AUTH=original; }
});
