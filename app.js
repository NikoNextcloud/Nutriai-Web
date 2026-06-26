const state = {
  profile: load("nutriai.profile", defaultProfile()),
  meals: load("nutriai.meals", []),
  weights: load("nutriai.weights", []),
  messages: load("nutriai.messages", [
    {
      role: "assistant",
      text: "Здравейте! Аз съм вашият личен AI диетолог и нутриционист. Можете да ме питате за рецепти, калориен дефицит, алтернативи на храни или дневно меню.",
      date: new Date().toISOString()
    }
  ]),
  water: load("nutriai.water", { date: new Date().toDateString(), amount: 0 }),
  apiKey: localStorage.getItem("nutriai.groqApiKey") || localStorage.getItem("nutriai.apiKey") || "",
  selectedImageDataUrl: "",
  lastAnalysis: null
};

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", () => {
  restoreTheme();
  bindNavigation();
  bindProfile();
  bindCamera();
  bindHydration();
  bindSegments();
  bindProgress();
  bindChat();
  hydrateProfileForm();
  updateAppVisibility();
  renderAll();
});

function defaultProfile() {
  return {
    gender: "Жена",
    age: 30,
    height: 170,
    weight: 70,
    targetWeight: 65,
    activity: 1.55,
    activityLabel: "Умерена",
    goal: "Отслабване",
    dailyLimit: 1800,
    hasCompletedSetup: false
  };
}

function load(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function bindNavigation() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const view = tab.dataset.view;
      document.querySelectorAll(".tab").forEach((item) => item.classList.toggle("active", item === tab));
      document.querySelectorAll(".view").forEach((section) => section.classList.remove("active"));
      const section = $(`view-${view}`);
      section.classList.add("active");
      $("screenTitle").textContent = section.dataset.title || "NutriAI";
      if (view === "progress") drawWeightChart();
    });
  });

  document.querySelectorAll("[data-jump]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelector(`.tab[data-view="${button.dataset.jump}"]`)?.click();
    });
  });

  $("themeToggle").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("nutriai.theme", next);
  });
}

function bindSegments() {
  document.querySelectorAll("[data-segment='gender'] button").forEach((button) => {
    button.classList.toggle("active", button.dataset.value === state.profile.gender);
    button.addEventListener("click", () => {
      $("gender").value = button.dataset.value;
      document.querySelectorAll("[data-segment='gender'] button").forEach((item) => item.classList.toggle("active", item === button));
    });
  });

  document.querySelectorAll("[data-meal]").forEach((button) => {
    button.addEventListener("click", () => {
      $("mealType").value = button.dataset.meal;
      document.querySelectorAll("[data-meal]").forEach((item) => item.classList.toggle("active", item === button));
    });
  });
}

function bindHydration() {
  $("addWater250").addEventListener("click", () => addWater(250));
  $("addWater500").addEventListener("click", () => addWater(500));
}

function addWater(amount) {
  resetWaterIfNeeded();
  state.water.amount += amount;
  save("nutriai.water", state.water);
  renderDashboard();
}

function resetWaterIfNeeded() {
  const today = new Date().toDateString();
  if (state.water.date !== today) {
    state.water = { date: today, amount: 0 };
  }
}

function restoreTheme() {
  const saved = localStorage.getItem("nutriai.theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = saved || (prefersDark ? "dark" : "light");
}

function bindProfile() {
  $("profileForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const activitySelect = $("activity");
    state.profile = {
      gender: $("gender").value,
      age: Number($("age").value),
      height: Number($("height").value),
      weight: Number($("weight").value),
      targetWeight: Number($("targetWeight").value),
      activity: Number(activitySelect.value),
      activityLabel: activitySelect.options[activitySelect.selectedIndex].text,
      goal: $("goal").value,
      dailyLimit: Number($("dailyLimit").value),
      hasCompletedSetup: true
    };
    const targets = calculateTargets(state.profile);
    state.profile.dailyLimit = targets.recommendedCalories;
    $("dailyLimit").value = targets.recommendedCalories;
    save("nutriai.profile", state.profile);
    updateAppVisibility();
    renderAll();
  });
}

function updateAppVisibility() {
  const completed = Boolean(state.profile.hasCompletedSetup);
  $("onboardingScreen").classList.toggle("hidden", completed);
  document.querySelector(".phone-app").classList.toggle("hidden", !completed);
}

function hydrateProfileForm() {
  $("gender").value = state.profile.gender;
  $("age").value = state.profile.age;
  $("height").value = state.profile.height;
  $("weight").value = state.profile.weight;
  $("targetWeight").value = state.profile.targetWeight;
  $("activity").value = String(state.profile.activity);
  $("goal").value = state.profile.goal;
  $("dailyLimit").value = state.profile.dailyLimit;
  $("apiKey").value = state.apiKey;
  $("weightEntry").value = state.weights.at(-1)?.weight || state.profile.weight;
}

function calculateTargets(profile) {
  const heightM = Math.max(profile.height / 100, 0.5);
  const bmi = profile.weight / (heightM * heightM);
  const sexAdjustment = profile.gender === "Мъж" ? 5 : profile.gender === "Жена" ? -161 : -78;
  const bmr = (10 * profile.weight) + (6.25 * profile.height) - (5 * profile.age) + sexAdjustment;
  const tdee = bmr * profile.activity;

  let calories = tdee;
  if (profile.goal === "Отслабване") calories = Math.max(tdee - 450, 1200);
  if (profile.goal === "Покачване") calories = tdee + 300;

  const protein = profile.weight * (profile.goal === "Покачване" ? 1.8 : 1.6);
  const fat = calories * 0.28 / 9;
  const carbs = Math.max((calories - protein * 4 - fat * 9) / 4, 0);
  const fiber = Math.max(25, calories / 1000 * 14);
  const water = profile.weight * 35;

  return {
    bmi: round(bmi, 1),
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    recommendedCalories: Math.round(calories),
    protein: Math.round(protein),
    fat: Math.round(fat),
    carbs: Math.round(carbs),
    fiber: Math.round(fiber),
    water: Math.round(water)
  };
}

function consumedToday() {
  const today = new Date().toDateString();
  return state.meals
    .filter((meal) => new Date(meal.date).toDateString() === today)
    .reduce((sum, meal) => sum + Number(meal.analysis.totalCalories || 0), 0);
}

function renderAll() {
  renderDashboard();
  renderHistory();
  renderChat();
  drawWeightChart();
}

function renderDashboard() {
  resetWaterIfNeeded();
  const targets = calculateTargets(state.profile);
  const consumed = consumedToday();
  const totals = macroTotalsToday();
  const limit = state.profile.dailyLimit || targets.recommendedCalories;
  const remaining = Math.round(limit - consumed);
  const percent = Math.min(Math.max(consumed / limit, 0), 1);
  $("remainingCalories").textContent = `${Math.max(remaining, 0)}`;
  $("consumedCalories").textContent = `${Math.round(consumed)}`;
  $("targetCalories").textContent = `${limit}`;
  $("calorieRing").style.background = `conic-gradient(var(--orange) ${percent * 360}deg, rgba(160, 160, 170, 0.18) 0deg)`;

  $("macroBars").innerHTML = [
    macroCard("💪", "Протеин", totals.protein, targets.protein, "var(--orange)"),
    macroCard("🌾", "Въгл.", totals.carbs, targets.carbs, "var(--blue)"),
    macroCard("🥑", "Мазнини", totals.fat, targets.fat, "var(--yellow)")
  ].join("");

  const waterPercent = Math.min(state.water.amount / targets.water, 1);
  $("waterStatus").textContent = `${state.water.amount} / ${targets.water} мл`;
  $("waterMeter").style.width = `${waterPercent * 100}%`;

  const metrics = [
    ["BMI", targets.bmi],
    ["BMR", `${targets.bmr} kcal`],
    ["TDEE", `${targets.tdee} kcal`],
    ["Калории", `${targets.recommendedCalories} kcal`],
    ["Протеини", `${targets.protein} г`],
    ["Мазнини", `${targets.fat} г`],
    ["Въглехидрати", `${targets.carbs} г`],
    ["Фибри", `${targets.fiber} г`],
    ["Вода", `${targets.water} мл`]
  ];
  $("metrics").innerHTML = metrics.map(([label, value]) => metricHtml(label, value)).join("");

  const plan = [
    `Закуска: протеин + плод + пълнозърнест източник според лимита от ${limit} kcal.`,
    "Обяд: чист протеин, зеленчуци и умерена порция картофи, ориз или бобови.",
    "Следобед: кисело мляко, плод или малка порция ядки.",
    "Вечеря: риба, пилешко, яйца, тофу или бобови със зеленчуци.",
    "Избягвай опасни крайни диети. Целта е устойчив, балансиран режим."
  ];
  $("nutritionPlan").innerHTML = plan.map((item) => `<div class="plan-item"><span>${escapeHtml(item)}</span></div>`).join("");
  renderTodayMeals();
  renderProgressCards(targets);
}

function metricHtml(label, value) {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

function macroCard(icon, title, current, target, color) {
  const percent = Math.min(Number(current || 0) / Math.max(Number(target || 1), 1), 1);
  return `
    <div class="macro-card">
      <span class="macro-icon">${escapeHtml(icon)}</span>
      <small>${escapeHtml(title)}</small>
      <div class="macro-bar"><span style="height:${percent * 100}%;background:${color}"></span></div>
      <strong>${Math.round(current || 0)} / ${Math.round(target || 0)}g</strong>
    </div>
  `;
}

function macroTotalsToday() {
  const today = new Date().toDateString();
  return state.meals
    .filter((meal) => new Date(meal.date).toDateString() === today)
    .reduce((sum, meal) => {
      sum.protein += Number(meal.analysis.protein || 0);
      sum.carbs += Number(meal.analysis.carbs || 0);
      sum.fat += Number(meal.analysis.fat || 0);
      sum.fiber += Number(meal.analysis.fiber || 0);
      return sum;
    }, { protein: 0, carbs: 0, fat: 0, fiber: 0 });
}

function renderTodayMeals() {
  const today = new Date().toDateString();
  const meals = state.meals.filter((meal) => new Date(meal.date).toDateString() === today);
  if (!meals.length) {
    $("todayMeals").innerHTML = `<div class="empty-copy">Все още нямате записани хранения за днес. Отидете на Камера, за да анализирате храната си.</div>`;
    return;
  }
  $("todayMeals").innerHTML = meals.map((meal) => mealRowHtml(meal)).join("");
}

function renderProgressCards(targets) {
  const bmiCategory = getBMICategory(targets.bmi);
  $("progressCards").innerHTML = [
    progressCard("🧭", "BMI Индекс", targets.bmi, bmiCategory, getBMIColor(targets.bmi)),
    progressCard("🔥", "BMR", targets.bmr, "kcal / ден", "var(--orange)"),
    progressCard("⚡", "TDEE", targets.tdee, "kcal / ден", "var(--blue)")
  ].join("");
  $("weightGoalLabel").textContent = `Цел: ${state.profile.targetWeight} кг`;
}

function progressCard(icon, title, value, desc, color) {
  return `<div class="progress-mini-card"><b>${escapeHtml(icon)}</b><small>${escapeHtml(title)}</small><strong style="color:${color}">${escapeHtml(value)}</strong><span>${escapeHtml(desc)}</span></div>`;
}

function getBMICategory(bmi) {
  if (bmi < 18.5) return "Поднормено";
  if (bmi < 25) return "Нормално";
  if (bmi < 30) return "Наднормено";
  return "Затлъстяване";
}

function getBMIColor(bmi) {
  if (bmi < 18.5) return "var(--blue)";
  if (bmi < 25) return "var(--green)";
  if (bmi < 30) return "var(--yellow)";
  return "var(--red)";
}

function bindCamera() {
  $("saveApiKey").addEventListener("click", () => {
    state.apiKey = $("apiKey").value.trim();
    localStorage.setItem("nutriai.groqApiKey", state.apiKey);
    $("analysisStatus").textContent = "API ключът е запазен локално.";
  });

  $("foodImage").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    state.selectedImageDataUrl = await fileToDataUrl(file);
    $("preview").src = state.selectedImageDataUrl;
    $("preview").style.display = "block";
    $("photoPlaceholder").style.display = "none";
    $("analysisPanel").classList.add("hidden");
  });

  $("analyzeButton").addEventListener("click", analyzeFood);
  $("saveMeal").addEventListener("click", () => {
    if (!state.lastAnalysis) return;
    const title = state.lastAnalysis.foods?.[0]?.name || "Хранене";
    state.meals.unshift({
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      title,
      mealType: $("mealType").value,
      image: state.selectedImageDataUrl,
      analysis: state.lastAnalysis
    });
    save("nutriai.meals", state.meals);
    renderAll();
    $("analysisStatus").textContent = "Храненето е запазено.";
  });
}

async function analyzeFood() {
  state.apiKey = $("apiKey").value.trim() || state.apiKey;
  const canUseProxy = location.hostname && !location.hostname.endsWith("github.io");
  if (!state.apiKey && !canUseProxy) {
    $("analysisStatus").textContent = "Добави Groq API ключ или използвай deployment с /api/groq proxy.";
    return;
  }
  if (!state.selectedImageDataUrl) {
    $("analysisStatus").textContent = "Избери или снимай храна.";
    return;
  }

  $("analysisStatus").textContent = "Анализирам снимката...";
  $("analyzeButton").disabled = true;

  const remaining = state.profile.dailyLimit - consumedToday();
  const prompt = `Ти си професионален AI диетолог и нутриционист.
Получаваш снимка на храна. Разпознай всички храни, оцени приблизителните грамове, калории, протеини, въглехидрати, мазнини и фибри.
Профил: пол ${state.profile.gender}, възраст ${state.profile.age}, височина ${state.profile.height} см, тегло ${state.profile.weight} кг, желано тегло ${state.profile.targetWeight} кг, активност ${state.profile.activityLabel}, цел ${state.profile.goal}, дневен калориен лимит ${state.profile.dailyLimit}.
Оставащи калории преди това хранене: ${Math.round(remaining)}.
Не измисляй факти. Ако количеството не е сигурно, отбележи, че е ориентировъчна оценка.
Върни само JSON със структура:
{"foods":[{"name":"","estimatedGrams":0,"calories":0,"protein":0,"carbs":0,"fat":0,"fiber":0,"confidenceNote":""}],"totalCalories":0,"protein":0,"carbs":0,"fat":0,"fiber":0,"rating":"","reason":"","remainingCalories":0,"recommendation":""}
Не използвай markdown, code block или обяснение извън JSON.`;

  try {
    const result = await callGroq([
      {
        role: "system",
        content: "Отговаряй само с валиден JSON на български. Не препоръчвай опасни диети."
      },
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: state.selectedImageDataUrl } }
        ]
      }
    ], true);

    state.lastAnalysis = parseGroqJson(result);
    renderAnalysisSummary(state.lastAnalysis);
    $("analysisPanel").classList.remove("hidden");
    $("analysisStatus").textContent = "Готово.";
  } catch (error) {
    $("analysisStatus").textContent = error.message;
  } finally {
    $("analyzeButton").disabled = false;
  }
}

function renderAnalysisSummary(analysis) {
  $("analysisCalories").textContent = `${Math.round(analysis.totalCalories || 0)} kcal`;
  const foodsHtml = analysis.foods?.length
    ? `<div class="food-list">${analysis.foods.map(foodItemHtml).join("")}</div>`
    : `<div class="empty-copy">Не са разпознати конкретни храни. Опитайте с по-ясна снимка.</div>`;
  $("analysisSummary").innerHTML = `
    <div class="analysis-headline">
      <h3>${escapeHtml(analysis.rating || "Анализ")}</h3>
      <p>${escapeHtml(analysis.reason || "Ориентировъчна оценка на храната от снимката.")}</p>
    </div>
    <div class="analysis-pills">
      <div class="pill"><span>Протеини</span><strong>${Math.round(analysis.protein || 0)}g</strong></div>
      <div class="pill"><span>Въгл.</span><strong>${Math.round(analysis.carbs || 0)}g</strong></div>
      <div class="pill"><span>Мазнини</span><strong>${Math.round(analysis.fat || 0)}g</strong></div>
      <div class="pill"><span>Фибри</span><strong>${Math.round(analysis.fiber || 0)}g</strong></div>
    </div>
    ${foodsHtml}
    ${analysis.recommendation ? `<div class="recommendation-box"><strong>💡 Препоръка</strong><span>${escapeHtml(analysis.recommendation)}</span></div>` : ""}
  `;
}

function foodItemHtml(food) {
  return `
    <div class="food-row">
      <div>
        <strong>${escapeHtml(food.name || "Храна")}</strong>
        <p>${Math.round(food.estimatedGrams || 0)} г • ${escapeHtml(food.confidenceNote || "ориентировъчна оценка")}</p>
      </div>
      <span>${Math.round(food.calories || 0)} kcal</span>
    </div>
  `;
}

async function callGroq(messages, jsonMode = false) {
  const body = {
    model: "meta-llama/llama-4-scout-17b-16e-instruct",
    messages,
    temperature: 0.2,
    max_completion_tokens: 1400,
    top_p: 1,
    stream: false
  };
  if (jsonMode) {
    body.response_format = { type: "json_object" };
  }

  const useProxy = !state.apiKey && location.hostname && !location.hostname.endsWith("github.io") && location.hostname !== "localhost" && location.hostname !== "127.0.0.1";
  const endpoint = useProxy ? "/api/groq" : "https://api.groq.com/openai/v1/chat/completions";
  const headers = {
    "Content-Type": "application/json"
  };
  if (!useProxy) {
    headers.Authorization = `Bearer ${state.apiKey}`;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || "Groq заявката не бе успешна.");
  }
  return data;
}

function parseGroqJson(data) {
  const text = data.choices?.[0]?.message?.content || "";
  if (!text.trim()) throw new Error("AI не върна текстов резултат.");
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");
  const parsed = JSON.parse(cleaned);
  return normalizeAnalysis(parsed);
}

function normalizeAnalysis(raw) {
  const foods = Array.isArray(raw.foods) ? raw.foods.map((food) => ({
    name: String(food.name || food.food || food.title || "Храна"),
    estimatedGrams: numberFrom(food.estimatedGrams ?? food.grams ?? food.quantityGrams ?? food.amountGrams),
    calories: numberFrom(food.calories ?? food.kcal ?? food.energy),
    protein: numberFrom(food.protein ?? food.proteins),
    carbs: numberFrom(food.carbs ?? food.carbohydrates),
    fat: numberFrom(food.fat ?? food.fats),
    fiber: numberFrom(food.fiber ?? food.fibre),
    confidenceNote: String(food.confidenceNote || food.note || food.uncertainty || "Ориентировъчна оценка")
  })) : [];

  const totals = foods.reduce((sum, food) => {
    sum.totalCalories += food.calories;
    sum.protein += food.protein;
    sum.carbs += food.carbs;
    sum.fat += food.fat;
    sum.fiber += food.fiber;
    return sum;
  }, { totalCalories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });

  return {
    foods,
    totalCalories: numberFrom(raw.totalCalories ?? raw.calories ?? raw.kcal) || totals.totalCalories,
    protein: numberFrom(raw.protein ?? raw.proteins) || totals.protein,
    carbs: numberFrom(raw.carbs ?? raw.carbohydrates) || totals.carbs,
    fat: numberFrom(raw.fat ?? raw.fats) || totals.fat,
    fiber: numberFrom(raw.fiber ?? raw.fibre) || totals.fiber,
    rating: String(raw.rating || "🟡 Добър избор"),
    reason: String(raw.reason || raw.summary || "Ориентировъчна AI оценка според снимката."),
    remainingCalories: numberFrom(raw.remainingCalories),
    recommendation: String(raw.recommendation || raw.advice || "")
  };
}

function numberFrom(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function renderHistory() {
  if (!state.meals.length) {
    $("mealHistory").innerHTML = `<div class="empty-copy">Все още няма запазени хранения.</div>`;
    return;
  }
  $("mealHistory").innerHTML = state.meals.map((meal) => mealRowHtml(meal, true)).join("");
}

function mealRowHtml(meal, includeDate = false) {
  const time = includeDate ? new Date(meal.date).toLocaleString("bg-BG") : new Date(meal.date).toLocaleTimeString("bg-BG", { hour: "2-digit", minute: "2-digit" });
  const mealType = mealTypeLabel(meal.mealType);
  return `
    <div class="meal-row">
      <div>
        <strong>${mealTypeIcon(meal.mealType)} ${escapeHtml(meal.title)}</strong>
        <p>${escapeHtml(time)} • ${escapeHtml(mealType)} • ${escapeHtml(meal.analysis.rating || "")}</p>
      </div>
      <strong>+${Math.round(meal.analysis.totalCalories || 0)} kcal</strong>
    </div>
  `;
}

function mealTypeIcon(type) {
  return {
    breakfast: "🌅",
    lunch: "☀️",
    dinner: "🌙",
    snack: "🍏"
  }[type] || "🍽";
}

function mealTypeLabel(type) {
  return {
    breakfast: "Закуска",
    lunch: "Обяд",
    dinner: "Вечеря",
    snack: "Снак"
  }[type] || "Хранене";
}

function bindProgress() {
  $("weightForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const value = Number($("weightEntry").value);
    if (!value) return;
    state.weights.push({ id: crypto.randomUUID(), date: new Date().toISOString(), weight: value });
    save("nutriai.weights", state.weights);
    $("weightEntry").value = "";
    renderDashboard();
    drawWeightChart();
  });
}

function drawWeightChart() {
  const canvas = $("weightChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--line");
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--muted");
  ctx.font = "14px system-ui";

  if (!state.weights.length) {
    ctx.fillText("Добави тегло, за да видиш прогрес.", 24, 40);
    return;
  }

  const values = state.weights.map((item) => item.weight);
  const min = Math.min(...values) - 1;
  const max = Math.max(...values) + 1;
  const pad = 36;

  ctx.beginPath();
  ctx.moveTo(pad, pad);
  ctx.lineTo(pad, height - pad);
  ctx.lineTo(width - pad, height - pad);
  ctx.stroke();

  const points = state.weights.map((item, index) => {
    const x = pad + (index / Math.max(state.weights.length - 1, 1)) * (width - pad * 2);
    const y = height - pad - ((item.weight - min) / Math.max(max - min, 1)) * (height - pad * 2);
    return { x, y, value: item.weight };
  });

  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--orange");
  ctx.lineWidth = 4;
  ctx.beginPath();
  points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
  ctx.stroke();

  points.forEach((point) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--orange");
    ctx.fill();
  });
}

function bindChat() {
  $("chatForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = $("chatInput").value.trim();
    if (!text) return;
    if (!state.apiKey) state.apiKey = $("apiKey").value.trim();
    if (!state.apiKey && (!location.hostname || location.hostname.endsWith("github.io"))) {
      alert("Добави Groq API ключ в екрана Снимка или използвай deployment с backend proxy.");
      return;
    }

    state.messages.push({ role: "user", text, date: new Date().toISOString() });
    $("chatInput").value = "";
    renderChat();

    try {
      const profileText = JSON.stringify(state.profile);
      const data = await callGroq([
        {
          role: "system",
          content: "Ти си експерт по хранене. Отговаряй на български, безопасно и балансирано. Не поставяй диагнози."
        },
        {
          role: "user",
          content: `Профил: ${profileText}\nВъпрос: ${text}`
        }
      ]);
      const answer = data.choices?.[0]?.message?.content || "Няма отговор.";
      state.messages.push({ role: "assistant", text: answer, date: new Date().toISOString() });
    } catch (error) {
      state.messages.push({ role: "assistant", text: error.message, date: new Date().toISOString() });
    }
    save("nutriai.messages", state.messages);
    renderChat();
  });
}

function renderChat() {
  $("chatMessages").innerHTML = state.messages.map((message) => `
    <div class="bubble ${message.role === "user" ? "user" : ""}">${escapeHtml(message.text)}</div>
  `).join("");
  $("chatMessages").scrollTop = $("chatMessages").scrollHeight;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function round(value, decimals) {
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
