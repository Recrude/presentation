import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
 const page=await browser.newPage();await page.goto('http://localhost:3100/',{waitUntil:'networkidle0'});
 for(const b of await page.$$('.toolbar button')) if((await b.evaluate(e=>e.textContent)).trim()==='발표'){await b.click();break;}
 await page.waitForSelector('.presentation-stage');
 const wheel=async(deltaY,ctrlKey=true,deltaX=0)=>page.$eval('.presentation-stage',(node,args)=>{const box=node.getBoundingClientRect();const event=new WheelEvent('wheel',{...args,clientX:box.width/2,clientY:box.height/2,bubbles:true,cancelable:true});node.dispatchEvent(event);return event.defaultPrevented;},{deltaY,ctrlKey,deltaX});
 assert.equal(await wheel(-70),true);
 await page.waitForSelector('.zoom-reset');
 const transformed=await page.$eval('.presentation-zoom',node=>node.style.transform);
 assert.ok(!transformed.includes('scale(1)'));
 assert.equal(await wheel(40,false,60),true);
 assert.notEqual(await page.$eval('.presentation-zoom',node=>node.style.transform),transformed);
 await page.click('.zoom-reset');
 await page.waitForFunction(()=>!document.querySelector('.zoom-reset'));
 assert.equal(await page.$eval('.presentation-zoom',node=>node.style.transform),'translate(0px, 0px) scale(1)');
 await wheel(-2000);await page.waitForFunction(()=>document.querySelector('.zoom-reset')?.textContent.startsWith('400%'),{polling:100});
 await page.keyboard.press('ArrowRight');
 await page.waitForFunction(()=>!document.querySelector('.zoom-reset'));
 await page.$eval('.presentation-stage',node=>{for(const [type,scale] of [['gesturestart',1],['gesturechange',2],['gestureend',2]]){const e=new Event(type,{cancelable:true});Object.assign(e,{scale,clientX:300,clientY:300});node.dispatchEvent(e);}});
 await page.waitForFunction(()=>document.querySelector('.zoom-reset')?.textContent.startsWith('200%'));
 console.log('Verified pinch event zoom, pan, reset, 400% limit, page-change reset, and Safari gesture handler.');
}finally {await browser.close();}
