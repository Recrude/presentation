import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
 const page=await browser.newPage();
 await page.setRequestInterception(true);
 page.on('request',request=>{
   if(request.url().startsWith('https://ved.kr/')) void request.respond({status:200,contentType:'text/html',body:'<button id="control" style="width:400px;height:200px">Embedded control</button>'});
   else void request.continue();
 });
 await page.goto('http://localhost:3100/');
 await page.evaluate(()=>localStorage.setItem('jaeyeon-slides-v1',JSON.stringify([
   {id:'web',title:'Web',kind:'web',src:'https://ved.kr/',hidden:false},
   {id:'next',title:'Next',kind:'image',src:'/slides/page-01.webp',hidden:false}
 ])));
 await page.reload({waitUntil:'networkidle0'});
 for(const b of await page.$$('.toolbar button'))if((await b.evaluate(e=>e.textContent)).trim()==='발표'){await b.click();break;}
 await page.waitForSelector('.presentation iframe');
 const frame=await (await page.$('.presentation iframe')).contentFrame();
 await frame.waitForSelector('#control');await frame.click('#control');
 await page.waitForFunction(()=>document.activeElement?.classList.contains('presentation'));
 await new Promise(r=>setTimeout(r,2000));
 assert.equal(await page.$eval('.present-controls',e=>getComputedStyle(e).opacity),'0.65');
 await page.keyboard.press('ArrowRight');
 await page.waitForFunction(()=>document.querySelector('.presentation-layer[aria-hidden="false"] img')?.src.includes('page-01'));
 await page.focus('.present-controls button');
 await page.keyboard.press('ArrowLeft');
 await page.waitForSelector('.presentation iframe');
 console.log('Verified cross-origin iframe click restores presentation focus, idle embed navigation remains visible, and arrows navigate even on a focused button.');
}finally{await browser.close();}
