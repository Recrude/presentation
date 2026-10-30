import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox']});
const page=await browser.newPage(); await page.setViewport({width:1440,height:950});
const base='http://127.0.0.1:3100/presentations/';
try {
 await page.goto(base+'edit/');await page.waitForSelector('.catalog-row');assert.equal(await page.$$('.catalog-row').then(x=>x.length),7);
 const original = await page.$$eval('.catalog-row',rows=>rows.map(r=>r.dataset.presentationId));
 assert.match(await page.$eval('.catalog-entry',a=>a.href),/edit\/261103-yun\/$/);
 await page.click('.catalog-row:first-child .catalog-actions button:last-child');
 let order = await page.$$eval('.catalog-row',rows=>rows.map(r=>r.dataset.presentationId));assert.equal(order[1],original[0]);
 await page.click('.catalog-row:first-child .catalog-actions button:first-child');assert.equal(await page.$eval('.catalog-row:first-child .catalog-actions button',b=>b.getAttribute('aria-pressed')),'false');
 await page.evaluate(()=>[...document.querySelectorAll('.catalog-header button')].find(b=>b.textContent.startsWith('저장')).click());
 await page.reload();await page.waitForSelector('.catalog-row');assert.equal(await page.$eval('.catalog-row:first-child',r=>r.dataset.presentationId),original[1]);assert.equal(await page.$eval('.catalog-row:first-child .catalog-actions button',b=>b.textContent),'비공개');
 // Native drop handling and insertion order.
 await page.setDragInterception(true);
 const handle = await page.$('.catalog-row:first-child .catalog-handle'); const target = await page.$('.catalog-row:nth-child(3)');
 const h = await handle.boundingBox(), r = await target.boundingBox();
 await page.mouse.dragAndDrop({x:h.x+h.width/2,y:h.y+h.height/2},{x:r.x+r.width/2,y:r.y+r.height-2},{delay:100});
 await page.setDragInterception(false);

 order=await page.$$eval('.catalog-row',rows=>rows.map(r=>r.dataset.presentationId));assert.equal(order[2],original[1]);
 await page.evaluate(()=>[...document.querySelectorAll('.catalog-header button')].find(b=>b.textContent.startsWith('저장')).click());
 await page.screenshot({path:'/tmp/catalog-settings.png'});
 await page.setViewport({width:390,height:844});await page.screenshot({path:'/tmp/catalog-settings-mobile.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 // Local settings do not leak into the public list before publishing.
 await page.goto(base);await page.waitForSelector('.catalog-row');assert.equal(await page.$$('.catalog-row').then(x=>x.length),7);assert.equal(await page.$eval('.catalog-row',r=>r.dataset.presentationId),original[0]);
 await page.setViewport({width:1440,height:950});await page.screenshot({path:'/tmp/catalog-public.png'});
 // Mock a published hide. Public page must not fetch deck data, editor still opens it.
 const serverConfig=await page.evaluate(async()=>await(await fetch('/presentations/decks/catalog.json')).json());serverConfig.items.find(i=>i.id===original[1]).public=false;
 let deckFetched=false;
 await page.setRequestInterception(true);page.on('request',r=>{if(r.url().includes('/decks/catalog.json'))return r.respond({status:200,contentType:'application/json',body:JSON.stringify(serverConfig)});if(r.url().includes('/deck.json'))deckFetched=true;return r.continue();});
 await page.reload();await page.waitForSelector('.catalog-row');assert.equal(await page.$$('.catalog-row').then(x=>x.length),6);
 await page.goto(base+'260909-ahn/');await page.waitForFunction(()=>document.body.textContent.includes('공개되지 않은 발표'));assert.equal(await page.$('.presentation'),null);assert.equal(deckFetched,false);
 await page.goto(base+'edit/260909-ahn/');await page.waitForSelector('.card');assert.equal(await page.$$('.card').then(x=>x.length),92);
 // Old long URL canonicalizes but preserves the same editor and IDB key.
 await page.goto(base+'edit/'+original[1]+'/');await page.waitForSelector('.card');assert.equal(page.url(),base+'edit/260909-ahn/');
 const published=await page.evaluate(async config=>{const {publishCatalog}=await import('/presentations/app/github-publish.ts');const real=fetch,calls=[];window.fetch=async(url,options)=>{if(!String(url).endsWith('api/github'))return real(url,options);const call=JSON.parse(options.body);calls.push(call);return new Response(JSON.stringify(call.path==='git/ref/heads/main'?{object:{sha:'a'.repeat(40)}}:call.path.startsWith('git/commits/')?{tree:{sha:'b'.repeat(40)}}:{sha:'c'.repeat(40)}),{headers:{'Content-Type':'application/json'}});};try{await publishCatalog(config,'');return calls;}finally{window.fetch=real;}},serverConfig);
 const tree=published.find(c=>c.path==='git/trees').body;assert.equal(tree.base_tree,'b'.repeat(40));assert.equal(tree.tree.length,1);assert.equal(tree.tree[0].path,'public/decks/catalog.json');assert.deepEqual(JSON.parse(tree.tree[0].content),serverConfig);assert.equal(published.find(c=>c.method==='PATCH').body.force,false);
 console.log('PASS: short/legacy routes, settings persistence, drag and arrow sorting, visibility, public/draft separation, hidden viewer guard, editor access, atomic catalog-only publish, mobile width');
} finally {await browser.close();}
