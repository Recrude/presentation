import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
 const page=await browser.newPage();
 await page.goto('http://localhost:3100/', {waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelectorAll('.card').length===79);
 const state=await page.evaluate(()=>({thumbs:[...document.querySelectorAll('.thumbnail img.original')].map(x=>x.src),print:document.querySelectorAll('.print-slide').length}));
 assert.equal(state.thumbs.length,79);
 assert.ok(state.thumbs.every(x=>x.includes('/thumbnails/')));
 assert.equal(state.print,0);
 await page.waitForFunction(()=>document.querySelector('.status').textContent.includes('원본 준비 완료'),{timeout:60000});
 await page.evaluate(()=>{window.print=()=>{window.printedImages=[...document.querySelectorAll('.print-slide img.original')].map(x=>({src:x.src,loaded:x.complete&&x.naturalWidth>0}));};});
 const buttons=await page.$$('button');
 for(const button of buttons) if((await button.evaluate(x=>x.textContent)).includes('PDF')) {await button.click(); break;}
 await page.waitForFunction(()=>window.printedImages?.length===79);
 const images=await page.evaluate(()=>window.printedImages);
 assert.ok(images.every(x=>x.loaded&&x.src.includes('/slides/')&&!x.src.includes('/thumbnails/')));
 assert.equal(images.filter(x=>x.src.includes('-white.png')).length,4);
 console.log('Verified 79 thumbnails, no initial PDF image tree, completed background preload, and all 79 full-resolution PDF images.');
} finally {await browser.close();}
