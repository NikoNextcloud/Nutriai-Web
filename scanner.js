/* NutriAI Product Lab — independent product exploration; no existing diary state is replaced. */
(() => {
  "use strict";
  const el = id => document.getElementById(id);
  const personal = () => window.NutriAICustomProducts;
  const validOwnPhoto = data => typeof data === "string" && data.length < 220000 && /^data:image\/jpeg;base64,[a-zA-Z0-9+/=]+$/.test(data);
  const storeKey = "nutriai.productScanRecent.v1";
  const safe = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const num = value => value === undefined || value === null || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null;
  const numberLabel = (n, unit="г") => n === null ? "Няма данни" : (Math.round(n*10)/10).toLocaleString("bg-BG") + " " + unit;
  const recent = (() => { try { const items=JSON.parse(localStorage.getItem(storeKey)||"[]"); return Array.isArray(items)?items.slice(0,12):[]; } catch {return [];} })();
  let found=[], active=null, lastRequest=0, processing=false;
  let capturePhoto = "", captureLabel = "", pendingBarcodeFromScanner = false;
  const fields = "code,product_name,product_name_bg,generic_name,brands,image_url,image_small_url,image_front_url,image_front_small_url,selected_images,nutriments,serving_quantity,nutriscore_grade,nova_group,ingredients_text,ingredients_text_bg,allergens_tags,additives_tags,ingredients_analysis_tags,categories_tags,quantity";
  const status = (message, type="") => { const target=el("productScanStatus"); if(target){target.textContent=message;target.dataset.statusType=type;} };
  const validCapture = data => /^data:image\/(?:jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/.test(data||"") && data.length < 2_500_000;
  function setCapture(data, label) {
    if(!validCapture(data))return;
    capturePhoto=data;captureLabel=label||"Снимка от камерата";
    const preview=el("productScanPhoto");
    el("productScanPhotoImage").src=data;
    el("productScanPhotoTitle").textContent="Снимка на продукта";
    el("productScanPhotoCaption").textContent=captureLabel;
    preview.classList.remove("hidden");
  }
  function clearCapture() {
    capturePhoto="";captureLabel="";
    const preview=el("productScanPhoto");
    if(preview)preview.classList.add("hidden");
    const image=el("productScanPhotoImage");if(image)image.removeAttribute("src");
  }
  const img = value => {
    try {
      const url = new URL(String(value || ""));
      return url.protocol === "https:" && (url.hostname === "openfoodfacts.org" || url.hostname.endsWith(".openfoodfacts.org"))
        && !url.username && !url.password ? url.href : "";
    } catch { return ""; }
  };
  async function timedFetch(url, options, ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try { return await fetch(url, { ...options, signal: controller.signal }); }
    finally { clearTimeout(timer); }
  }
  function product(raw) {
    const n=raw.nutriments||{};
    return {
      code:String(raw.code||"").replace(/\D/g,""), name:String(raw.product_name_bg||raw.product_name||raw.generic_name||"Неизвестен продукт").trim(),
      brand:String(raw.brands||""), image:img(
        raw.image_front_url || raw.image_front_small_url || raw.image_url || raw.image_small_url ||
        raw.selected_images?.front?.display?.bg || raw.selected_images?.front?.display?.en ||
        raw.selected_images?.front?.small?.bg || raw.selected_images?.front?.small?.en || ""
      ),
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
    const identity=item.code || (item.source==="personal"?item.id:"");
    if(!identity)return;
    const idx=recent.findIndex(p=>(p.code||(p.source==="personal"?p.id:""))===identity);
    if(idx>=0)recent.splice(idx,1);
    recent.unshift(item);recent.length=Math.min(recent.length,12);
    try { localStorage.setItem(storeKey,JSON.stringify(recent)); } catch {}
    renderRecent();
  }
  function photo(p,cls="") {
    const url=img(p.image) || (p.source==="personal"&&validOwnPhoto(p.imageData)?p.imageData:"");
    return url ? '<img class="'+safe(cls)+'" src="'+safe(url)+'" alt="Снимка на продукта" loading="lazy" referrerpolicy="no-referrer">'
      : '<div class="'+safe(cls)+' product-photo-placeholder" aria-label="Няма снимка за продукта">◈</div>';
  }
  function detailPhoto(p) {
    if(p.image || (p.source==="personal"&&validOwnPhoto(p.imageData)))return photo(p,"product-identity-image");
    if(capturePhoto)return '<img class="product-identity-image" src="'+safe(capturePhoto)+'" alt="Снимка от сканирането">';
    return photo(p,"product-identity-image");
  }
  
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
    const personalRecord=p.source==="personal";
    const visualSource=p.source==="personal"?"Ваша снимка / данни от етикета":p.image?"Снимка от Open Food Facts":capturePhoto?captureLabel:"Няма изображение в базата";
    const visual='<div class="product-identity-visual">'+detailPhoto(p)+'<small class="product-identity-visual-caption">'+safe(visualSource)+'</small></div>';
    const otherPhoto=p.image && capturePhoto
      ? '<div class="product-identity-scan-photo"><img src="'+safe(capturePhoto)+'" alt="Вашата снимка от сканирането"><span>'+safe(captureLabel)+'</span></div>'
      : "";
    const pills=warnings.map(([name,detail])=>'<div class="product-notice"><span class="product-notice-dot" aria-hidden="true"></span><div><strong>'+safe(name)+'</strong><small>'+safe(detail)+'</small></div></div>').join("");
    el("productScanDetail").innerHTML=
      '<div class="product-detail-top"><span class="product-section-kicker">ПРОДУКТОВ ПАСПОРТ</span><button id="productDetailClose" class="product-detail-close" type="button" aria-label="Затвори">×</button></div>'+
      '<div class="product-identity">'+visual+'<div class="product-identity-productname"><p>'+safe(p.brand||"Продукт")+'</p><h2>'+safe(p.name)+'</h2><small>'+safe(p.quantity||"")+" · "+safe(p.code||"Няма баркод")+'</small></div></div>'+otherPhoto+
      (personalRecord ? '<div class="product-self-sourced">✦ Личен продукт — стойностите са въведени или потвърдени от етикета. Не са проверени от Open Food Facts.</div>' : '')+
      '<div class="product-rating-panel">'+scoreHTML(p)+'<div class="product-nova">Степен на преработка: <strong>'+(p.nova ? "NOVA "+p.nova : "няма данни")+'</strong></div></div>'+
      '<div class="product-panel"><div class="product-panel-head"><h3>Хранителни стойности</h3><span>за 100 г / мл според етикета</span></div>'+
      '<div class="product-calorie-bar"><span>⚡ Енергия</span><strong>'+(p.energy===null?"Няма данни":Math.round(p.energy)+" kcal")+'</strong></div>'+
      '<div class="product-nutrition-grid">'+metric("◉","Протеини",p.protein)+metric("◔","Въглехидрати",p.carbs)+metric("◕","Мазнини",p.fat)+metric("◇","Фибри",p.fiber)+metric("◈","Захари",p.sugar)+metric("▤","Сол",p.salt)+metric("○","Наситени мазнини",p.saturated)+'</div></div>'+
      '<div class="product-panel"><div class="product-panel-head"><h3>Какво да знаеш</h3><span>По данните на продукта</span></div>'+(pills||'<p class="product-empty">Няма автоматично откроени показатели. Това не означава, че продуктът е безрисков.</p>')+'</div>'+
      '<div class="product-panel"><div class="product-panel-head"><h3>Състав и алергени</h3></div><p class="product-ingredient-copy">'+safe(p.ingredients||"В базата няма въведен състав за този продукт.")+'</p>'+
      '<div class="product-ingredient-meta"><strong>Алергени:</strong> '+safe(p.allergens.length?p.allergens.join(", "):"Няма данни — провери етикета")+'</div>'+
      '<div class="product-ingredient-meta"><strong>Добавки:</strong> '+safe(p.additives.length?p.additives.join(", "):"Няма посочени")+'</div></div>'+
      (personalRecord?'<button type="button" id="productEditSaved">✎ Редактирай моя продукт</button>':'')+
      '<button id="productAddToDiary" class="product-add-diary" type="button" '+(p.energy===null?"disabled":"")+'>＋ Добави 100 г към дневника</button>'+
      '<p class="product-detail-footnote">Nutri-Score оценява хранителния състав. NOVA описва степента на преработка. Количествата, дневният прием и индивидуалните нужди също имат значение.</p>';
    el("productScanDetail").classList.remove("hidden");
  }
  async function getData(params) {
    const barcode=String(params.barcode||"").replace(/\D/g,"");
    const query=String(params.query||"").trim();
    const args=barcode?{barcode}:{query};
    const endpoint="/api/foods?"+new URLSearchParams(args);
    let lastError=new Error("Неуспешна заявка към базата.");
    try {
      const res=await timedFetch(endpoint,{headers:{Accept:"application/json"}},9000);
      const data=await res.json().catch(()=>({}));
      if(res.ok)return data;
      if(res.status===404&&barcode)return {status:0,product:null};
      if(res.status===400)throw Object.assign(new Error(data.error||"Невалиден баркод или име."),{noFallback:true});
      lastError=new Error(data.error||("Грешка от хранителната база: "+res.status));
    } catch(error) {
      if(error.noFallback)throw error;
      lastError=error;
    }
    // In browsers, direct retries use the user's IP instead of the shared Vercel address.
    const path=barcode
      ? "/api/v2/product/"+encodeURIComponent(barcode)+".json?fields="+encodeURIComponent(fields)
      : "/cgi/search.pl?action=process&search_terms="+encodeURIComponent(query)+"&search_simple=1&json=1&page_size=12&fields="+encodeURIComponent(fields);
    for(const host of ["https://world.openfoodfacts.org","https://bg.openfoodfacts.org"]) {
      try {
        const res=await timedFetch(host+path,{headers:{Accept:"application/json"}},6500);
        if(res.status===429)throw Object.assign(new Error("Хранителната база е временно ограничена. Опитай отново след минута."),{rateLimited:true});
        if(!res.ok)continue;
        const data=await res.json();
        if(data&&typeof data==="object")return data;
      } catch(error) {
        if(error.rateLimited)throw error;
      }
    }
    throw ["TimeoutError", "AbortError"].includes(lastError.name)
      ? new Error("Търсенето се забави. Провери връзката и опитай отново.")
      : lastError;
  }
  
  async function lookup(code, preserveCapture=false) {
    code=String(code||"").replace(/\D/g,"");
    if(code.length<8 || code.length>14){status("Въведи валиден EAN/UPC баркод от 8 до 14 цифри.","error");return false;}
    if(!preserveCapture)clearCapture();
    const id=++lastRequest;
    status("Проверявам продукта по EAN...");
    el("productScanMatches").innerHTML="";
    el("productScanDetail").classList.add("hidden");
    const variants=window.NutriAIBarcodeEngine?.variants(code)||[code];
    const own=variants.map(value=>personal()?.findBarcode(value)).find(Boolean);
    if(own){
      if(id!==lastRequest)return false;
      show(own);status("Продуктът е намерен в твоята лична база.","success");
      return true;
    }
    try {
      let data=null;
      for(const variant of variants){
        data=await getData({barcode:variant});
        if(id!==lastRequest)return false;
        if(data?.product && data.status!==0)break;
      }
      if(id!==lastRequest)return false;
      if(!data?.product || data.status===0) {
        personal()?.showNoMatch({code,photo:capturePhoto});
        status("Този EAN липсва в Open Food Facts. Можеш да добавиш продукта от етикет или AI снимка.","error");
        return false;
      }
      show(data.product);
      status("Продуктът е намерен. Виж снимката и хранителните стойности.","success");
      return true;
    } catch(e) {
      if(id!==lastRequest)return false;
      const offline=recent.find(p=>variants.includes(p.code));
      if(offline){
        show(offline);
        status("Базата не отговаря — показвам предишните данни за този продукт.");
        return true;
      }
      personal()?.showNoMatch({code,photo:capturePhoto,error:e.message});
      status((e.message||"Временен проблем с базата.")+" Можеш да добавиш продукта от етикета.","error");
      return false;
    }
  }
  
  async function search(query, preserveCapture=false) {
    query=String(query||"").trim();
    if(query.length<2){status("Въведи поне 2 символа.","error");return false;}
    if(!preserveCapture)clearCapture();
    const id=++lastRequest;
    found=[];
    personal()?.renderMatches(query);
    const ownMatches=personal()?.findQuery(query)||[];
    status("Търся в продуктовата база...");
    el("productScanMatches").innerHTML="";
    el("productScanDetail").classList.add("hidden");
    try {
      const data=await getData({query});
      if(id!==lastRequest)return false;
      found=(data.products||[]).filter(p=>p.product_name||p.product_name_bg||p.generic_name).map(product);
      const hasMatches=found.length+ownMatches.length>0;
      status(hasMatches
        ? (found.length+" продукта от Open Food Facts, "+ownMatches.length+" от твоята база. Избери правилния продукт.")
        : "Не е намерен продукт. Можеш да го добавиш със снимка на етикета или ръчно.",
        hasMatches?"success":"");
      el("productScanMatches").innerHTML=found.map((p,i)=>'<button class="product-result" type="button" data-product-index="'+i+'">'+photo(p,"product-result-photo")+'<span><strong>'+safe(p.name)+'</strong><small>'+safe(p.brand||"Без марка")+' · '+(p.energy===null?"Няма данни":Math.round(p.energy)+" kcal / 100 г")+'</small></span><span class="product-result-arrow">↗</span></button>').join("");
      if(!hasMatches)personal()?.showNoMatch({query,photo:capturePhoto});
      return hasMatches;
    }catch(e){
      if(id!==lastRequest)return false;
      if(ownMatches.length){
        status("Външната база не е достъпна, но има "+ownMatches.length+" продукта в твоята база.","success");
        return true;
      }
      personal()?.showNoMatch({query,photo:capturePhoto,error:e.message});
      status((e.message||"Търсенето не успя.")+" Добави продукт от етикета.","error");
      return false;
    }
  }
  
  function show(raw) {const p=raw && "energy" in raw?raw:product(raw);renderDetail(p);persist(p);el("productScanDetail").scrollIntoView({behavior:"smooth",block:"start"});}
  async function detectPhoto(file) {
    if(!file||processing)return;
    processing=true;
    const btn=el("productPhoto");
    btn.disabled=true;
    status("Подготвям снимката на продукта...");
    try {
      if(!file.type.startsWith("image/"))throw Error("Избери снимка на опаковката.");
      if(typeof fileToDataUrl!=="function"||typeof callGroq!=="function")throw Error("AI услугата не е достъпна.");
      const encoded=await fileToDataUrl(file);
      setCapture(encoded,"Вашата снимка на опаковката");
      status("Снимката е готова. AI чете видимите стойности от етикета...");
      const response=await callGroq([
        {role:"system",content:"Ти разчиташ текст от етикети на пакетирани храни. НЕ предполагай калории, хранителни стойности, съставки, марка, баркод или безопасност по външния вид. Записвай само ясно видимите стойности за 100 g / 100 ml от снимката. Ако са за порция, но няма достатъчно информация за 100g, върни null. Нечетими полета остават null. Върни само JSON на български."},
        {role:"user",content:[
          {type:"text",text:'Прочети хранителния етикет, само видимите данни, във формат JSON: {"name":"","brand":"","barcode":"","ingredients":"","per100":{"energyKcal":null,"protein":null,"carbs":null,"fat":null,"sugars":null,"fiber":null,"saturated":null,"salt":null}}. Липсващите данни остави null. Не измисляй.'},
          {type:"image_url",image_url:{url:encoded}}
        ]}
      ],true);
      const parsed=parseGroqJsonLoose(response);
      const code=String(parsed.barcode||"").replace(/\D/g,"");
      const name=String(parsed.name||"").trim();
      if(code.length>=8&&code.length<=14){
        el("productBarcodeInput").value=code;
        const matched=await lookup(code,true);
        if(!matched)personal()?.showNoMatch({code,query:name,ai:parsed,photo:encoded});
      }else if(name.length>=2){
        el("productSearchInput").value=name;
        const matched=await search(name,true);
        if(!matched)personal()?.showNoMatch({query:name,ai:parsed,photo:encoded});
        else status("AI разпозна името. Избери продукт от базата или натисни „Добави продукт“ за данните от етикета.","success");
      }else {
        personal()?.showNoMatch({ai:parsed,photo:encoded});
        status("Снимката е запазена. Провери и попълни прочетените стойности в редактора.");
      }
    }catch(e){
      personal()?.showNoMatch({photo:capturePhoto});
      status("Снимката се вижда. "+(e.message||"AI анализът не успя.")+" Можеш да въведеш данните ръчно.","error");
    }finally{processing=false;btn.disabled=false;btn.value="";}
  }
  
  async function diary() {
    if(!active||active.energy===null||typeof state==="undefined"||typeof save!=="function"){status("Липсват данни за запис.");return;}
    const p=active, meal={
      id:crypto.randomUUID(),date:new Date().toISOString(),title:p.name,mealType:typeof mealTypeForTime==="function"?mealTypeForTime():"snack",
      image:capturePhoto||(validOwnPhoto(p.imageData)?p.imageData:""),quantityGrams:100,analysis:{foods:[{name:p.name,estimatedGrams:100,calories:Math.round(p.energy),protein:p.protein||0,carbs:p.carbs||0,fat:p.fat||0,fiber:p.fiber||0}],totalCalories:Math.round(p.energy),protein:p.protein||0,carbs:p.carbs||0,fat:p.fat||0,fiber:p.fiber||0,rating:"Данни от етикет / Open Food Facts",reason:"Порция 100 г от базата."}
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
    el("productLiveScan").addEventListener("click",()=>{
      pendingBarcodeFromScanner=true;
      clearCapture();
      status("Камерата се отваря. Насочи я към баркода на опаковката...");
      if(typeof startLiveBarcodeScanner==="function")startLiveBarcodeScanner();
      else status("Баркод камерата не е достъпна на това устройство.","error");
    });
    el("productPhoto").addEventListener("change",e=>detectPhoto(e.currentTarget.files?.[0]));
    el("productScanMatches").addEventListener("click",e=>{const b=e.target.closest("[data-product-index]");if(b&&found[Number(b.dataset.productIndex)])show(found[Number(b.dataset.productIndex)]);});
    el("productScanRecent").addEventListener("click",e=>{
      const b=e.target.closest("[data-recent]");
      if(b&&recent[Number(b.dataset.recent)]){clearCapture();show(recent[Number(b.dataset.recent)]);}
    });
    el("productScanDetail").addEventListener("click",e=>{
      if(e.target.closest("#productEditSaved") && active?.source==="personal")personal()?.openEditor({product:active,image:active.imageData});
      if(e.target.closest("#productDetailClose"))el("productScanDetail").classList.add("hidden");
      if(e.target.closest("#productAddToDiary"))diary();
    });
    el("closeBarcodeScanner")?.addEventListener("click",()=>{pendingBarcodeFromScanner=false;});
    window.addEventListener("nutriai:personal-product-selected",e=>{
      if(e.detail?.product) {clearCapture();show(e.detail.product);status("Показвам продукта от твоята база.","success");}
    });
    window.addEventListener("nutriai:personal-product-saved",e=>{
      if(e.detail?.product) {clearCapture();show(e.detail.product);status("Продуктът е запазен и ще се намира по баркод или име.","success");}
    });
    window.addEventListener("nutriai:barcode-found",e=>{
      if(!pendingBarcodeFromScanner)return;
      if(e.detail?.capturedImage)setCapture(e.detail.capturedImage,"Кадър от сканирания баркод");
      status("Баркодът е разпознат. Зареждам данните за продукта...");
    });
    window.addEventListener("nutriai:barcode-product",e=>{
      if(!pendingBarcodeFromScanner)return;
      pendingBarcodeFromScanner=false;
      if(e.detail?.capturedImage && !capturePhoto)setCapture(e.detail.capturedImage,"Кадър от сканирания баркод");
      if(!e.detail?.product)return;
      const tab=document.querySelector('.tab[data-view="products"]');
      if(!tab?.classList.contains("active"))tab?.click();
      show(e.detail.product);
      status("Продуктът е намерен по сканирания баркод.","success");
    });
    window.addEventListener("nutriai:barcode-error",e=>{
      if(!pendingBarcodeFromScanner)return;
      pendingBarcodeFromScanner=false;
      if(e.detail?.capturedImage && !capturePhoto)setCapture(e.detail.capturedImage,"Кадър от сканирания баркод");
      const code=e.detail?.barcode||"";
      const own=personal()?.findBarcode(code);
      if(own) {show(own);status("Продуктът е намерен в твоята база.","success");return;}
      personal()?.showNoMatch({code,photo:capturePhoto,error:e.detail?.message||""});
      status("Не е намерен запис за този EAN. Добави данни от етикета или AI снимка.","error");
    });
    el("productScanDetail").addEventListener("error",event=>{
      const image=event.target;
      if(image?.tagName!=="IMG"||!image.classList.contains("product-identity-image"))return;
      if(capturePhoto && image.src!==capturePhoto)image.src=capturePhoto;
      else image.replaceWith(Object.assign(document.createElement("div"),{className:"product-identity-image product-photo-placeholder",textContent:"◈"}));
    },true);
    renderRecent();
  });
})();
