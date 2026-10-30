import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
let password='';for await(const chunk of process.stdin)password+=chunk;password=password.trim();
if(!password)throw Error('Pass the presentation password through stdin.');
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox']});
try{
 for(const origin of ['https://jaeyeonkim.kr','https://presentation-wine-ten.vercel.app']){
  const context=await browser.createBrowserContext(),page=await context.newPage();
  const githubRequests=[];page.on('request',r=>{if(r.url().startsWith('https://api.github.com/'))githubRequests.push(r.url());});
  const base=origin+'/presentations/';
  await page.goto(base+'edit/',{waitUntil:'networkidle2'});await page.waitForSelector('input[name=password]');
  const unauth=await fetch(base+'api/publish/',{method:'POST',headers:{'Content-Type':'application/json','X-Presentation-Publish':'1',Origin:origin},body:JSON.stringify({action:'catalog'})});assert.equal(unauth.status,401);
  await page.type('input[name=password]',password);await Promise.all([page.waitForNavigation({waitUntil:'networkidle2'}),page.click('button[type=submit]')]);
  await page.waitForSelector('.catalog-row');assert.equal(await page.$('input[type=password]'),null);
  const publicConfig=await page.evaluate(async()=>await(await fetch('/presentations/decks/catalog.json')).json());
  assert.deepEqual(await page.$$eval('.catalog-row',rows=>rows.map(r=>({id:r.dataset.presentationId,public:r.querySelector('.catalog-actions button').getAttribute('aria-pressed')==='true'}))),publicConfig.items);
  const publishedResponse=page.waitForResponse(r=>r.url().endsWith('/api/publish/')&&r.request().method()==='POST',{timeout:90000});
  await page.evaluate(()=>[...document.querySelectorAll('.catalog-header button')].find(b=>b.textContent.trim()==='게시').click());
  const response=await publishedResponse;const result=await response.json();assert.equal(response.status(),200,JSON.stringify(result));assert.equal(result.published,true);assert.equal(result.unchanged,true,'verification must leave the published configuration unchanged');
  await page.waitForFunction(()=>document.body.textContent.includes('공개 목록과 같습니다'));
  const checks=await page.evaluate(async()=>{
   const api=async(body,header=true)=>{const r=await fetch('/presentations/api/publish/',{method:'POST',headers:{'Content-Type':'application/json',...(header?{'X-Presentation-Publish':'1'}:{})},body:JSON.stringify(body)});return {status:r.status,result:await r.json()};};
   const forbidden=await api({action:'catalog'},false),invalid=await api({action:'raw',path:'package.json'});
   const content='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6mQAAAAASUVORK5CYII=';
   const bytes=Uint8Array.from(atob(content),c=>c.charCodeAt(0));const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
   const upload=await api({action:'upload',slug:'2026-11-03-yoon-jaeyoung-graduation-project',mime:'image/png',hash,index:0,count:1,content});
   return {forbidden,invalid,upload,hash};
  });
  assert.equal(checks.forbidden.status,403);assert.equal(checks.invalid.status,400);assert.equal(checks.upload.status,200,JSON.stringify(checks.upload.result));assert.equal(checks.upload.result.proof.data.hash,checks.hash);assert.match(checks.upload.result.proof.signature,/^[a-f0-9]{64}$/);
  await page.goto(base+'edit/261103-yun/',{waitUntil:'networkidle2'});await page.waitForSelector('.toolbar');assert.equal(await page.$('input[type=password]'),null);assert.equal(await page.$$eval('.toolbar button',buttons=>buttons.filter(b=>b.textContent.trim()==='게시').length),1);
  assert.deepEqual(githubRequests,[]);await context.close();console.log('PASS '+origin+': password-only one-click catalog publish, unchanged public data, authenticated image upload, invalid requests rejected, no browser GitHub requests or token input');
 }
}finally{password='';await browser.close();}
