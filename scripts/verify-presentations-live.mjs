import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox']});
const page=await browser.newPage();await page.setViewport({width:1440,height:900});
const base='https://jaeyeonkim.kr/presentations/';
const sept='2026-09-09-ahn-byunghak-graduation-project',nov='2026-11-03-yoon-jaeyoung-graduation-project';
try{
 await page.goto(base,{waitUntil:'networkidle2'});await page.waitForSelector('.catalog-row');assert.equal(await page.$$eval('.catalog-row',els=>els.length),7);assert.equal(page.url(),base);await page.screenshot({path:'/tmp/presentations-live-index.png'});
 await page.goto(base+sept+'/',{waitUntil:'domcontentloaded'});await page.waitForSelector('.presentation .original');await page.waitForFunction(()=>document.querySelector('.original')?.naturalWidth>0);assert.match(await page.$eval('.present-controls',el=>el.textContent),/1 \/ 92/);assert.equal(await page.$('.editor'),null);assert.equal(page.url(),base+'260909-ahn/');
 await page.keyboard.press('ArrowRight');await page.waitForSelector('.presentation iframe');await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>document.querySelector('.present-controls')?.textContent.includes('3 / 92'));await page.waitForFunction(()=>[...document.querySelectorAll('.original')].some(i=>i.naturalWidth>0));
 await page.goto(base+'edit/'+nov+'/',{waitUntil:'networkidle2'});await page.waitForSelector('input[name="password"]');assert.ok(page.url().startsWith(base+'login/'));assert.equal(await page.$('.editor'),null);

 const resources=await page.evaluate(async()=>{
  const urls=['/presentations/decks/2026-09-09-ahn-byunghak-graduation-project/deck.json','/presentations/media/audio-morphology.mp4','/presentations/api/capture/?url=http://localhost'];
  return Promise.all(urls.map(async url=>{const r=await fetch(url,{method:url.includes('capture')?'GET':'HEAD'});return{url,status:r.status,type:r.headers.get('content-type'),cache:r.headers.get('cache-control')};}));
 });assert.equal(resources[0].status,200);assert.equal(resources[1].status,200);assert.match(resources[1].type,/video\/mp4/);assert.equal(resources[2].status,401);
 const old=await page.goto('https://jaeyeonkim.kr/presentation/',{waitUntil:'domcontentloaded'});assert.ok([200,304].includes(old.status()));assert.equal(page.url(),base);
 const legacy=await page.goto('https://jaeyeonkim.kr/presentation/nmd02/',{waitUntil:'domcontentloaded'});assert.equal(legacy.status(),200);
 console.log('PASS live custom domain: list, public 92-slide deck, password-gated editing, video, capture endpoint, old-index redirect, legacy deck retention');console.log(resources);
}finally{await browser.close();}
