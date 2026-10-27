import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import handler from '../api/foods.js';
const code=readFileSync(new URL('../food-database.js',import.meta.url),'utf8');
const reply=(data,status=200,type='application/json')=>new Response(type.includes('json')?JSON.stringify(data):data,{status,headers:{'content-type':type}});
function client(responses){
  const calls=[];
  const context={window:{},URLSearchParams,AbortController,setTimeout,clearTimeout,fetch:async url=>{
    calls.push(url);const next=responses.shift();if(next instanceof Error)throw next;
    assert.ok(next,'unexpected upstream request');return next;
  }};
  vm.runInNewContext(code,context);
  return {get:context.window.NutriAIFoodDatabase.get,calls};
}
test('EAN success returns real product data',async()=>{
  const {get,calls}=client([reply({status:1,product:{code:'3017620422003'}})]);
  assert.equal((await get({barcode:'3017620422003'})).product.code,'3017620422003');assert.equal(calls.length,1);
});
test('direct fallback keeps categories, images and full nutrient fields',async()=>{
  const {get,calls}=client([reply({error:'proxy unavailable'},503),reply({status:1,product:{categories_tags:['en:beverages']}})]);
  assert.deepEqual((await get({barcode:'737628064502'})).product.categories_tags,['en:beverages']);
  const fields=new URL(calls[1]).searchParams.get('fields');
  for(const field of ['categories_tags','nutriments','selected_images','image_front_url'])assert.ok(fields.split(',').includes(field));
});
test('confirmed direct 404 is not confused with a network failure',async()=>{
  const {get,calls}=client([reply('Not Found',404,'text/html'),reply({status:0,status_verbose:'product not found'},404)]);
  assert.equal((await get({barcode:'2998765432106'})).status,0);assert.equal(calls.length,2);
});
test('HTML route 404 and malformed JSON do not claim a missing product',async()=>{
  const {get}=client([reply('missing route',404,'text/html'),reply({oops:true}),new Error('offline')]);
  await assert.rejects(get({barcode:'3017620422003'}),e=>e.kind==='service');
});
test('rate limiting stops retries immediately',async()=>{
  const {get,calls}=client([reply({error:'slow down'},429)]);
  await assert.rejects(get({barcode:'3017620422003'}),e=>e.kind==='rate-limit');assert.equal(calls.length,1);
});
test('invalid input never contacts the service',async()=>{
  const {get,calls}=client([]);await assert.rejects(get({barcode:'123'}),e=>e.kind==='invalid');assert.equal(calls.length,0);
});
test('name search accepts an empty result list',async()=>{
  const {get}=client([reply({products:[]})]);assert.equal((await get({query:'missing brand'})).products.length,0);
});
async function api(responses,request={method:'GET',query:{barcode:'2998765432106'}}){
  const original=globalThis.fetch;let calls=0;let body,status;const headers={};
  globalThis.fetch=async()=>{calls++;const response=responses.shift();if(response instanceof Error)throw response;assert.ok(response);return response;};
  const res={setHeader:(k,v)=>{headers[k]=v;},status:s=>{status=s;return res;},json:b=>{body=b;return res;}};
  try{await handler(request,res);}finally{globalThis.fetch=original;}
  return {status,body,calls,headers};
}
test('proxy preserves an authoritative OFF 404 without a second request',async()=>{
  const result=await api([reply({status:0},404)]);assert.equal(result.status,200);assert.equal(result.body.status,0);assert.equal(result.calls,1);
});
test('proxy rejects malformed success data and tries regional fallback',async()=>{
  const result=await api([reply({oops:true}),reply({status:1,product:{code:'12345678'}})]);assert.equal(result.status,200);assert.equal(result.body.product.code,'12345678');
});
test('proxy never converts a non-JSON 404 plus timeout into product absence',async()=>{
  const result=await api([reply('missing',404,'text/html'),Object.assign(new Error('timeout'),{name:'TimeoutError'})]);assert.equal(result.status,504);
});
test('proxy validates method and input before contacting OFF',async()=>{
  assert.equal((await api([],{method:'POST',query:{}})).status,405);
  assert.equal((await api([],{method:'GET',query:{barcode:'123'}})).status,400);
});
