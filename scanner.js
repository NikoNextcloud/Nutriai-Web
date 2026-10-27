/* NutriAI Product Lab — independent product exploration; no existing diary state is replaced. */
(() => {
  "use strict";
  const el = id => document.getElementById(id);
  const personal = () => window.NutriAICustomProducts;
  const validOwnPhoto = data => typeof data === "string" && data.length < 220000 && /^data:image\/jpeg;base64,[a-zA-Z0-9+/=]+$/.test(data);
  const storeKey = "nutriai.productScanRecent.v1";
  const safe = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const num = value => value === undefined || value === null || typeof value === "boolean" || String(value).trim() === "" ? null : Number.isFinite(Number(value)) && Number(value)>=0 ? Number(value) : null;
  const numberLabel = (n, unit="г") => n === null ? "Няма данни" : (Math.round(n*10)/10).toLocaleString("bg-BG") + " " + unit;
  const recent = (() => { try { const items=JSON.parse(localStorage.getItem(storeKey)||"[]"); return Array.isArray(items)?items.slice(0,12).map(p=>p.source==="personal"||p.classificationVersion===2?p:{...p,isDrink:null}):[]; } catch {return [];} })();
  let found=[], active=null, lastRequest=0, processing=false;
  let capturePhoto = "", captureLabel = "", pendingBarcodeFromScanner = false;
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
  function product(raw) {
    const n=raw.nutriments||{};
    const categories=Array.isArray(raw.categories_tags)?raw.categories_tags:[];
    // OFF includes ancestor categories. "plant-based-foods-and-beverages" also
    // describes solid foods, so substring matching "beverages" mislabels pasta.
    const drinkTags=new Set(["en:beverages","en:drinks","en:milks","en:drinkable-yogurts",
      "en:plant-based-beverages","en:fruit-juices","en:fruit-nectars","en:soft-drinks",
      "en:waters","en:smoothies","en:energy-drinks","bg:напитки","fr:boissons"]);
    const meaningful=categories.filter(tag=>!["en:plant-based-foods-and-beverages","en:foods-and-beverages"].includes(tag));
    const isDrink=categories.some(tag=>drinkTags.has(tag))?true:meaningful.length?false:null;
    return {
      code:String(raw.code||"").replace(/\D/g,""), name:String(raw.product_name_bg||raw.product_name||raw.generic_name||"Неизвестен продукт").trim(),
      brand:String(raw.brands||""), image:[
        raw.image_front_url, raw.image_front_small_url, raw.image_url, raw.image_small_url,
        raw.selected_images?.front?.display?.bg, raw.selected_images?.front?.display?.en,
        raw.selected_images?.front?.small?.bg, raw.selected_images?.front?.small?.en
      ].map(img).find(Boolean)||"",
      energy:num(n["energy-kcal_100g"]) ?? (num(n.energy_100g)!==null ? num(n.energy_100g)/4.184 : null),
      sugar:num(n.sugars_100g), salt:num(n.salt_100g), saturated:num(n["saturated-fat_100g"]),
      fat:num(n.fat_100g), protein:num(n.proteins_100g), fiber:num(n.fiber_100g), carbs:num(n.carbohydrates_100g),
      score:/^[abcde]$/i.test(raw.nutriscore_grade||"")?raw.nutriscore_grade.toUpperCase():null,
      nova:[1,2,3,4].includes(Number(raw.nova_group))?Number(raw.nova_group):null,
      ingredients:String(raw.ingredients_text_bg||raw.ingredients_text||""),
      allergens:Array.isArray(raw.allergens_tags)?raw.allergens_tags.map(x=>x.split(":").pop().replaceAll("-"," ")):[],
      additives:Array.isArray(raw.additives_tags)?raw.additives_tags.map(x=>x.split(":").pop().toUpperCase()):[],
      quantity:String(raw.quantity||""), isDrink, classificationVersion:2
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
  function compactNumber(value, unit) {
    if(value === null || value === undefined || !Number.isFinite(Number(value))) return '<span class="product-metric-empty">—</span>';
    const number=Number(value), formatted=number.toLocaleString("bg-BG",{
      maximumFractionDigits:unit==="kcal"?0:1
    });
    return '<strong>'+safe(formatted)+'</strong><small>'+safe(unit)+'</small>';
  }
  function renderMetricTiles(p, assessment) {
    const tiles=[
      ["🔥","Калории",p.energy,"kcal","energy"],
      ["🥩","Протеини",p.protein,"г","protein"],
      ["🍞","Въглехидрати",p.carbs,"г","carbs"],
      ["🥑","Мазнини",p.fat,"г","fat"],
      ["🍬","Захари",p.sugar,"г","sugar"],
      ["🌾","Фибри",p.fiber,"г","fiber"]
    ];
    return '<div class="product-quick-metrics" role="list" aria-label="Хранителни стойности за '+safe(assessment.unit)+'">'+
      tiles.map(([emoji,label,value,unit,tone])=>
        '<div class="product-quick-tile product-quick-'+tone+'" role="listitem">'+
          '<span class="product-quick-emoji" aria-hidden="true">'+emoji+'</span>'+
          '<span class="product-quick-number">'+compactNumber(value,unit)+'</span>'+
          '<span class="product-quick-label">'+safe(label)+'</span>'+
        '</div>'
      ).join("")+'</div>';
  }
  function renderHealthPanel(p, assessment) {
    const metric=assessment.score===null?'—':assessment.score.toFixed(1);
    const badge=assessment.grade
      ? '<span class="product-health-flag product-health-nutri">Nutri-Score '+safe(assessment.grade)+'</span>'
      : assessment.source==="label"
        ? '<span class="product-health-flag product-health-estimate">Оценка от етикет</span>'
        : '<span class="product-health-flag product-health-unknown">Няма Nutri-Score</span>';
    const nova=p.nova
      ? '<span class="product-health-flag product-health-nova">NOVA '+Number(p.nova)+'/4</span>'
      : '<span class="product-health-flag product-health-unknown">NOVA: няма данни</span>';
    const shortSource=assessment.source==="nutriscore"?"По Nutri-Score":
      assessment.source==="label"?"Ориентир от хранителния етикет":"Няма достатъчно потвърдени показатели";
    return '<section class="product-health-result health-'+safe(assessment.tone)+'" aria-label="Оценка на хранителния профил">'+
      '<div class="product-health-heading"><span>✦ ХРАНИТЕЛЕН ПРОФИЛ</span><small>За лесно сравнение</small></div>'+
      '<div class="product-health-body">'+
        '<div class="product-health-ring" style="--health-percent:'+assessment.scorePercent+'%">'+
          '<div class="product-health-ring-core"><strong>'+safe(metric)+'</strong><small>/10</small></div>'+
        '</div>'+
        '<div class="product-health-message"><h3>'+safe(assessment.title)+'</h3>'+
          '<p>'+safe(assessment.subtitle)+'</p>'+
          '<div class="product-health-progress" aria-hidden="true"><span style="width:'+assessment.scorePercent+'%"></span></div>'+
          '<small>'+safe(shortSource)+'</small>'+
        '</div>'+
      '</div>'+
      '<div class="product-health-flags">'+badge+nova+'</div>'+
      '<details class="product-health-method"><summary>Как се изчислява оценката?</summary><p>'+safe(assessment.method)+'</p></details>'+
      '<p class="product-health-safety-note">Не е оценка за токсичност или медицинска препоръка. Размерът на порцията и цялостното хранене имат значение.</p>'+
    '</section>';
  }
  function renderSignals(assessment) {
    const entries=[
      ...assessment.warn.map(x=>({...x,severity:"warn"})),
      ...assessment.good.map(x=>({...x,severity:"good"})),
      ...assessment.neutral.slice(0,3).map(x=>({...x,severity:"neutral"}))
    ];
    const cards=entries.map(x=>
      '<div class="product-insight product-insight-'+x.severity+'">'+
        '<div class="product-insight-icon" aria-hidden="true">'+x.icon+'</div>'+
        '<div class="product-insight-copy"><strong>'+safe(x.label)+'</strong><small>'+safe(x.detail)+'</small></div>'+
        '<span class="product-insight-dot" aria-hidden="true"></span>'+
      '</div>').join("");
    return '<section class="product-panel product-insights-panel">'+
      '<div class="product-panel-head"><h3>Какво да знаеш?</h3><span>По данните от етикета</span></div>'+
      (cards||'<div class="product-insights-empty">Няма откроени сигнали в наличните данни. Това не означава, че продуктът е безрисков.</div>')+
    '</section>';
  }
  function renderAdditionalNutrition(p, assessment) {
    const rows=[
      ["Наситени мазнини",p.saturated,"г"],
      ["Сол",p.salt,"г"],
      ["Захари",p.sugar,"г"],
      ["Фибри",p.fiber,"г"]
    ];
    return '<section class="product-panel product-additional-panel">'+
      '<div class="product-panel-head"><h3>Хранителни стойности</h3><span>за '+safe(assessment.unit)+'</span></div>'+
      '<div class="product-more-values">'+rows.map(([name,val,unit])=>
        '<div><span>'+safe(name)+'</span><strong>'+(val===null||val===undefined?"Няма данни":safe(numberLabel(val,unit)))+'</strong></div>'
      ).join("")+'</div>'+
      '<p class="product-label-note">Показаните стойности са за 100 г или 100 мл според вида на продукта, а не за цялата опаковка.</p>'+
    '</section>';
  }
  function renderDetail(p) {
    active=p;
    const assessment=window.NutriAIInsights?.assess(p)||{
      score:null,scorePercent:0,grade:null,source:"unknown",tone:"unknown",
      title:"Няма оценка",subtitle:"Не може да се изчисли",unit:"100 г/мл",
      method:"Няма достатъчно данни.",warn:[],good:[],neutral:[]
    };
    const personalRecord=p.source==="personal";
    const hasOwnImage=personalRecord&&validOwnPhoto(p.imageData);
    const visualSource=hasOwnImage?"Моя снимка":p.image?"Снимка от Open Food Facts":capturePhoto?captureLabel:"Няма снимка";
    const visual='<div class="product-quick-photo">'+detailPhoto(p)+
      '<small>'+safe(visualSource)+'</small></div>';
    const otherPhoto=(p.image||hasOwnImage)&&capturePhoto
      ? '<div class="product-identity-scan-photo"><img src="'+safe(capturePhoto)+'" alt="Заснетият продукт"><span>'+safe(captureLabel)+'</span></div>'
      : "";
    const content=
      '<div class="product-detail-top"><span class="product-section-kicker">ПРОДУКТОВ ПРОФИЛ ✦ NUTRIAI</span>'+
      '<button id="productDetailClose" class="product-detail-close" type="button" aria-label="Затвори">×</button></div>'+
      '<article class="product-detail-overview">'+
        '<div class="product-detail-heading"><p>'+safe(p.brand||"Хранителен продукт")+'</p><h2>'+safe(p.name)+'</h2>'+
        '<small>'+safe(p.quantity||"")+((p.quantity&&p.code)?" · ":"")+safe(p.code||"")+'</small></div>'+
        '<div class="product-visual-summary">'+visual+renderMetricTiles(p,assessment)+'</div>'+
        '<p class="product-metric-caption">Количество за '+safe(assessment.unit)+' • „—“ означава, че няма данни</p>'+
      '</article>'+otherPhoto+
      (personalRecord?'<div class="product-self-sourced">✦ Личен продукт — стойностите са въведени или потвърдени от етикета. Не са проверени от Open Food Facts.</div>':'')+
      renderHealthPanel(p,assessment)+
      renderSignals(assessment)+
      renderAdditionalNutrition(p,assessment)+
      '<section class="product-panel product-ingredients-panel">'+
        '<div class="product-panel-head"><h3>Състав и алергени</h3></div>'+
        '<p class="product-ingredient-copy">'+safe(p.ingredients||"В базата няма въведен състав. Провери опаковката.")+'</p>'+
        '<div class="product-ingredient-meta"><strong>Алергени:</strong> '+safe(p.allergens?.length?p.allergens.join(", "):"Няма данни — провери етикета")+'</div>'+
        '<div class="product-ingredient-meta"><strong>Добавки:</strong> '+safe(p.additives?.length?p.additives.join(", "):"Няма посочени")+'</div>'+
      '</section>'+
      (personalRecord?'<button type="button" id="productEditSaved">✎ Редактирай моя продукт</button>':'')+
      '<button id="productAddToDiary" class="product-add-diary" type="button" '+(p.energy===null?"disabled":"")+'>＋ Добави 100 г към дневника</button>'+
      '<p class="product-detail-footnote">Nutri-Score: хранителен профил. NOVA: степен на преработка. Оценката е ориентир, а не оценка за безопасност или индивидуална пригодност.</p>';
    el("productScanDetail").innerHTML=content;
    el("productScanDetail").classList.remove("hidden");
  }
  async function getData(params) {
    return window.NutriAIFoodDatabase.get(params);
  }

  async function lookup(code, preserveCapture=false) {
    code=String(code||"").replace(/\D/g,"");
    if(code.length<8 || code.length>14){status("Въведи валиден EAN/UPC баркод от 8 до 14 цифри.","error");return false;}
    if(!preserveCapture)clearCapture();
    personal()?.clearNoMatch?.();
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
    personal()?.clearNoMatch?.();
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
  
  function show(raw) {personal()?.clearNoMatch?.();const p=raw && "energy" in raw?raw:product(raw);renderDetail(p);persist(p);el("productScanDetail").scrollIntoView({behavior:"smooth",block:"start"});}
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
      ++lastRequest;
      personal()?.clearNoMatch?.();
      el("productScanDetail").classList.add("hidden");
      el("productScanMatches").innerHTML="";
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
      el("productScanDetail").classList.add("hidden");
      status(e.detail?.kind==="not-found"
        ? "Баркодът е разчетен, но продуктът липсва в каталога. Добави го от етикета."
        : code
          ? (e.detail?.message||"Няма връзка с хранителната база.")+" Не е потвърдено дали продуктът е в каталога."
          : e.detail?.message||"Баркодът не се разчита от тази снимка. Опитай отблизо или въведи цифрите под линиите.",
        "error");
    });
    const imageError=event=>{
      const image=event.target;
      if(image?.tagName!=="IMG")return;
      const main=image.classList.contains("product-identity-image");
      const caption=main?image.closest(".product-quick-photo")?.querySelector("small"):null;
      if(main&&capturePhoto&&image.src!==capturePhoto){
        image.src=capturePhoto;image.alt=captureLabel||"Снимка от сканирането";
        if(caption)caption.textContent=captureLabel||"Снимка от сканирането";
      }else{
        const placeholder=Object.assign(document.createElement("div"),{className:image.className+" product-photo-placeholder",textContent:"◈"});
        placeholder.setAttribute("role","img");placeholder.setAttribute("aria-label","Няма снимка за продукта");
        image.replaceWith(placeholder);
        if(caption)caption.textContent="Няма снимка";
      }
    };
    for(const id of ["productScanDetail","productScanMatches","productScanRecent"])el(id).addEventListener("error",imageError,true);
    renderRecent();
  });
})();
