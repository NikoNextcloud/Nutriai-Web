import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const lookup=source.slice(source.indexOf('async function lookupBarcodeProduct('),source.indexOf('async function searchWorldFoods('));
function flow(get){
  const events=[],elements=new Map();
  const $=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',checked:false});return elements.get(id);};
  const window={NutriAIBarcodeEngine:{normalize:v=>String(v),variants:v=>v.length===12?[v,'0'+v]:[v]},dispatchEvent:event=>events.push(event)};
  const context={window,$,fetchFoodDatabase:get,updateManualNutritionPreview:()=>{},CustomEvent:class{constructor(type,{detail}){this.type=type;this.detail=detail;}}};
  vm.createContext(context);vm.runInContext(lookup,context);
  return {run:context.lookupBarcodeProduct,events,$};
}
test('actual scan lookup emits service failure without calling it missing',async()=>{
  const {run,events}=flow(async()=>{throw Object.assign(new Error('offline'),{kind:'service'});});
  assert.equal(await run('3017620422003'),false);assert.equal(events[0].detail.kind,'service');
});
test('actual scan lookup marks confirmed absence explicitly',async()=>{
  const {run,events}=flow(async()=>({status:0,product:null}));await run('2998765432106');assert.equal(events[0].detail.kind,'not-found');
});
test('UPC-A lookup retries equivalent leading-zero EAN and keeps categories',async()=>{
  const calls=[];const {run,events}=flow(async({barcode})=>{calls.push(barcode);return calls.length===1?{status:0}:{status:1,product:{code:barcode,product_name:'Pasta',categories_tags:['en:pastas'],nutriments:{}}};});
  assert.equal(await run('737628064502'),true);assert.deepEqual(calls,['737628064502','0737628064502']);assert.deepEqual(events[0].detail.product.categories_tags,['en:pastas']);
});
