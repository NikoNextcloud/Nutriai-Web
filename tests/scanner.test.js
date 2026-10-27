import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
const source=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const html=source('index.html');
const base={code:'3017620422003',product_name:'Test product',nutriments:{'energy-kcal_100g':200,proteins_100g:8,carbohydrates_100g:30,fat_100g:3,sugars_100g:2,fiber_100g:7,'saturated-fat_100g':1,salt_100g:.1}};
const photo='https://images.openfoodfacts.org/images/products/301/762/042/2003/front_en.879.400.jpg';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function setup(data={status:1,product:base},recent=[]){
  const dom=new JSDOM(html,{url:'https://nutri.test',runScripts:'outside-only'});const w=dom.window;
  w.HTMLElement.prototype.scrollIntoView=()=>{};
  w.localStorage.setItem('nutriai.productScanRecent.v1',JSON.stringify(recent));
  w.NutriAIFoodDatabase={get:async()=>structuredClone(data)};
  for(const file of ['barcode-engine.js','nutrition-insights.js','scanner.js','scanner-personal.js'])w.eval(source(file));
  // Wait for jsdom's real DOMContentLoaded rather than dispatching it twice.
  if(w.document.readyState==='loading')await new Promise(resolve=>w.document.addEventListener('DOMContentLoaded',resolve,{once:true}));
  await flush();
  const $=id=>w.document.getElementById(id);
  const lookup=async code=>{$('productBarcodeInput').value=code;$('productBarcodeGo').click();await flush();};
  const event=(name,detail)=>w.dispatchEvent(new w.CustomEvent(name,{detail}));
  return {dom,w,$,lookup,event};
}
test('solid pasta under foods-and-beverages uses food units and thresholds',async t=>{
  const p={...base,categories_tags:['en:plant-based-foods-and-beverages','en:plant-based-foods','en:pastas'],nutriments:{...base.nutriments,sugars_100g:13.46}};
  const {dom,$,lookup}=await setup({status:1,product:p});t.after(()=>dom.window.close());await lookup(p.code);
  assert.match($('productScanDetail').textContent,/Количество за 100 г/);
  assert.doesNotMatch($('productScanDetail').textContent,/Високо съдържание на захари/);
});
test('a drink uses ml and the lower sugar threshold',async t=>{
  const p={...base,categories_tags:['en:plant-based-foods-and-beverages','en:beverages'],nutriments:{...base.nutriments,sugars_100g:13.46}};
  const {dom,$,lookup}=await setup({status:1,product:p});t.after(()=>dom.window.close());await lookup(p.code);
  assert.match($('productScanDetail').textContent,/Количество за 100 мл/);assert.match($('productScanDetail').textContent,/Високо съдържание на захари/);
});
test('broad ancestor alone cannot produce a label-based score',async t=>{
  const {dom,$,lookup}=await setup({status:1,product:{...base,categories_tags:['en:plant-based-foods-and-beverages']}});t.after(()=>dom.window.close());await lookup(base.code);
  assert.match($('productScanDetail').textContent,/Няма достатъчно данни/);
});
test('six icons, real zero, unknown values and disabled diary for missing kcal',async t=>{
  const {dom,$,lookup}=await setup({status:1,product:{...base,nutriments:{sugars_100g:0,proteins_100g:-1,fiber_100g:' '}}});t.after(()=>dom.window.close());await lookup(base.code);
  const tiles=$('productScanDetail').querySelectorAll('.product-quick-tile');assert.equal(tiles.length,6);
  assert.match(tiles[4].textContent,/0/);assert.match(tiles[1].textContent,/—/);assert.match(tiles[5].textContent,/—/);
  assert.ok($('productAddToDiary').disabled);assert.match($('productScanDetail').textContent,/Няма достатъчно данни/);
});
for(const [grade,score,tone] of [['a','9.5','excellent'],['b','8.0','excellent'],['c','6.5','balanced'],['d','4.0','caution'],['e','2.5','limit']])test('Nutri-Score '+grade+' renders the disclosed color and score',async t=>{
  const {dom,$,lookup}=await setup({status:1,product:{...base,nutriscore_grade:grade,categories_tags:['en:foods']}});t.after(()=>dom.window.close());await lookup(base.code);
  assert.ok($('productScanDetail').querySelector('.health-'+tone));assert.equal($('productScanDetail').querySelector('.product-health-ring-core strong').textContent,score);
  assert.match($('productScanDetail').textContent,/НЕ е официална 10-точкова оценка/);
});
test('scan service failure stays distinct from a confirmed missing product',async t=>{
  const {dom,$,event}=await setup();t.after(()=>dom.window.close());
  $('productLiveScan').click();event('nutriai:barcode-error',{barcode:base.code,kind:'service',message:'Връзката се забави.'});
  assert.match($('productScanStatus').textContent,/Не е потвърдено/);assert.doesNotMatch($('productScanStatus').textContent,/продуктът липсва/);
  $('productLiveScan').click();event('nutriai:barcode-error',{barcode:base.code,kind:'not-found'});
  assert.match($('productScanStatus').textContent,/продуктът липсва/);
});
test('a new scan hides previous product details before the response',async t=>{
  const {dom,$,lookup,event}=await setup();t.after(()=>dom.window.close());await lookup(base.code);
  assert.ok(!$('productScanDetail').classList.contains('hidden'));$('productLiveScan').click();event('nutriai:barcode-found',{barcode:'2998765432106'});
  assert.ok($('productScanDetail').classList.contains('hidden'));
});
test('found product clears stale missing-product editor prefill',async t=>{
  const {dom,w,$,lookup}=await setup();t.after(()=>dom.window.close());w.NutriAICustomProducts.showNoMatch({code:'2998765432106',query:'Old missing product'});
  await lookup(base.code);assert.equal($('productNotFound').dataset.code,undefined);assert.equal($('productNotFound').dataset.query,undefined);
});
test('unsafe image candidate falls back to a valid OFF image, broken images show a placeholder',async t=>{
  const {dom,w,$,lookup}=await setup({status:1,product:{...base,image_front_url:'javascript:alert(1)',image_front_small_url:photo}});t.after(()=>dom.window.close());await lookup(base.code);
  const image=$('productScanDetail').querySelector('.product-identity-image');assert.equal(image.src,photo);
  image.dispatchEvent(new w.Event('error'));assert.match($('productScanDetail').querySelector('.product-quick-photo').textContent,/Няма снимка/);
  const recent=$('productScanRecent').querySelector('img');recent.dispatchEvent(new w.Event('error'));assert.equal($('productScanRecent').querySelectorAll('img').length,0);
});
test('captured barcode remains visible and labeled when catalog image fails',async t=>{
  const {dom,w,$,event}=await setup();t.after(()=>dom.window.close());const captured='data:image/jpeg;base64,YWJj';$('productLiveScan').click();
  event('nutriai:barcode-found',{barcode:base.code,capturedImage:captured});event('nutriai:barcode-product',{product:{...base,image_front_url:photo},capturedImage:captured});
  const image=$('productScanDetail').querySelector('.product-identity-image');image.dispatchEvent(new w.Event('error'));assert.equal(image.src,captured);assert.match($('productScanDetail').querySelector('.product-quick-photo small').textContent,/Кадър/);
});
test('old cached classification is neutralized without deleting recent products',async t=>{
  const recent={code:base.code,name:'Saved pasta',energy:200,isDrink:true,sugar:13.46,fat:3,saturated:1,salt:.1,allergens:[],additives:[]};
  const {dom,$}=await setup(undefined,[recent]);t.after(()=>dom.window.close());$('productScanRecent').querySelector('button').click();
  assert.match($('productScanDetail').textContent,/Saved pasta/);assert.match($('productScanDetail').textContent,/Няма достатъчно данни/);
  assert.doesNotMatch($('productScanDetail').textContent,/Количество за 100 мл/);
});
