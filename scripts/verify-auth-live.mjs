import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
let password = ''; for await (const chunk of process.stdin) password += chunk; password=password.trim();
if (!password) throw Error('Pass the presentation password through stdin.');
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox']});
try {
  for (const origin of ['https://jaeyeonkim.kr','https://presentation-wine-ten.vercel.app']) {
    const context = await browser.createBrowserContext(), page = await context.newPage(); await page.setViewport({width:1440,height:950});
    const base=origin+'/presentations/';
    await page.goto(base+'edit/260909-ahn/',{waitUntil:'networkidle2'});
    await page.waitForSelector('input[name=password]');assert.ok(page.url().startsWith(base+'login/'));assert.equal(await page.$('.editor'),null);
    if(origin==='https://jaeyeonkim.kr')await page.screenshot({path:'/tmp/presentation-password-login.png'});
    await page.type('input[name=password]','incorrect');
    await Promise.all([page.waitForNavigation({waitUntil:'networkidle2'}),page.click('button[type=submit]')]);
    assert.match(await page.$eval('[role=alert]',e=>e.textContent),/비밀번호/);assert.equal(await page.$('.editor'),null);
    await page.type('input[name=password]',password);
    await Promise.all([page.waitForNavigation({waitUntil:'networkidle2'}),page.click('button[type=submit]')]);
    await page.waitForSelector('.editor .card');assert.equal(page.url(),base+'edit/260909-ahn/');assert.equal(await page.$$('.card').then(x=>x.length),92);
    const sessionCookie=(await page.cookies()).find(c=>c.name==='__Secure-presentation-edit');assert.ok(sessionCookie);assert.ok(sessionCookie.httpOnly);assert.ok(sessionCookie.secure);assert.equal(sessionCookie.sameSite,'Strict');
    const states=await page.evaluate(async()=>{
      localStorage.setItem('auth-verification-preserve','saved');
      const r=await fetch('/presentations/auth/session/');
      const capture=await fetch('/presentations/api/capture/?url=http://localhost');
      return {session:await r.json(),cache:r.headers.get('cache-control'),capture:capture.status};
    });
    assert.deepEqual(states.session,{authenticated:true});assert.match(states.cache,/no-store/);assert.equal(states.capture,422,'authenticated capture survives homepage proxy');
    await page.goto(base+'edit/',{waitUntil:'networkidle2'});await page.waitForSelector('.catalog-actions');assert.equal(await page.$$('.catalog-row').then(x=>x.length),7);
    await Promise.all([page.waitForNavigation({waitUntil:'networkidle2'}),page.click('form[action="/presentations/logout/"] button')]);
    assert.equal(page.url(),base);assert.equal(await page.evaluate(()=>localStorage.getItem('auth-verification-preserve')),'saved');assert.ok(!(await page.cookies()).some(c=>c.name==='__Secure-presentation-edit'));
    await page.goto(base+'edit/',{waitUntil:'networkidle2'});await page.waitForSelector('input[name=password]');
    await page.goto(base+'260909-ahn/',{waitUntil:'domcontentloaded'});await page.waitForSelector('.present-controls');assert.match(await page.$eval('.present-controls',e=>e.textContent),/1 \/ 92/);
    assert.equal(await page.evaluate(async()=>(await fetch('/presentations/api/capture/?url=http://localhost')).status),401);
    await context.close();console.log('PASS '+origin+': gated edits, rejected wrong password, secure session, authenticated capture, logout, saved state retained, public deck accessible');
  }
} finally {password='';await browser.close();}
