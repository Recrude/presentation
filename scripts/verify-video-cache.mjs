import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
 const page=await browser.newPage();
 await page.goto('http://localhost:3100/');
 await page.waitForFunction(()=>document.body.textContent.includes('영상 준비 완료'),{timeout:60000});
 const cacheSize=await page.evaluate(async()=>{const c=await caches.open('presentation-video-v1');const keys=await c.keys();return (await (await c.match(keys[0])).blob()).size;});
 assert.equal(cacheSize,33530903);
 const deck=[{id:'cached-video',title:'전시 영상',kind:'video',src:'/media/audio-morphology.mp4',hidden:false,autoplay:true,muted:true,controls:false}];
 await page.evaluate(deck=>localStorage.setItem('jaeyeon-slides-v1',JSON.stringify(deck)),deck);
 let videoRequests=0;
 await page.setRequestInterception(true);
 page.on('request',request=>{
   if(request.url().includes('/media/audio-morphology.mp4')) {videoRequests++;void request.abort();}
   else void request.continue();
 });
 await page.reload({waitUntil:'networkidle0'});
 await page.waitForFunction(()=>document.body.textContent.includes('영상 준비 완료'));
 for(const b of await page.$$('.toolbar button')) if((await b.evaluate(e=>e.textContent)).trim()==='발표'){await b.click();break;}
 await page.waitForFunction(()=>{const v=document.querySelector('.presentation video');return v?.currentTime>.2;});
 assert.ok(await page.$eval('.presentation video',v=>v.src.startsWith('blob:')&&v.controls));
 await page.$eval('.presentation video',v=>{v.currentTime=120;});
 await page.waitForFunction(()=>{const v=document.querySelector('.presentation video');return v.currentTime>=120&&v.readyState>=2;});
 assert.equal(videoRequests,0);
 assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('jaeyeon-slides-v1'))),deck);
 console.log('Verified complete 33.5MB persistent cache, reload without video network requests, autoplay and seeking to 120s from blob, and unchanged saved deck.');
}finally {await browser.close();}
