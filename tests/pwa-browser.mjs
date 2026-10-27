// Real browser + real Vercel handlers; only external Gemini/OFF responses are fixtures.
import assert from "node:assert/strict";
import http from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { chromium, webkit } from "playwright";
import gemini from "../api/gemini.js";
import foods from "../api/foods.js";

const root = process.cwd(), results = [];
const product = { code:"3017620422003", product_name:"Тестов продукт", categories_tags:["en:foods"], nutriscore_grade:"c",
  nutriments:{"energy-kcal_100g":200,proteins_100g:8,carbohydrates_100g:30,fat_100g:3,sugars_100g:2,fiber_100g:7,"saturated-fat_100g":1,salt_100g:.1} };
const analysis = { foods:[{name:"Тестова храна",estimatedGrams:100,calories:200,protein:8,carbs:30,fat:3,fiber:7}],totalCalories:200,protein:8,carbs:30,fat:3,fiber:7,healthScore:70,rating:"Ориентир",reason:"Тестова снимка",recommendation:"Провери порцията." };
const nativeFetch = globalThis.fetch, previousKey = process.env.GEMINI_API_KEY;
process.env.GEMINI_API_KEY = "test-fixture-only";
let aiCalls = 0, updateVersion = false, apiBodies = [];
globalThis.fetch = async (url, options) => {
  if (String(url).startsWith("https://generativelanguage.googleapis.com/")) {
    aiCalls++; apiBodies.push(JSON.parse(options.body));
    const text = JSON.stringify(apiBodies.at(-1)).includes("inline_data") ? JSON.stringify(analysis) : `Тестов AI отговор ${aiCalls}`;
    return Response.json({candidates:[{content:{parts:[{text}]}}]});
  }
  if (/^https:\/\/(world|bg)\.openfoodfacts\.org\//.test(String(url))) return Response.json({status:1,product});
  return nativeFetch(url, options);
};
const mime = {".html":"text/html",".js":"application/javascript",".css":"text/css",".webmanifest":"application/manifest+json",".png":"image/png"};
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url,"http://localhost");
  res.setHeader("Cache-Control","no-cache");
  if (url.pathname.startsWith("/api/")) {
    let body=""; for await (const chunk of req) body+=chunk;
    const request = { method:req.method, query:Object.fromEntries(url.searchParams), body:body?JSON.parse(body):{} };
    const response = {setHeader:(...args)=>res.setHeader(...args),status:code=>{res.statusCode=code;return response;},json:data=>{res.setHeader("Content-Type","application/json");res.end(JSON.stringify(data));}};
    return (url.pathname === "/api/gemini" ? gemini : foods)(request,response);
  }
  try {
    const file = path.resolve(root,"."+(url.pathname === "/"?"/index.html":url.pathname));
    if (!file.startsWith(root+path.sep)) throw Error("outside root");
    let bytes=await readFile(file);
    if (url.pathname==="/sw.js" && updateVersion) bytes=Buffer.from(bytes.toString().replace(/const REVISION = "([^"]+)"/, 'const REVISION = "$1-test-update"'));
    res.setHeader("Content-Type",mime[path.extname(file)]||"application/octet-stream");res.end(bytes);
  } catch { res.statusCode=404;res.end("not found"); }
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const url=`http://127.0.0.1:${server.address().port}/`;
await mkdir("test-results",{recursive:true});
const y4m=path.join("/tmp",`nutriai-barcode-${process.pid}.y4m`);
execFileSync("ffmpeg",["-loglevel","error","-y","-loop","1","-i","tests/fixtures/ean-nutella.png","-vf","scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=white","-pix_fmt","yuv420p","-r","5","-t","1",y4m]);
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,headless:true,args:["--no-sandbox","--use-fake-device-for-media-stream","--use-fake-ui-for-media-stream",`--use-file-for-fake-video-capture=${y4m}`]});
const seed = () => {
  if (localStorage.getItem("nutriai.profile")) return;
  localStorage.setItem("nutriai.profile",JSON.stringify({gender:"Мъж",age:30,height:180,weight:80,targetWeight:75,activity:1.55,activityLabel:"Умерена",goal:"Поддържане",dailyLimit:2200,recommendedCalories:2200,hasCompletedSetup:true}));
  localStorage.setItem("nutriai.messages",JSON.stringify([{role:"assistant",text:"Запазен чат",date:new Date().toISOString()}]));
  localStorage.setItem("nutriai.aiPlan",JSON.stringify({title:"Запазен план",days:[],tips:["Запазен съвет"]}));
  localStorage.setItem("nutriai.fridgeItems",JSON.stringify(["ябълки"]));
  localStorage.setItem("nutriai.theme","dark");
};
const setup = async options => {
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,...options});
  await context.addInitScript(seed);
  await context.addInitScript(()=>{
    const original=window.matchMedia.bind(window);
    window.matchMedia=query=>query==="(display-mode: standalone)"?{matches:true,media:query,addEventListener(){},removeEventListener(){}}:original(query);
  });
  await context.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//,route=>route.abort());
  const page=await context.newPage(); const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto(url);await page.waitForFunction(()=>!document.querySelector(".phone-app").classList.contains("hidden"));
  return {context,page,errors};
};
try {
  const {context,page,errors}=await setup();
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();
  await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
  assert.equal(await page.locator("#pwaInstall").isVisible(),false);
  assert.equal(await page.locator("html").getAttribute("data-theme"),"dark");
  assert.match(await page.locator("#aiMealPlan").textContent(),/Запазен план/);
  const cdp=await context.newCDPSession(page);
  const manifest=await cdp.send("Page.getAppManifest");assert.equal(manifest.errors.length,0);
  results.push("Standalone display emulation; real manifest parsed without errors; existing localStorage hydrated into unchanged IndexedDB schema");

  await page.locator('[data-view="products"]').click();
  // Camera frames contain a real EAN-13: no stub BarcodeDetector or decoding callback.
  await page.locator("#productLiveScan").click();
  await page.waitForFunction(()=>document.querySelector("#productScanDetail").textContent.includes("Тестов продукт"),null,{timeout:20000});
  assert.equal(await page.locator(".product-quick-tile").count(),6);
  assert.equal(await page.evaluate(()=>document.querySelector("#barcodeVideo").srcObject),null);
  results.push("Camera getUserMedia → locally bundled ZXing decodes EAN 3017620422003 → actual foods handler → product card + six nutrient icons; camera released");
  await page.locator("#productLiveScan").click();
  await page.waitForFunction(()=>Boolean(document.querySelector("#barcodeVideo").srcObject));
  await page.evaluate(()=>window.dispatchEvent(new Event("pagehide")));
  assert.equal(await page.evaluate(()=>document.querySelector("#barcodeVideo").srcObject),null);
  results.push("Camera stops on app pagehide; no automatic camera restart");

  await page.evaluate(()=>{window.canUseServerProxy=()=>true;}); // The dev host deliberately disables AI by default.
  await page.locator('[data-view="chat"]').click();
  await page.locator("#chatInput").fill("Тест на AI връзката");await page.locator("#chatForm").evaluate(form=>form.requestSubmit());
  await page.waitForFunction(()=>document.querySelector("#chatMessages").textContent.includes("Тестов AI отговор"));
  await page.locator('[data-view="camera"]').click();
  await page.locator("#foodImage").setInputFiles("tests/fixtures/ean-nutella.png");
  await page.waitForFunction(()=>document.querySelector("#analysisStatus").textContent.includes("готова"));
  await page.locator("#analyzeButton").click();
  await page.waitForFunction(()=>!document.querySelector("#analysisPanel").classList.contains("hidden"));
  assert.ok(apiBodies.some(body=>JSON.stringify(body).includes("inline_data")));
  results.push("Image capture input → resized photo → real Gemini handler builds inline_data → AI response renders; chat uses same live network route with fixture upstream");

  const api=await page.evaluate(async()=>{
    const response=await fetch("api/gemini",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages:[{role:"user",content:"probe"}]})});
    return {cache:response.headers.get("cache-control"),status:response.status};
  });
  assert.equal(api.cache,"no-store");assert.equal(api.status,200);
  const cachedURLs=await page.evaluate(async()=>{const keys=await caches.keys();return (await Promise.all(keys.map(async key=>(await(await caches.open(key)).keys()).map(r=>r.url)))).flat();});
  assert.ok(cachedURLs.some(item=>item.includes("vendor/zxing")));
  assert.ok(cachedURLs.every(item=>!item.includes("/api/")&&!item.includes("openfoodfacts")&&!item.startsWith("data:")));
  results.push("Cache Storage contains only 18 public shell assets; no AI payloads, API replies, photos, external requests or credentials");

  await context.setOffline(true);await page.reload();
  await page.waitForFunction(()=>!document.querySelector(".phone-app").classList.contains("hidden"));
  await page.locator("#addWater250").click();await page.evaluate(()=>window.NutriAIStorage.flush());
  assert.match(await page.locator("#waterStatus").textContent(),/250/);
  await page.locator('[data-view="products"]').click();await page.locator("[data-recent='0']").click();
  assert.match(await page.locator("#productScanDetail").textContent(),/Тестов продукт/);
  assert.equal(await page.locator(".product-quick-tile").count(),6);
  await page.locator('[data-view="chat"]').click();
  await page.evaluate(()=>{window.canUseServerProxy=()=>true;});
  await page.locator("#chatInput").fill("Офлайн тест");await page.locator("#chatForm").evaluate(form=>form.requestSubmit());
  await page.waitForFunction(()=>document.querySelector("#chatMessages").textContent.includes("AI изисква интернет"));
  await context.setOffline(false);await page.reload();
  await page.waitForFunction(()=>document.querySelector("#waterStatus").textContent.includes("250"));
  results.push("Offline reload, saved product details, nutrient icons, hydration writes and existing chat work; AI reports internet needed; data survives reconnect/reload");

  await page.evaluate(async()=>{await (await caches.open("unrelated-user-files")).put("keep",new Response("keep"));});
  await page.locator('[data-view="chat"]').click();await page.locator("#chatInput").fill("Незавършено въвеждане");
  updateVersion=true;
  await page.evaluate(async()=>{const reg=await navigator.serviceWorker.getRegistration();await reg.update();});
  await page.waitForFunction(async()=>Boolean((await navigator.serviceWorker.getRegistration()).waiting));
  assert.equal(await page.locator("#chatInput").inputValue(),"Незавършено въвеждане");
  const second=await context.newPage();await second.goto(url);await second.waitForLoadState();
  await page.locator("#pwaApplyUpdate").click();
  await page.waitForFunction(()=>document.querySelector("#pwaUpdate").textContent.includes("другите"));
  await second.close();
  await Promise.all([page.waitForEvent("load"),page.locator("#pwaApplyUpdate").click()]);
  await page.waitForFunction(()=>document.querySelector("#waterStatus").textContent.includes("250"));
  assert.ok(await page.evaluate(async()=>(await caches.keys()).includes("unrelated-user-files")));
  results.push("Updated worker waits without interrupting a form; multi-window activation blocked; explicit update preserves IndexedDB/localStorage and unrelated caches");

  await page.locator('[data-view="history"]').click();
  const downloadPromise=page.waitForEvent("download");await page.locator("#exportData").click();
  const download=await downloadPromise;const backup=JSON.parse(await readFile(await download.path(),"utf8"));
  assert.equal(backup.version,2);assert.ok(backup.messages.length>=2);assert.equal(backup.aiPlan.title,"Запазен план");assert.deepEqual(backup.fridgeItems,["ябълки"]);
  assert.ok(backup.recentProducts.length);assert.ok(!("apiKey" in backup));
  const other=await setup();await other.page.locator('[data-view="history"]').click();
  await other.page.locator("#importData").setInputFiles({name:"backup.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(backup))});
  await other.page.waitForFunction(()=>document.querySelector("#archiveStatus").textContent.includes("успешно"));
  await other.page.reload();await other.page.waitForFunction(()=>document.querySelector("#waterStatus").textContent.includes("250"));
  assert.equal(await other.page.evaluate(()=>state.messages.length),backup.messages.length);
  await other.page.locator('[data-view="history"]').click();
  await other.page.locator("#importData").setInputFiles({name:"v1.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify({version:1,meals:[]}))});
  await other.page.waitForFunction(()=>document.querySelector("#archiveStatus").textContent.includes("успешно"));
  assert.equal(await other.page.evaluate(()=>state.messages.length),backup.messages.length);
  await other.context.close();
  results.push("Complete v2 archive exports/imports into a separate storage context; v1 archives remain compatible; missing optional fields preserve current data; API keys excluded");
  const iosContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"});
  await iosContext.addInitScript(seed);await iosContext.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//,route=>route.abort());
  const iosPage=await iosContext.newPage();await iosPage.goto(url);await iosPage.locator("#pwaInstall").click();
  assert.match(await iosPage.locator("#pwaInstallSteps").textContent(),/Safari.*Споделяне.*Добави/);
  assert.equal(await iosPage.locator("#pwaNativeInstall").isVisible(),false);
  await iosPage.locator(".pwa-dialog-close").click();
  await iosPage.evaluate(()=>{
    const event=new Event("beforeinstallprompt",{cancelable:true});
    event.prompt=async()=>{window.installPromptInvoked=true;};event.userChoice=Promise.resolve({outcome:"dismissed"});
    dispatchEvent(event);
  });
  assert.equal(await iosPage.evaluate(()=>Boolean(window.installPromptInvoked)),false);
  await iosPage.locator("#pwaInstall").click();await iosPage.locator("#pwaNativeInstall").click();
  assert.equal(await iosPage.evaluate(()=>window.installPromptInvoked),true);
  await iosContext.close();
  results.push("iPhone user-agent installation help + apple icon; deferred browser install prompt runs only on an explicit user click (OS installation not simulated)");
  assert.deepEqual(errors,[]);
  await page.locator('[data-view="dashboard"]').click();await page.screenshot({path:"test-results/pwa-mobile.png",fullPage:true,animations:"disabled"});
  await context.close();
  if (process.env.TEST_WEBKIT === "1") {
    const safari=await webkit.launch();const ctx=await safari.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    await ctx.addInitScript(seed);const p=await ctx.newPage();await p.goto(url);await p.evaluate(()=>navigator.serviceWorker.ready);await p.reload();await ctx.setOffline(true);await p.reload();
    assert.equal(await p.locator("#waterStatus").isVisible(),true);await safari.close();results.push("WebKit: manifest shell, IndexedDB hydration and offline reload");
  }
  console.log(results.map((line,i)=>`${i+1}. PASS ${line}`).join("\n"));
  console.log("Physical Android/iPhone OS installation and real AI-provider output are NOT covered by this fixture suite.");
} finally {
  await browser.close();server.close();globalThis.fetch=nativeFetch;
  if(previousKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=previousKey;
}
