import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import {executePublish} from '../server/publish.ts';
import {catalogEntries} from '../app/catalog.ts';
const base='http://127.0.0.1:3100/presentations/';
let registry={version:1,items:catalogEntries.map(e=>({id:e.id,public:true}))},deployed=structuredClone(registry),pending=[];
const decks=new Map(),calls=[];
const git=async(path,method='GET',body)=>{
 if(path.startsWith('contents/public/decks/catalog.json?ref='))return {content:Buffer.from(JSON.stringify(registry)).toString('base64')};
 if(path==='git/ref/heads/main')return {object:{sha:'a'.repeat(40)}};
 if(path==='git/commits/'+'a'.repeat(40))return {tree:{sha:'b'.repeat(40)}};
 if(path==='git/trees'){pending=body.tree;return {sha:'c'.repeat(40)};}
 if(path==='git/commits')return {sha:'d'.repeat(40)};
 if(path==='git/refs/heads/main'){for(const t of pending){if(t.path==='public/decks/catalog.json')registry=JSON.parse(t.content);else decks.set(t.path,JSON.parse(t.content));}return {};}
 throw Error('Unexpected Git request '+path);
};
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage();await page.setViewport({width:1440,height:950});
 page.on('dialog',d=>d.accept());
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setRequestInterception(true);
 page.on('request',async req=>{
  const url=new URL(req.url());
  if(url.pathname.endsWith('/decks/catalog.json'))return req.respond({status:200,contentType:'application/json',body:JSON.stringify(deployed)});
  if(url.pathname.endsWith('/api/publish/')){
   const input=JSON.parse(req.postData());calls.push(input);
   try{return req.respond({status:200,contentType:'application/json',body:JSON.stringify(await executePublish(input,git,'test-secret'))});}
   catch(e){return req.respond({status:e.status||500,contentType:'application/json',body:JSON.stringify({error:e.message})});}
  }
  if(url.pathname.includes('/decks/deck-')&&url.pathname.endsWith('/deck.json')){
   const deck=decks.get('public/'+url.pathname.slice('/presentations/'.length));
   return req.respond({status:deck?200:404,contentType:'application/json',body:JSON.stringify(deck||{})});
  }
  return req.continue();
 });
 const button=async(label,scope='')=>{await page.waitForFunction((label,scope)=>[...document.querySelectorAll(scope+' button')].some(b=>b.textContent.trim().replace(/ \*$/,'')===label&&!b.disabled),{},label,scope);await page.evaluate((label,scope)=>[...document.querySelectorAll(scope+' button')].find(b=>b.textContent.trim().replace(/ \*$/,'')===label).click(),label,scope);};
 const field=async(name,value)=>{await page.$eval(`[name=${name}]`,e=>{e.focus();e.select();});await page.keyboard.press('Backspace');await page.type(`[name=${name}]`,value);};
 await page.goto(base+'edit/');await page.waitForSelector('.catalog-row');await button('새 발표');
 await field('title','테스트 발표');await field('slug','260909-ahn');await button('추가','.catalog-details');await page.waitForSelector('[role=alert]');assert.equal(calls.length,0);
 await field('slug','new-talk');assert.equal(await page.$eval('[name=slug]',e=>e.value),'new-talk');await page.screenshot({path:'/tmp/new-presentation-form.png'});await button('추가','.catalog-details');await page.waitForFunction(()=>document.querySelectorAll('.catalog-row').length===8);
 const id=registry.items[0].id;assert.equal(registry.items[0].public,false);assert.equal(deployed.items.length,7,'creation opens before deployment');
 await page.click('.catalog-row:first-child .catalog-entry');await page.waitForSelector('.toolbar');assert.equal(await page.$$('.card').then(x=>x.length),0);assert.match(await page.$eval('.deck-label',e=>e.textContent),/테스트 발표/);
 await button('추가','.toolbar');await button('원본 포트폴리오 가져오기');await page.waitForFunction(()=>document.querySelectorAll('.card').length===79);
 await button('게시','.toolbar');await page.waitForFunction(()=>document.querySelector('[role=status]')?.textContent.includes('게시됨'));
 assert.equal(decks.get(`public/decks/${id}/deck.json`).slides.length,79);
 await page.goto(base+'edit/');await page.waitForFunction(()=>document.querySelectorAll('.catalog-row').length===8);await button('설정','.catalog-row:first-child');await field('title','수정된 발표');await field('slug','renamed-talk');await button('적용','.catalog-details');await button('저장','.catalog-header');
 await page.click('.catalog-row:first-child .catalog-entry');await page.waitForSelector('.toolbar');assert.equal(page.url(),base+'edit/renamed-talk/');assert.equal(await page.$$('.card').then(x=>x.length),79);
 assert.match(await page.$eval('.deck-label a[target=_blank]',a=>a.href),/\/renamed-talk\/$/);
 await page.goto(base+'edit/');await page.waitForSelector('.catalog-row');await button('비공개','.catalog-row:first-child');await button('게시','.catalog-header');await page.waitForFunction(()=>document.querySelector('[role=status]')?.textContent.includes('게시됨'));
 assert.equal(registry.items[0].id,id);assert.equal(registry.items[0].presentation.slug,'renamed-talk');assert.equal(registry.items[0].public,true);
 deployed=structuredClone(registry);
 await page.goto(base+'renamed-talk/');await page.waitForSelector('.present-controls');assert.match(await page.$eval('.present-controls',e=>e.textContent),/1 \/ 79/);assert.equal(await page.$('.toolbar'),null);
 await page.goto(base+'edit/');await page.waitForSelector('.catalog-row');await button('새 발표');await page.setViewport({width:390,height:844});await page.screenshot({path:'/tmp/new-presentation-mobile.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);console.log('PASS: new private presentation, duplicate slug blocked, immediate empty editor before deployment, publish new deck, rename keeps 79-slide draft and ID, public result, mobile form');
}finally{await browser.close();}
