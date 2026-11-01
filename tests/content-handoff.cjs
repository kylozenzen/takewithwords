const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const proxy=require('../netlify/functions/buffer-proxy.js');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let item=null,writes=[],failPromotion=false;
 const channel={id:'channel1',name:'LinkedIn',displayName:'Ben',service:'linkedin'};
 await page.addInitScript(()=>{
  localStorage.setItem('twu_buffer_access_token','mock-token');
  localStorage.setItem('doctors-orders-app-v1',JSON.stringify({view:'write',onboarded:true,activeId:'d1',drafts:[{id:'d1',title:'My story',body:'Here is something I learned from building in public.',status:'draft',created:Date.now(),updated:Date.now(),development:{coreThought:'Private supporting thought'}}],buffer:{connected:true,selected:{channel1:true},channels:[{id:'channel1',name:'Ben',service:'linkedin',limit:3000,av:'B',avBg:'#fff'}]}}));
  window.BufferConnection={init(){},getValidAccessToken:async()=>'mock-token'};
  window.BufferOAuth={};window.TWW_BUFFER={prefix:'twu'};
 });
 await page.route('**/.netlify/functions/buffer-proxy',async route=>{
  const {query,variables}=route.request().postDataJSON();let data;
  if(query.includes('createContentItemDraft(')) { writes.push(['create',variables.input]);item={id:'item1',title:'My story',body:{__typename:'DraftContent',text:variables.input.draft.text,aiAssisted:false,assets:[]}};data={createContentItemDraft:{__typename:'CreateContentItemDraftSuccess',contentItem:item}}; }
  else if(query.includes('updateContentItemDraft(')) { writes.push(['update',variables.input]);item.body.text=variables.input.draft.text;data={updateContentItemDraft:{__typename:'UpdateContentItemDraftSuccess',contentItem:item}}; }
  else if(query.includes('promoteContentItemDraftToPosts(')) { writes.push(['promote',variables.input]);data=failPromotion?{promoteContentItemDraftToPosts:{__typename:'PromoteContentItemDraftToPostsFailure',message:'Test channel limit',errors:[{message:'Test channel limit'}]}}:{promoteContentItemDraftToPosts:{__typename:'PromoteContentItemDraftToPostsSuccess',contentItem:{...item,body:{__typename:'PostContent',posts:variables.input.posts.map(p=>({id:'post1',status:'draft',channel:{id:p.channelId,name:'Ben'}}))}}}};if(!failPromotion)item=data.promoteContentItemDraftToPosts.contentItem; }
  else if(query.includes('contentItem(input:'))data={contentItem:item};
  else if(query.includes('channels(input:'))data={channels:[channel]};
  else data={account:{organizations:[{id:'org1',name:'My org'}]}};
  // Exercise the uploaded baseline's real proxy guards before mocking Buffer upstream.
  global.fetch=async()=>({status:200,text:async()=>JSON.stringify({data})});
  const response=await proxy.handler({httpMethod:'POST',headers:{origin:'http://127.0.0.1:8765'},body:route.request().postData()});
  assert.equal(response.statusCode,200,'actual browser operation must pass proxy allowlist');
  await route.fulfill({status:response.statusCode,headers:response.headers,body:response.body});
 });
 await page.goto('http://127.0.0.1:8765/app/');
 await page.locator('[data-act="sync-content"]').waitFor({state:'visible'});
 assert.equal(writes.length,0,'no automatic uploads');
 await page.locator('[data-act="sync-content"]').click();
 await page.waitForFunction(()=>document.querySelector('#contentSyncStatus').textContent.includes('without a channel'));
 assert.equal(writes.length,1);assert.equal(writes[0][1].draft.aiAssisted,false);
 assert.ok(!JSON.stringify(writes).includes('Private supporting thought'));
 item.body.text='Edited remotely';
 await page.locator('[data-act="sync-content"]').click();
 await page.waitForFunction(()=>document.querySelector('#contentSyncStatus').textContent.includes('changed in Buffer'));
 assert.equal(writes.length,1,'remote change not overwritten');
 item.body.text=writes[0][1].draft.text;item.body.assets=[{__typename:'ImageAsset'}];
 await page.locator('[data-act="sync-content"]').click();
 await page.waitForFunction(()=>document.querySelector('#contentSyncStatus').textContent.includes('attachments'));
 assert.equal(writes.length,1,'attachments not dropped');item.body.assets=[];
 await page.locator('[data-act="fill"]').click();
 await page.locator('[data-mode="draft"]').click();
 failPromotion=true;
 await page.locator('#sendBtn').click();
 await page.waitForFunction(()=>document.querySelector('#fillStatus').textContent.includes('Test channel limit'));
 let saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('doctors-orders-app-v1')));
 assert.equal(saved.drafts[0].bufferContent.id,'item1');assert.equal(saved.drafts[0].status,'draft');
 failPromotion=false;
 await page.locator('#sendBtn').click();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('doctors-orders-app-v1')).drafts[0].bufferContent.state==='posts');
 saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('doctors-orders-app-v1')));
 assert.equal(saved.drafts[0].bufferContent.posts[0].id,'post1');
 assert.equal(saved.drafts[0].body,'Here is something I learned from building in public.');
 assert.equal(writes.filter(w=>w[0]==='create').length,1);
 assert.ok(writes.filter(w=>w[0]==='promote').every(w=>w[1].posts.every(p=>p.saveToDraft===true)));
 const writeCount=writes.length;
 await page.locator('[data-fd="today"]').click();
 await page.locator('[data-open="d1"]').click();
 await page.locator('[data-act="fill"]').click();
 await page.locator('[data-mode="draft"]').click();
 await page.locator('#sendBtn').click();
 await page.waitForFunction(()=>document.querySelector('#fillStatus').textContent.includes('already has channel posts'));
 assert.equal(writes.length,writeCount,'repeat send cannot create duplicate posts');
 assert.deepEqual(errors,[]);
 console.log('PASS: consent-only upload, private notes, conflict/attachment protection, failed promotion recovery, one linked item, confirmed channel draft IDs.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});

