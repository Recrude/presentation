import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox']});
const page=await browser.newPage();await page.setViewport({width:1440,height:1000});
const base='http://127.0.0.1:3100/presentations/';
const sept='2026-09-09-ahn-byunghak-graduation-project',nov='2026-11-03-yoon-jaeyoung-graduation-project';
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
 await page.goto(base);await page.waitForSelector('.catalog-row');assert.equal(await page.$$eval('.catalog-row',e=>e.length),7);assert.equal(await page.$$eval('.catalog-entry[href^="https:"]',e=>e.length),5);await page.screenshot({path:'/tmp/presentations-index.png'});
 await page.goto(base+sept+'/');await page.waitForSelector('.presentation .original');await page.waitForFunction(()=>document.querySelector('.original')?.complete);assert.equal(await page.$('.editor'),null);assert.match(await page.$eval('.present-controls',e=>e.textContent),/1 \/ 92/);
 await page.keyboard.press('ArrowRight');await page.waitForSelector('.presentation iframe');assert.match(await page.$eval('.presentation iframe',e=>e.src),/jaeyeonkim.kr/);await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>document.querySelector('.present-controls')?.textContent.includes('3 / 92'));await page.screenshot({path:'/tmp/presentations-public.png'});
 assert.deepEqual(await page.evaluate(async()=>await indexedDB.databases()),[],'public view must not open the draft database');
 await page.goto(base+'edit/'+nov+'/');await page.waitForFunction(()=>document.querySelector('.toolbar')?.textContent.includes('발표 0 / 전체 0'));assert.equal(await page.$$('.card').then(e=>e.length),0);await page.screenshot({path:'/tmp/presentations-new-editor.png'});
 // Seed legacy state just like the September browser, without migrating or mutating it.
 await page.evaluate(async()=>{const {initial}=await import('/presentations/app/model.ts');const r=indexedDB.open('jaeyeon-slide-studio',1);await new Promise((resolve,reject)=>{r.onsuccess=()=>resolve();r.onerror=reject;});const tx=r.result.transaction('deck','readwrite');tx.objectStore('deck').put([initial[4],initial[1]],'current');await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=reject;});r.result.close();});
 await page.goto(base+'edit/'+sept+'/');await page.waitForFunction(()=>document.querySelectorAll('.card').length===2);const ids=await page.$$eval('.card',es=>es.map(e=>e.dataset.slideId));
 await page.evaluate(()=>[...document.querySelectorAll('.toolbar button')].find(b=>b.textContent.trim()==='저장').click());await page.waitForFunction(()=>document.querySelector('[role=status]')?.textContent.includes('이 브라우저에 저장됨'));
 await page.goto(base+'edit/'+nov+'/');await page.waitForFunction(()=>document.querySelector('.toolbar')?.textContent.includes('발표 0 / 전체 0'));assert.equal(await page.$$('.card').then(e=>e.length),0);
 await page.evaluate(()=>[...document.querySelectorAll('.toolbar button')].find(b=>b.textContent.trim()==='추가').click());await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='원본 포트폴리오 가져오기').click());assert.equal(await page.$$('.card').then(e=>e.length),79);
 await page.evaluate(()=>[...document.querySelectorAll('.toolbar button')].find(b=>b.textContent.trim().startsWith('저장')).click());await page.waitForFunction(()=>document.querySelector('[role=status]')?.textContent.includes('이 브라우저에 저장됨'));
 await page.goto(base+'edit/'+sept+'/');await page.waitForFunction(()=>document.querySelectorAll('.card').length===2);assert.deepEqual(await page.$$eval('.card',es=>es.map(e=>e.dataset.slideId)),ids);
 const state=await page.evaluate(async()=>{const r=indexedDB.open('jaeyeon-slide-studio',1);await new Promise(resolve=>r.onsuccess=resolve);const req=r.result.transaction('deck').objectStore('deck').get('current');await new Promise(resolve=>req.onsuccess=resolve);r.result.close();return req.result.map(s=>s.id);});assert.deepEqual(state,ids,'legacy key remains unchanged');
 await page.goto(base+sept+'/');await page.waitForSelector('.present-controls');assert.match(await page.$eval('.present-controls',e=>e.textContent),/1 \/ 92/,'public ignores 2-slide local draft');
 await page.goto(base+nov+'/');await page.waitForFunction(()=>document.body.textContent.includes('아직 공개된 장표가 없습니다.'));assert.equal(await page.$('.editor'),null);
 // Imported backups get fresh image IDs so other decks retain their own images.
 const imported = await page.evaluate(async () => {
   const {importBackup}=await import('/presentations/app/transfer.tsx');
   const {readImage,saveImages}=await import('/presentations/app/storage.ts');
   await saveImages([['same-photo',new Blob(['original'],{type:'image/png'})]]);
   const backup={version:1,slug:'backup',slides:[{id:'copy',title:'copy',kind:'gallery',src:'',hidden:false,photos:[{id:'same-photo',name:'photo',width:1,height:1}]}],images:{'same-photo':'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6mQAAAAASUVORK5CYII='}};
   const restored=await importBackup(backup);
   const id=restored.slides[0].photos[0].id;
   return {id,old:await (await readImage('same-photo')).text(),newSize:(await readImage(id)).size};
 });
 assert.notEqual(imported.id,'same-photo');assert.equal(imported.old,'original');assert.ok(imported.newSize>0);
 // Mock the API, inspect atomic tree creation and assets, never mutate GitHub during tests.
 await page.goto(base+'edit/'+nov+'/');await page.waitForSelector('.toolbar');
 const result=await page.evaluate(async(slug)=>{
  const {publishDeck}=await import('/presentations/app/github-publish.ts');
  const originalFetch=window.fetch,calls=[];let fail=false;
  window.fetch=async(url,opts)=>{
   if(!String(url).endsWith('api/github'))return originalFetch(url,opts);
   const body=JSON.parse(opts.body);calls.push(body);
   if(body.method==='PATCH'&&fail)return new Response('',{status:422});
   const data=body.path==='git/ref/heads/main'?{object:{sha:'a'.repeat(40)}}:body.path.startsWith('git/commits/')?{tree:{sha:'b'.repeat(40)}}:{sha:'c'.repeat(40)};
   return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
  };
  const photo={id:'uploaded',name:'test',width:1,height:1};
  const slides=[{id:'gallery',title:'photo',src:'',kind:'gallery',hidden:false,photos:[photo]},{id:'secret',title:'hidden',src:'https://ved.kr/',kind:'web',hidden:true}];
  try{
   const snap=await publishDeck(slug,slides,{uploaded:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6mQAAAAASUVORK5CYII='},'',()=>{});
   fail=true;let conflict='';try{await publishDeck(slug,[],{},'',()=>{});}catch(e){conflict=e.message;}
   return {snap,calls,conflict};
  }finally{window.fetch=originalFetch;}
 },nov);
 assert.equal(result.snap.slides.length,1);assert.match(result.snap.assets.uploaded,/^\/presentations\/decks\/.+\/assets\/[a-f0-9]{64}\.png$/);const tree=result.calls.find(x=>x.path==='git/trees');assert.equal(tree.body.base_tree,'b'.repeat(40));assert.equal(tree.body.tree.length,2);assert.equal(result.calls.find(x=>x.method==='PATCH').body.force,false);assert.match(result.conflict,/다른 게시/);
 assert.deepEqual(errors,[]);console.log('PASS: public/editor separation, 92-slide archive, blank November deck, isolated drafts, unchanged legacy state, atomic publish with assets, safe conflict handling');
}finally{await browser.close();}
