/* NutriAI Product Lab — independent product exploration; no existing diary state is replaced. */
(() => {
  "use strict";
  const el = id => document.getElementById(id);
  const storeKey = "nutriai.productScanRecent.v1";
  const safe = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const num = value => value === undefined || value === null || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null;
  const numberLabel = (n, unit="г") => n === null ? "Няма данни" : (Math.round(n*10)/10).toLocaleString("bg-BG") + " " + unit;
  const recent = (() => { try { const items=JSON.parse(localStorage.getItem(storeKey)||"[]"); return Array.isArray(items)?items.slice(0,12):[]; } catch {return [];} })();
  let found=[], active=null, lastRequest=0, processing=false;
  const fields = "code,product_name,product_name_bg,generic_name,brands,image_front_url,image_front_small_url,nutriments,serving_quantity,nutriscore_grade,nova_group,ingredients_text,ingredients_text_bg,allergens_tags,additives_tags,ingredients_analysis_tags,categories_tags,quantity";
  const status = message => { el("productScanStatus").textContent=message; };
  const img = url => /^https:\/\/[a-z0-9.-]+\/.+/i.test(String(url||"")) ? safe(url) : "";
  function product(raw) {
    const n=raw.nutriments||{};
    return {
      code:String(raw.code||"").replace(/\D/g,""), name:String(raw.product_name_bg||raw.product_name||raw.generic_name||"Неизвестен продукт").trim(),
      brand:String(raw.brands||""), image:img(raw.image_front_url||raw.image_front_small_url),
      energy:num(n["energy-kcal_100g"]) ?? (num(n.energy_100g)!==null ? num(n.energy_100g)/4.184 : null),
      sugar:num(n.sugars_100g), salt:num(n.salt_100g), saturated:num(n["saturated-fat_100g"]),
      fat:num(n.fat_100g), protein:num(n.proteins_100g), fiber:num(n.fiber_100g), carbs:num(n.carbohydrates_100g),
      score:/^[abcde]$/i.test(raw.nutriscore_grade||"")?raw.nutriscore_grade.toUpperCase():null,
      nova:[1,2,3,4].includes(Number(raw.nova_group))?Number(raw.nova_group):null,
      ingredients:String(raw.ingredients_text_bg||raw.ingredients_text||""),
      allergens:Array.isArray(raw.allergens_tags)?raw.allergens_tags.map(x=>x.split(":").pop().replaceAll("-"," ")):[],
      additives:Array.isArray(raw.additives_tags)?raw.additives_tags.map(x=>x.split(":").pop().toUpperCase()):[],
      quantity:String(raw.quantity||"")
    };
  }
  function persist(item) {
    if(!item.code)return;
    const idx=recent.findIndex(p=>p.code===item.code);
    if(idx>=0)recent.splice(idx,1);
    recent.unshift(item);recent.length=Math.min(recent.length,12);
    try { localStorage.setItem(storeKey,JSON.stringify(recent)); } catch {}
    renderRecent();
  }
  function photo(p,cls="") {return p.image?'<img class="'+cls+'" src="'+p.image+'" alt="" loading="lazy" referrerpolicy="no-referrer">':'<div class="'+cls+' product-photo-placeholder" aria-hidden="true">◈</div>';}
  function renderRecent() {
    el("productScanRecent").innerHTML=recent.length?recent.map((p,i)=>'<button class="product-recent-item" type="button" data-recent="'+i+'">'+photo(p,"product-recent-photo")+'<span><strong>'+safe(p.name)+'</strong><small>'+safe(p.brand||p.code||"Продукт")+'</small></span><span class="product-recent-arrow">↗</span></button>').join(""):'<p class="product-empty">Разгледаните продукти ще се появяват тук.</p>';
  }
  function interpret(p) {
    const cautions=[];
    if(p.sugar!==null && p.sugar>22.5)cautions.push(["Високо съдържание на захар",numberLabel(p.sugar)+" на 100 г"]);
    if(p.salt!==null && p.salt>1.5)cautions.push(["Високо съдържание на сол",numberLabel(p.salt)+" на 100 г"]);
    if(p.saturated!==null && p.saturated>5)cautions.push(["Високо съдържание на наситени мазнини",numberLabel(p.saturated)+" на 100 г"]);
    if(p.nova===4)cautions.push(["Ултрапреработен продукт","NOVA 4 — характеристика на преработката"]);
    if(p.fiber!==null && p.fiber>=6)cautions.push(["Добър източник на фибри",numberLabel(p.fiber)+" на 100 г"]);
    return cautions;
  }
  function scoreHTML(p) {
    if(!p.score)return '<div class="product-score-missing"><strong>Няма Nutri-Score</strong><span>Оценката не е налична в базата. Не извеждаме измислен рейтинг.</span></div>';
    const palette={A:"#15935d",B:"#75a841",C:"#ddbb38",D:"#e38b32",E:"#d75a4f"};
    return '<div class="product-score-core" style="--product-score-color:'+palette[p.score]+'"><div class="product-score-letter">'+p.score+'</div><div><small>ХРАНИТЕЛНА ОЦЕНКА</small><strong>Nutri-Score '+p.score+'</strong><span>Сравнителен показател за хранителен състав, не тест за безопасност</span></div></div>';
  }
  function metric(icon,title,value,klass="") {return '<div class="product-nutrient '+klass+'"><span>'+icon+' '+safe(title)+'</span><strong>'+numberLabel(value)+'</strong></div>';}
  function renderDetail(p) {
    active=p;
    const warnings=interpret(p);
    const pills=warnings.map(([name,detail])=>'<div class="product-notice"><span class="product-notice-dot" aria-hidden="true"></span><div><strong>'+safe(name)+'</strong><small>'+safe(detail)+'</small></div></div>').join("");
    el("productScanDetail").innerHTML=
      '<div class="product-detail-top"><span class="product-section-kicker">ПРОДУКТОВ ПАСПОРТ</span><button id="productDetailClose" class="product-detail-close" type="button" aria-label="Затвори">×</button></div>'+
      '<div class="product-identity">'+photo(p,"product-identity-image")+'<div><p>'+safe(p.brand||"Продукт")+'</p><h2>'+safe(p.name)+'</h2><small>'+safe(p.quantity||"")+" · "+safe(p.code||"Няма баркод")+'</small></div></div>'+
      '<div class="product-rating-panel">'+scoreHTML(p)+'<div class="product-nova">Степен на преработка: <strong>'+(p.nova ? "NOVA "+p.nova : "няма данни")+'</strong></div></div>'+
      '<div class="product-panel"><div class="product-panel-head"><h3>Хранителни стойности</h3><span>за 100 г / мл според етикета</span></div>'+
      '<div class="product-calorie-bar"><span>⚡ Енергия</span><strong>'+(p.energy===null?"Няма данни":Math.round(p.energy)+" kcal")+'</strong></div>'+
      '<div class="product-nutrition-grid">'+metric("◉","Протеини",p.protein)+metric("◔","Въглехидрати",p.carbs)+metric("◕","Мазнини",p.fat)+metric("◇","Фибри",p.fiber)+metric("◈","Захари",p.sugar)+metric("▤","Сол",p.salt)+metric("○","Наситени мазнини",p.saturated)+'</div></div>'+
      '<div class="product-panel"><div class="product-panel-head"><h3>Какво да знаеш</h3><span>По данните на продукта</span></div>'+(pills||'<p class="product-empty">Няма автоматично откроени показатели. Това не означава, че продуктът е безрисков.</p>')+'</div>'+
      '<div class="product-panel"><div class="product-panel-head"><h3>Състав и алергени</h3></div><p class="product-ingredient-copy">'+safe(p.ingredients||"В базата няма въведен състав за този продукт.")+'</p>'+
      '<div class="product-ingredient-meta"><strong>Алергени:</strong> '+safe(p.allergens.length?p.allergens.join(", "):"Няма данни — провери етикета")+'</div>'+
      '<div class="product-ingredient-meta"><strong>Добавки:</strong> '+safe(p.additives.length?p.additives.join(", "):"Няма посочени")+'</div></div>'+
      '<button id="productAddToDiary" class="product-add-diary" type="button" '+(p.energy===null?"disabled":"")+'>＋ Добави 100 г към дневника</button>'+
      '<p class="product-detail-footnote">Nutri-Score оценява хранителния състав. NOVA описва степента на преработка. Количествата, дневният прием и индивидуалните нужди също имат значение.</p>';
    el("productScanDetail").classList.remove("hidden");
  }
  async function getData(params) {
    const response=await fetch("/api/foods?"+new URLSearchParams(params),{headers:{Accept:"application/json"}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(data.error||"Базата не отговори.");
    return data;
  }
  async function lookup(code) {
    code=String(code||"").replace(/\D/g,"");
    if(code.length<8 || code.length>14){status("Въведи валиден баркод от 8 до 14 цифри.");return;}
    const id=++lastRequest;
    status("Търся продукта по баркод...");el("productScanMatches").innerHTML="";
    try {
      const data=await getData({barcode:code});
      if(id!==lastRequest)return;
      if(!data.product || data.status===0)throw Error("Този баркод още не е намерен в базата.");
      show(data.product);
      status("Продуктът е намерен. Прегледай данните от етикета.");
    } catch(e){if(id===lastRequest)status(e.message||"Неуспешно търсене.");}
  }
  async function search(query) {
    query=String(query||"").trim();
    if(query.length<2){status("Въведи поне 2 символа.");return;}
    const id=++lastRequest;
    status("Търся продукти...");el("productScanMatches").innerHTML="";
    try {
      const data=await getData({query});
      if(id!==lastRequest)return;
      found=(data.products||[]).filter(p=>p.product_name||p.product_name_bg||p.generic_name).map(product);
      status(found.length?found.length+" намерени продукта. Избери продукт за подробности.":"Няма намерени продукти. Опитай с друго име или марка.");
      el("productScanMatches").innerHTML=found.map((p,i)=>'<button class="product-result" type="button" data-product-index="'+i+'">'+photo(p,"product-result-photo")+'<span><strong>'+safe(p.name)+'</strong><small>'+safe(p.brand||"Без марка")+' · '+(p.energy===null?"Няма данни":Math.round(p.energy)+" kcal / 100 г")+'</small></span><span class="product-result-arrow">↗</span></button>').join("");
    }catch(e){if(id===lastRequest)status(e.message||"Неуспешно търсене.");}
  }
  function show(raw) {const p=raw && "energy" in raw?raw:product(raw);renderDetail(p);persist(p);el("productScanDetail").scrollIntoView({behavior:"smooth",block:"start"});}
  async function detectPhoto(file) {
    if(!file)return;
    if(processing)return;
    processing=true;
    const btn=el("productPhoto");btn.disabled=true;
    status("Разпознавам опаковката...");
    try {
      if(!file.type.startsWith("image/"))throw Error("Избери снимка на продукта.");
      if(typeof fileToDataUrl!=="function"||typeof callGroq!=="function")throw Error("AI услугата не е достъпна.");
      const encoded=await fileToDataUrl(file);
      const response=await callGroq([{role:"system",content:"Разпознай етикета на пакетиран хранителен продукт. Извлечи само ясно видими име, марка и EAN баркод. Не измисляй липсващи данни. Върни валиден JSON."},{role:"user",content:[{type:"text",text:'Върни само JSON: {"name":"","brand":"","barcode":""}. Ако не можеш да различиш данните, остави празни низове.'},{type:"image_url",image_url:{url:encoded}}]}],true);
      const parsed=parseGroqJsonLoose(response);
      const code=String(parsed.barcode||"").replace(/\D/g,"");
      const name=String(parsed.name||"").trim();
      if(code.length>=8){el("productBarcodeInput").value=code;await lookup(code);}
      else if(name.length>=2){el("productSearchInput").value=name;await search(name);status("AI разпозна: "+name+". Избери правилния продукт от резултатите.");}
      else status("Не успях да разпозная етикета. Опитай баркод или търсене по име.");
    }catch(e){status(e.message||"Неуспешен AI анализ.");}
    finally{processing=false;btn.disabled=false;btn.value="";}
  }
  async function diary() {
    if(!active||active.energy===null||typeof state==="undefined"||typeof save!=="function"){status("Липсват данни за запис.");return;}
    const p=active, meal={
      id:crypto.randomUUID(),date:new Date().toISOString(),title:p.name,mealType:typeof mealTypeForTime==="function"?mealTypeForTime():"snack",
      image:"",quantityGrams:100,analysis:{foods:[{name:p.name,estimatedGrams:100,calories:Math.round(p.energy),protein:p.protein||0,carbs:p.carbs||0,fat:p.fat||0,fiber:p.fiber||0}],totalCalories:Math.round(p.energy),protein:p.protein||0,carbs:p.carbs||0,fat:p.fat||0,fiber:p.fiber||0,rating:"Данни от етикет / Open Food Facts",reason:"Порция 100 г от базата."}
    };
    state.meals.unshift(meal);
    try{await save("nutriai.meals",state.meals);if(typeof renderAll==="function")renderAll();status("Добавени са 100 г от "+p.name+" към дневника.");el("productAddToDiary").textContent="✓ Добавено към дневника";}
    catch(e){state.meals=state.meals.filter(item=>item.id!==meal.id);status("Записът беше неуспешен.");}
  }
  document.addEventListener("DOMContentLoaded",()=>{
    if(!el("view-products"))return;
    el("productSearchForm").addEventListener("submit",e=>{e.preventDefault();search(el("productSearchInput").value);});
    el("productBarcodeGo").addEventListener("click",()=>lookup(el("productBarcodeInput").value));
    el("productBarcodeInput").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();lookup(e.currentTarget.value);}});
    el("productLiveScan").addEventListener("click",()=>{const tab=document.querySelector('.tab[data-view="camera"]');tab?.click();setTimeout(()=>el("startBarcodeScanner")?.click(),100);status("Сканирай баркода. След това се върни към „Скенер“, за да видиш подробностите.");});
    el("productPhoto").addEventListener("change",e=>detectPhoto(e.currentTarget.files?.[0]));
    el("productScanMatches").addEventListener("click",e=>{const b=e.target.closest("[data-product-index]");if(b&&found[Number(b.dataset.productIndex)])show(found[Number(b.dataset.productIndex)]);});
    el("productScanRecent").addEventListener("click",e=>{const b=e.target.closest("[data-recent]");if(b&&recent[Number(b.dataset.recent)])show(recent[Number(b.dataset.recent)]);});
    el("productScanDetail").addEventListener("click",e=>{if(e.target.closest("#productDetailClose"))el("productScanDetail").classList.add("hidden");if(e.target.closest("#productAddToDiary"))diary();});
    renderRecent();
  });
  /* The legacy live reader owns its camera. Intercept successful lookups so the
     dedicated product tab opens the enriched product rather than manual-entry only. */
  const originalFetch=window.fetch.bind(window);
  window.fetch=async (...args)=>{
    const response=await originalFetch(...args);
    const url=String(args[0]||"");
    if(url.startsWith("/api/foods?barcode=")&&response.ok&&el("view-products")){
      response.clone().json().then(data=>{
        if(!data.product||!data.product.code)return;
        const p=product(data.product);
        renderDetail(p);persist(p);
        if(document.querySelector('.tab[data-view="camera"].active')){
          setTimeout(()=>{
            document.querySelector('.tab[data-view="products"]')?.click();
            el("productScanDetail").scrollIntoView({behavior:"smooth",block:"start"});
            status("Баркодът е разпознат. Показвам подробностите за продукта.");
          },200);
        }
      }).catch(()=>{});
    }
    return response;
  };
})();
