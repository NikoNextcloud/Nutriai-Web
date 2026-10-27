/* NutriAI local food catalog.
   Only information explicitly entered by a person or read from a visible label is stored.
   Local products are never presented as verified Open Food Facts records. */
(() => {
  "use strict";
  const KEY="nutriai.customProducts.v1";
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const numericFields=["energy","protein","carbs","fat","sugar","fiber","saturated","salt"];
  const safePhoto=data=>typeof data==="string" && data.length<220000
    && /^data:image\/jpeg;base64,[a-zA-Z0-9+/=]+$/.test(data);
  const readLocal=()=>{
    try { const values=JSON.parse(localStorage.getItem(KEY)||"[]");return Array.isArray(values)?values:[]; }catch{return [];}
  };
  let items=readLocal();
  let ready=Promise.resolve();
  let pendingImage="";
  let editingId="";
  let visibleQuery="";
  let lastError="";
  const clean=p=>({
    id:String(p?.id||"").slice(0,120),
    code:String(p?.code||"").replace(/\D/g,"").slice(0,14),
    name:String(p?.name||"").trim().slice(0,110),
    brand:String(p?.brand||"").trim().slice(0,80),
    ingredients:String(p?.ingredients||"").slice(0,2500),
    energy:nullable(p?.energy,1000),protein:nullable(p?.protein,100),carbs:nullable(p?.carbs,100),
    fat:nullable(p?.fat,100),sugar:nullable(p?.sugar,100),fiber:nullable(p?.fiber,100),
    saturated:nullable(p?.saturated,100),salt:nullable(p?.salt,100),
    score:null,nova:null,image:"",imageData:safePhoto(p?.imageData)?p.imageData:"",
    allergens:[],additives:[],quantity:"",source:"personal",
    isDrink:p?.isDrink===true?true:p?.isDrink===false?false:null,
    updatedAt:String(p?.updatedAt||new Date().toISOString())
  });
  function nullable(v,max) {
    if(v===null||v===undefined||v==="")return null;
    const n=typeof v==="string"?Number(v.replace(",",".")):Number(v);
    return Number.isFinite(n)&&n>=0&&n<=max ? Math.round(n*100)/100 : null;
  }
  function canonicalBarcode(value){return String(value||"").replace(/\D/g,"").slice(0,14);}
  function findBarcode(value){const code=canonicalBarcode(value);return code?items.find(p=>p.code===code)||null:null;}
  function findQuery(q){
    const str=String(q||"").toLocaleLowerCase("bg-BG").trim();
    if(str.length<2)return[];
    return items.filter(p=>[p.name,p.brand,p.code].some(field=>String(field||"").toLocaleLowerCase("bg-BG").includes(str))).slice(0,12);
  }
  function all(){return items.slice();}
  async function hydrate(){
    try {
      if(typeof loadPersistent!=="function")return;
      const stored=await loadPersistent(KEY,items);
      if(Array.isArray(stored)){
        items=stored.map(clean).filter(p=>p.name).slice(0,35);
        renderMatches(visibleQuery);
      }
    } catch(error){console.warn("NutriAI personal catalog unavailable:",error);}
  }
  function normalizeAI(ai){
    if(!ai||typeof ai!=="object")return {};
    const n=ai.per100||ai.nutritionPer100||{};
    const get=(key,...aliases)=>{
      for(const obj of [n,ai])for(const name of [key,...aliases])
        if(obj?.[name]!==undefined&&obj[name]!==null&&obj[name]!=="")return obj[name];
      return "";
    };
    return {
      name:String(ai.name||ai.productName||"").slice(0,110),
      brand:String(ai.brand||"").slice(0,80),
      code:canonicalBarcode(ai.barcode||ai.ean||""),
      ingredients:String(ai.ingredients||ai.ingredientsText||"").slice(0,2500),
      energy:get("energy","energyKcal","kcal","calories"),
      protein:get("protein","proteins"),
      carbs:get("carbs","carbohydrates"),
      fat:get("fat","fats"),
      sugar:get("sugar","sugars"),
      fiber:get("fiber","fibre"),
      saturated:get("saturated","saturatedFat","saturatedFattyAcids"),
      salt:get("salt")
    };
  }
  async function compress(dataUrl){
    if(!/^data:image\/(?:png|jpeg|webp);base64,/.test(dataUrl||""))return "";
    if(typeof Image==="undefined")return "";
    try {
      const image=new Image();
      await new Promise((resolve,reject)=>{
        image.onload=resolve;image.onerror=reject;image.src=dataUrl;
      });
      const canvas=document.createElement("canvas");
      const ratio=Math.min(1,460/Math.max(image.naturalWidth,image.naturalHeight));
      canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));
      canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));
      const ctx=canvas.getContext("2d");
      if(!ctx)return "";
      ctx.fillStyle="#ffffff";ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(image,0,0,canvas.width,canvas.height);
      for(const quality of [.68,.5,.35]){
        const result=canvas.toDataURL("image/jpeg",quality);
        if(safePhoto(result))return result;
      }
      return "";
    }catch{return "";}
  }
  function openEditor({code="",query="",ai=null,image="",product=null,note=""}={}){
    const form=$("productCustomForm");
    if(!form)return;
    form.reset();
    const known=product||normalizeAI(ai);
    editingId=product?.id||"";
    pendingImage=image||product?.imageData||"";
    const values={...known,
      code:code||known?.code||"",name:known?.name||query||"",
      ingredients:known?.ingredients||""};
    const typeField=form.elements.namedItem("productType");
    if(typeField)typeField.value=known?.isDrink===true?"drink":known?.isDrink===false?"food":"unknown";
    for(const name of ["name","brand","code","ingredients",...numericFields]){
      const input=form.elements.namedItem(name);
      if(!input)continue;
      input.value=(values[name]===undefined||values[name]===null)?"":String(values[name]);
    }
    $("productEditorNote").textContent=note||(
      ai ? "AI разчете видимите данни от опаковката. Провери всички стойности и ги коригирай преди запазване." :
      "Въведи данни от етикета. Празните стойности остават неизвестни; записът няма автоматична здравна оценка."
    );
    $("productEditorStatus").textContent="";
    $("productEditorPanel").classList.remove("hidden");
    $("productEditorPanel").scrollIntoView({behavior:"smooth",block:"nearest"});
  }
  function closeEditor(){
    editingId="";pendingImage="";
    $("productEditorPanel")?.classList.add("hidden");
  }
  function renderMatches(query=""){
    visibleQuery=String(query||"").trim();
    const node=$("productPersonalMatches");
    if(!node)return;
    const matches=findQuery(visibleQuery);
    if(!matches.length){node.classList.add("hidden");node.innerHTML="";return;}
    node.classList.remove("hidden");
    node.innerHTML='<div class="product-personal-head">МОИТЕ ПРОДУКТИ <small>'+matches.length+' намерени</small></div>'+
      matches.map((p,index)=>'<button class="product-personal-result" type="button" data-personal-index="'+index+'">'+
        (safePhoto(p.imageData)?'<img src="'+p.imageData+'" alt="">':'<span class="product-personal-image-fallback" aria-hidden="true">▣</span>')+
        '<span><strong>'+esc(p.name)+'</strong><small>'+esc(p.brand||p.code||"Мой продукт")+'</small></span><span aria-hidden="true">↗</span></button>').join("");
  }
  async function saveEditor(event){
    event.preventDefault();
    const form=event.currentTarget;
    const data=new FormData(form);
    const code=canonicalBarcode(data.get("code"));
    if(data.get("code") && (code.length<8||code.length>14)){
      $("productEditorStatus").textContent="Баркодът трябва да съдържа 8–14 цифри или да е празен.";
      return;
    }
    const name=String(data.get("name")||"").trim().slice(0,110);
    if(!name){$("productEditorStatus").textContent="Въведи име на продукта.";return;}
    const existing=items.find(p=>p.id===editingId)||(code&&findBarcode(code))||null;
    const record=clean({
      id:existing?.id||crypto.randomUUID(),name,code,
      brand:data.get("brand"),ingredients:data.get("ingredients"),
      isDrink:data.get("productType")==="drink"?true:data.get("productType")==="food"?false:null,
      imageData:existing?.imageData||"",
      ...Object.fromEntries(numericFields.map(name=>[name,data.get(name)]))
    });
    const button=$("productSaveCustom");
    button.disabled=true;
    $("productEditorStatus").textContent="Запазвам продукта...";
    if(pendingImage)record.imageData=await compress(pendingImage)||record.imageData;
    const updated=[record,...items.filter(p=>p.id!==record.id&&(!code||p.code!==code))].slice(0,35);
    try {
      // Prefer IndexedDB through the app's existing storage, retaining a localStorage backup.
      if(typeof save==="function")await save(KEY,updated);
      else localStorage.setItem(KEY,JSON.stringify(updated));
      items=updated;
      renderMatches(visibleQuery||record.name);
      closeEditor();
      window.dispatchEvent(new CustomEvent("nutriai:personal-product-saved",{detail:{product:record}}));
    }catch(error){
      console.error("Failed to save custom product",error);
      $("productEditorStatus").textContent="Неуспешно запазване. Провери дали браузърът позволява локално съхранение.";
    }finally{button.disabled=false;}
  }
  function clearNoMatch(){
    const node=$("productNotFound");
    if(node){node.classList.remove("product-not-found-active");delete node.dataset.code;delete node.dataset.query;}
    pendingImage="";lastError="";
  }
  function showNoMatch({code="",query="",photo="",ai=null,error=""}={}){
    lastError=error;
    if(ai){openEditor({code,query,ai,image:photo,note:"AI е разчел видимите части от етикета. Провери числата преди запазване — липсващите стойности остават празни."});return;}
    if($("productNotFound"))$("productNotFound").classList.add("product-not-found-active");
    $("productOpenEditor")?.setAttribute("aria-label",code?"Добави продукт с баркод "+code:"Добави собствен продукт");
    // Display the action without auto-opening the form during plain search.
    if(code||query){
      $("productNotFound").dataset.code=code;
      $("productNotFound").dataset.query=query;
    }
    if(photo)pendingImage=photo;
  }
  async function setRecordsFromImport(arr){
    if(!Array.isArray(arr))return;
    items=arr.slice(0,35).map(clean).filter(p=>p.name);
    renderMatches(visibleQuery);
  }
  window.NutriAICustomProducts={
    findBarcode,findQuery,all,hydrate,openEditor,showNoMatch,clearNoMatch,renderMatches,
    setRecordsFromImport
  };
  document.addEventListener("DOMContentLoaded",()=>{
    ready=hydrate();
    $("productCustomForm")?.addEventListener("submit",saveEditor);
    $("productOpenEditor")?.addEventListener("click",()=>{
      const target=$("productNotFound");
      openEditor({
        code:target?.dataset.code||$("productBarcodeInput")?.value||"",
        query:target?.dataset.query||$("productSearchInput")?.value||"",
        image:pendingImage
      });
    });
    $("productEditorClose")?.addEventListener("click",closeEditor);
    $("productPersonalMatches")?.addEventListener("click",event=>{
      const b=event.target.closest("[data-personal-index]");
      if(!b)return;
      const entry=findQuery(visibleQuery)[Number(b.dataset.personalIndex)];
      if(entry)window.dispatchEvent(new CustomEvent("nutriai:personal-product-selected",{detail:{product:entry}}));
    });
    window.addEventListener("nutriai:personal-catalog-reloaded",event=>{
      setRecordsFromImport(event.detail?.products);
    });
  });
})();
