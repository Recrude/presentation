import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
 const page=await browser.newPage();await page.setViewport({width:1440,height:1000});
 await page.goto('http://localhost:3100/',{waitUntil:'networkidle0'});
 await page.waitForFunction(()=>document.querySelectorAll('.card').length===79);
 assert.deepEqual(await page.$$eval('.card',cards=>cards.slice(0,4).map(c=>c.dataset.slideId)),['original-0','original-1','original-74','original-75']);
 await page.locator('.toolbar button').click();
 const add=await page.$$('.add-panel button');
 for(const button of add)if(await button.evaluate(b=>b.textContent==='포트폴리오 조판면 추가')) {
   const dialog=page.waitForFileChooser();await button.click();await(await dialog).accept(['public/slides/page-00.webp','public/slides/page-01.webp']);break;
 }
 await page.waitForFunction(()=>document.querySelectorAll('.card').length===81);
 await page.waitForFunction(()=>!document.querySelector('main').inert);
 const dbDeck=await page.evaluate(async()=>{
   const buttons=[...document.querySelectorAll('.toolbar button')];buttons.find(b=>b.textContent.startsWith('저장')).click();
   await new Promise(r=>setTimeout(r,500));
   return new Promise((resolve,reject)=>{const req=indexedDB.open('jaeyeon-slide-studio',1);req.onsuccess=()=>{const db=req.result,tx=db.transaction('deck');const g=tx.objectStore('deck').get('current');g.onsuccess=()=>resolve(g.result);tx.oncomplete=()=>db.close()};req.onerror=reject;});
 });
 const added=dbDeck.filter(s=>s.kind==='folio');assert.equal(added.length,2);assert.equal(added[0].folioPalette.background,'#000000');assert.equal(added[1].folioPalette.background,'#ffffff');
 assert.equal(added[0].photos.length,1);assert.equal(added[1].photos.length,1);
 await page.reload({waitUntil:'networkidle0'});await page.waitForFunction(()=>document.querySelectorAll('.card').length===81);
 assert.equal(await page.$$eval('.print-slide .folio',e=>e.length),81);
 console.log('Verified chronological default; two individual full-image folios; black/white palette; save and reload; print folios.');
}finally{await browser.close();}
