import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
 const page=await browser.newPage();await page.setRequestInterception(true);page.on('request',r=>{if(r.url().endsWith('/deck.json'))void r.respond({status:404,contentType:'application/json',body:'{}'});else void r.continue();}); /* 9/9 editor without a published copy starts from the 79 originals */ 
 await page.goto('http://localhost:3100/presentations/edit/260909-ahn/',{waitUntil:'networkidle0'});
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
 // Leaving the presentation selects the slide it ended on and scrolls its card into view.
 await page.keyboard.press('End');
 await page.keyboard.press('Escape');
 await page.waitForSelector('.presentation-layer',{hidden:true});
 await new Promise(r=>setTimeout(r,100));
 const left=await page.evaluate(()=>{const last=[...document.querySelectorAll('.card:not(.hidden-slide)')].at(-1),g=last.closest('.grid').getBoundingClientRect(),r=last.getBoundingClientRect();
   return{selected:[...document.querySelectorAll('.card.selected')].map(c=>c.dataset.slideId),last:last.dataset.slideId,title:document.querySelector('.properties input')?.value,lastTitle:last.querySelector('.card-title').textContent,inView:r.top>=Math.max(0,g.top)-1&&r.bottom<=Math.min(innerHeight,g.bottom)+1};});
 assert.deepEqual(left.selected,[left.last],'the last slide shown is selected');
 assert.equal(left.title,left.lastTitle,'and open in the panel');
 assert.ok(left.inView,'its card is in view');
 console.log('Verified delayed decode keeps previous frame, rapid navigation cancels stale transitions, decoded DOM is retained, backward navigation works, and leaving the presentation selects the slide it ended on.');
} finally {await browser.close();}
