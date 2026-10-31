import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
 const page=await browser.newPage();await page.setRequestInterception(true);page.on('request',r=>{if(r.url().endsWith('/deck.json'))void r.respond({status:404,contentType:'application/json',body:'{}'});else void r.continue();}); /* 9/9 editor without a published copy starts from the 79 originals */ await page.setViewport({width:1440,height:1000});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const deck=[0,1,2].map(i=>({id:`original-${i}`,kind:'image',src:`/slides/page-0${i}.webp`,hidden:false,title:`Original ${i+1}`}));
 for(const [i,url] of ['https://ved.kr/','https://whatareyoudoingnow.vercel.app/','https://jaeyeonkim.kr/','https://www.youtube-nocookie.com/embed/QIAcSGkOLDk'].entries()) deck.push({id:`embed-${i}`,kind:i===3?'youtube':'web',src:url,hidden:false,title:`Embed ${i+1}`});
 await page.evaluateOnNewDocument(deck=>{localStorage.setItem('jaeyeon-slides-v1',JSON.stringify(deck));window.print=()=>{window.__printed={captures:[...document.querySelectorAll('.print-slide .capture-slide img')].filter(i=>i.complete&&i.naturalWidth>0).length,slides:document.querySelectorAll('.print-slide').length,folioText:document.querySelectorAll('.print-slide .folio text').length};};},deck);
 await page.goto('http://localhost:3100/presentations/edit/260909-ahn/',{waitUntil:'networkidle0'});
 await page.waitForFunction(()=>document.querySelectorAll('.card').length===7);
 console.log(await page.$$eval('.toolbar button',bs=>bs.map(b=>({text:b.textContent,disabled:b.disabled}))));
 await page.locator('.toolbar button:nth-last-child(2)').click();
 await page.waitForFunction(()=>window.__printed);const printed=await page.evaluate(()=>window.__printed);
 assert.equal(printed.captures,4);
 assert.equal(printed.slides,7);
 assert.equal(printed.folioText,0);
 assert.deepEqual(errors,[]);console.log('PDF: 7 pages, 4 loaded embed captures, vector folios, no runtime errors');
} finally {await browser.close();}
