const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { handler } = require('../netlify/functions/buffer-proxy.js');
const operations = require('../js/content-item-operations.js');
let forwarded = 0;
global.fetch = async () => { forwarded++; return { status: 200, text: async () => JSON.stringify({ data: {} }) }; };
function event(query, token='test', origin='http://127.0.0.1:8765') {
  return {httpMethod:'POST', headers:{origin}, body:JSON.stringify({query,token,variables:{}})};
}
(async () => {
  const calls=[];
  const context={window:{TWWContentItemOperations:operations,BufferAPI:{call:async(query)=>{
    calls.push(query);
    if(query===operations.organization) return {account:{organizations:[{id:'org1'}]}};
    if(query===operations.read) return {contentItem:{id:'item1'}};
    const key=Object.keys(operations).find(k=>operations[k]===query);
    return {[key]:{contentItem:{id:'item1'}}};
  }}}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/content-items.js'),'utf8'),context);
  const api=context.window.TWWContentItems;
  await api.organization();await api.create({});await api.read('item1');await api.update({});await api.promote({});
  assert.equal(calls.length,5);
  for (const query of calls) assert.equal((await handler(event(query))).statusCode,200);
  const legacy=[];
  const window={BufferConnection:{getValidAccessToken:async()=>'test'}};
  const apiContext={window,fetch:async(_url,options)=>{
    const payload=JSON.parse(options.body);legacy.push(payload.query);
    const data=payload.query.includes('organizations')?{account:{organizations:[{id:'org1'}]}}:payload.query.includes('channels')?{channels:[]}:{createPost:{__typename:'PostActionSuccess',post:{id:'post1'}}};
    return {ok:true,json:async()=>({data})};
  }};
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/buffer-api.js'),'utf8'),apiContext);
  await window.BufferAPI.fetchChannels();await window.BufferAPI.createPost({});
  assert.equal(legacy.length,3);
  for (const query of legacy) assert.equal((await handler(event(query))).statusCode,200);
  const before=forwarded;
  assert.equal((await handler(event('query { account { id } }'))).statusCode,403);
  assert.equal((await handler(event(operations.read+' mutation Delete { deletePost(input:{id:"x"}) { __typename } }'))).statusCode,403);
  assert.equal((await handler(event(operations.read,'test','https://untrusted.example'))).statusCode,403);
  assert.equal((await handler(event(operations.read,''))).statusCode,401);
  assert.equal(forwarded,before,'blocked requests never reach Buffer');
  for(let i=0;i<120;i++) assert.equal((await handler(event(operations.read,'rate-test'))).statusCode,200);
  assert.equal((await handler(event(operations.read,'rate-test'))).statusCode,429);
  console.log('PASS: real adapter and legacy operations allowed; arbitrary/appended operations, untrusted origins, missing tokens blocked; 120-request rate limit retained.');
})().catch(e=>{console.error(e);process.exit(1)});
