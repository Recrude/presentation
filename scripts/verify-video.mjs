import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
 const page=await browser.newPage();
 await page.goto('http://localhost:3100/audio-morphology.html');
 await page.waitForFunction(()=>{const v=document.querySelector('video');return v&&v.currentTime>0.2&&!v.error});
 const meta=await page.$eval('video',v=>({duration:v.duration,width:v.videoWidth,height:v.videoHeight,muted:v.muted}));
 assert.ok(Math.abs(meta.duration-150.15)<.1);assert.equal(meta.width,1920);assert.equal(meta.height,1080);assert.equal(meta.muted,true);
 await page.$eval('video',v=>{v.currentTime=100});await page.waitForFunction(()=>document.querySelector('video').currentTime>=100&&document.querySelector('video').readyState>=2);
 await page.goto('http://localhost:3100/',{waitUntil:'networkidle0'});
 await page.waitForFunction(()=>document.querySelectorAll('.card').length===79);
 await page.locator('.toolbar button').click();
 const buttons=await page.$$('.presets button');for(const b of buttons)if(await b.evaluate(e=>e.textContent==='음향형태론 전시 영상')){await b.click();break}
 await page.waitForFunction(()=>document.querySelectorAll('.card').length===80);
 assert.equal(await page.$$eval('.print-slide img',imgs=>imgs.filter(i=>i.src.endsWith('audio-morphology.jpg')).length),1);
 await page.locator('.toolbar button:last-child').click();
 await page.waitForFunction(()=>{const v=document.querySelector('.presentation video');return v&&v.currentTime>0.2});
 console.log('Verified standalone autoplay, 1080p metadata, seek to 100s, slide insertion, presentation playback, PDF poster.');
}finally{await browser.close()}
