import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
 const page=await browser.newPage();
 await page.goto('http://localhost:3100/',{waitUntil:'networkidle0'});
 await page.waitForFunction(()=>document.querySelectorAll('.card').length===79);
 await page.evaluate(()=>{
   window.decodeGates=[];
   const decode=HTMLImageElement.prototype.decode;
   HTMLImageElement.prototype.decode=function(){
     const ready=decode.call(this);
     if(this.closest('.presentation-layer')) return ready.then(()=>new Promise(resolve=>window.decodeGates.push(resolve)));
     return ready;
   };
 });
 for(const b of await page.$$('.toolbar button')) if((await b.evaluate(e=>e.textContent)).trim()==='발표'){await b.click();break;}
 await page.waitForSelector('.presentation-layer');
 const current=()=>page.$eval('.presentation-layer[aria-hidden="false"] img',e=>e.src);
 const first=await current();
 await page.keyboard.press('ArrowRight');
 await page.waitForFunction(()=>window.decodeGates.length===1);
 assert.equal(await current(),first,'Previous frame must remain visible during decode');
 await page.keyboard.press('ArrowRight');
 await page.waitForFunction(()=>window.decodeGates.length===2);
 await page.evaluate(()=>window.decodeGates[0]());
 await new Promise(r=>setTimeout(r,80));
 assert.equal(await current(),first,'Cancelled intermediate frame must never replace current frame');
 await page.evaluate(()=>{window.targetImage=document.querySelector('.presentation-layer[aria-hidden="true"] img');window.decodeGates[1]();});
 await page.waitForFunction(()=>document.querySelector('.presentation-layer[aria-hidden="false"] img')===window.targetImage);
 assert.ok((await current()).includes('page-74-white.png'),'Latest requested slide should be shown');
 assert.equal(await page.$$eval('.presentation-layer',nodes=>nodes.length),1);
 await page.keyboard.press('ArrowLeft');
 await page.waitForFunction(()=>window.decodeGates.length===3);
 await page.evaluate(()=>window.decodeGates[2]());
 await page.waitForFunction(()=>document.querySelector('.presentation-layer[aria-hidden="false"] img').src.includes('page-01.webp'));
 console.log('Verified delayed decode keeps previous frame, rapid navigation cancels stale transitions, decoded DOM is retained, and backward navigation works.');
} finally {await browser.close();}
