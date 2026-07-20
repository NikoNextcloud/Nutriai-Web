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
  aiPlan: load("nutriai.aiPlan", null),
  aiPlanVariant: load("nutriai.aiPlanVariant", 0),
  favorites: load("nutriai.favorites", []),
  reminders: load("nutriai.reminders", { water: false, waterInterval: 120, nextWaterAt: 0 }),
  fridgeItems: load("nutriai.fridgeItems", []),
  fridgeRecipe: load("nutriai.fridgeRecipe", null),
  historyDate: "",
  progressWeekOffset: 0,
  selectedImageDataUrl: "",
  lastAnalysis: null
};

const $ = (id) => document.getElementById(id);
const DB_NAME = "nutriai-storage";
const DB_VERSION = 1;
const DB_STORE = "keyval";
let dbPromise = null;

document.addEventListener("DOMContentLoaded", async () => {
  await hydratePersistentState();
  restoreTheme();
  bindNavigation();
  bindProfile();
  bindCalorieRecommendation();
  bindCamera();
  bindManualMeal();
  bindHydration();
  bindSegments();
  bindProgress();
  bindChat();
  bindFridge();
  bindPlanActions();
  bindProfileEditor();
  bindEnhancedFeatures();
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
    recommendedCalories: 1800,
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
  saveLocal(key, value);
  const persistentSave = savePersistent(key, value);
  persistentSave.catch((error) => console.warn("IndexedDB save failed", error));
  return persistentSave;
}

function saveLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    if (key === "nutriai.meals") {
      try {
        localStorage.removeItem(key);
      } catch {
        // Ignore localStorage cleanup failures; IndexedDB remains the primary store.
      }
    } else {
      console.warn("localStorage save failed", error);
    }
  }
}

async function hydratePersistentState() {
  const values = await Promise.all([
    loadPersistent("nutriai.profile", state.profile),
    loadPersistent("nutriai.meals", state.meals),
    loadPersistent("nutriai.weights", state.weights),
    loadPersistent("nutriai.messages", state.messages),
    loadPersistent("nutriai.water", state.water),
    loadPersistent("nutriai.aiPlan", state.aiPlan),
    loadPersistent("nutriai.aiPlanVariant", state.aiPlanVariant),
    loadPersistent("nutriai.favorites", state.favorites),
    loadPersistent("nutriai.reminders", state.reminders),
    loadPersistent("nutriai.fridgeItems", state.fridgeItems),
    loadPersistent("nutriai.fridgeRecipe", state.fridgeRecipe)
  ]);

  [
    state.profile,
    state.meals,
    state.weights,
    state.messages,
    state.water,
    state.aiPlan,
    state.aiPlanVariant,
    state.favorites,
    state.reminders,
    state.fridgeItems,
    state.fridgeRecipe
  ] = values;
}

async function loadPersistent(key, fallback) {
  try {
    const value = await idbGet(key);
    if (value !== undefined) return value;
    await savePersistent(key, fallback);
  } catch (error) {
    console.warn("IndexedDB load failed", error);
  }
  return fallback;
}

function openDatabase() {
  if (dbPromise) return dbPromise;
  if (!("indexedDB" in window)) {
    dbPromise = Promise.reject(new Error("IndexedDB is not available"));
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(DB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

async function idbGet(key) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function savePersistent(key, value) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(DB_STORE, "readwrite").objectStore(DB_STORE).put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
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
      updateCurrentDate(view === "dashboard");
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

function bindProfileEditor() {
  const button = $("editProfileButton");
  if (!button) return;
  button.addEventListener("click", () => {
    hydrateProfileForm();
    $("onboardingScreen").classList.remove("hidden");
    document.querySelector(".phone-app").classList.add("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
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
  $("profileForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const activitySelect = $("activity");
    const nextProfile = {
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
    const targets = calculateTargets(nextProfile);
    state.profile = {
      ...nextProfile,
      dailyLimit: Number($("dailyLimit").value) || targets.recommendedCalories,
      recommendedCalories: targets.recommendedCalories
    };
    save("nutriai.profile", state.profile);
    updateAppVisibility();
    renderAll();
    await generateAIPlan(true);
  });
}

function bindCalorieRecommendation() {
  const fields = ["age", "height", "weight", "targetWeight", "activity", "goal"];
  const dailyLimit = $("dailyLimit");
  let userChangedDailyLimit = Boolean(state.profile.hasCompletedSetup);

  dailyLimit.addEventListener("input", () => {
    userChangedDailyLimit = true;
  });

  fields.forEach((id) => {
    $(id).addEventListener("input", () => updateRecommendedDailyLimit(userChangedDailyLimit));
    $(id).addEventListener("change", () => updateRecommendedDailyLimit(userChangedDailyLimit));
  });

  document.querySelectorAll("[data-segment='gender'] button").forEach((button) => {
    button.addEventListener("click", () => setTimeout(() => updateRecommendedDailyLimit(userChangedDailyLimit), 0));
  });

  updateRecommendedDailyLimit(userChangedDailyLimit);
}

function updateRecommendedDailyLimit(keepUserValue = false) {
  const activitySelect = $("activity");
  const profile = {
    gender: $("gender").value,
    age: Number($("age").value),
    height: Number($("height").value),
    weight: Number($("weight").value),
    targetWeight: Number($("targetWeight").value),
    activity: Number(activitySelect.value),
    activityLabel: activitySelect.options[activitySelect.selectedIndex]?.text || "",
    goal: $("goal").value,
    dailyLimit: Number($("dailyLimit").value)
  };
  const targets = calculateTargets(profile);
  state.profile.recommendedCalories = targets.recommendedCalories;
  if (!keepUserValue) {
    $("dailyLimit").value = targets.recommendedCalories;
  }
  renderSetupPreview(profile, targets);
}

function renderSetupPreview(profile, targets) {
  const metricsContainer = $("metrics");
  if (!metricsContainer) return;

  const weightDifference = Number(profile.targetWeight) - Number(profile.weight);
  const weeklyChange = profile.goal === "Отслабване" ? -0.45 : profile.goal === "Покачване" ? 0.3 : 0;
  const weeks = weeklyChange && weightDifference
    ? Math.max(1, Math.ceil(Math.abs(weightDifference / weeklyChange)))
    : 0;
  const directionMatches = (profile.goal === "Отслабване" && weightDifference < 0)
    || (profile.goal === "Покачване" && weightDifference > 0)
    || profile.goal === "Поддържане";

  const liveMetrics = [
    ["BMI", targets.bmi],
    ["Базов метаболизъм", `${targets.bmr} kcal`],
    ["Дневен разход", `${targets.tdee} kcal`],
    ["Препоръчителен прием", `${targets.recommendedCalories} kcal`],
    ["Протеин", `${targets.protein} г`],
    ["Мазнини", `${targets.fat} г`],
    ["Въглехидрати", `${targets.carbs} г`],
    ["Фибри", `${targets.fiber} г`],
    ["Вода", `${targets.water} мл`]
  ];

  if (weeks && directionMatches) {
    liveMetrics.push(["Ориентировъчен срок", `${weeks} седмици`]);
  }

  metricsContainer.innerHTML = liveMetrics.map(([label, value]) => metricHtml(label, value)).join("");
  const summary = $("setupEstimateSummary");
  if (summary) {
    const activity = profile.activityLabel || "избраната активност";
    const pace = profile.goal === "Отслабване"
      ? "около 0.45 кг/седмица"
      : profile.goal === "Покачване"
        ? "около 0.30 кг/седмица"
        : "стабилно тегло";
    summary.textContent = `${activity} активност · ${profile.goal} · ${pace}`;
  }
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
  $("dailyLimit").value = state.profile.dailyLimit || state.profile.recommendedCalories || 1800;
  updateRecommendedDailyLimit(true);
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

function bindPlanActions() {
  $("refreshPlan").addEventListener("click", () => {
    state.aiPlanVariant = Number(state.aiPlanVariant || 0) + 1;
    save("nutriai.aiPlanVariant", state.aiPlanVariant);
    generateAIPlan(true);
  });
}

function renderDashboard() {
  resetWaterIfNeeded();
  updateCurrentDate($("view-dashboard").classList.contains("active"));
  const targets = calculateTargets(state.profile);
  const consumed = consumedToday();
  const totals = macroTotalsToday();
  const recommended = state.profile.recommendedCalories || targets.recommendedCalories;
  const limit = state.profile.dailyLimit || recommended;
  const remaining = Math.round(limit - consumed);
  const calorieRatio = Math.max(consumed / Math.max(limit, 1), 0);
  const percent = Math.min(calorieRatio, 1);
  updateCalorieBackground(calorieRatio);
  $("recommendedCalories").textContent = `Преп. ${recommended} kcal`;
  $("remainingCalories").textContent = `${limit}`;
  $("consumedCalories").textContent = `${Math.round(consumed)}`;
  $("targetCalories").textContent = `${Math.abs(remaining)}`;
  $("targetCaloriesLabel").textContent = remaining < 0 ? "Превишени" : "Оставащи";
  const appleProgress = $("appleProgress");
  const appleColor = percent >= 1 ? "var(--red)" : percent >= 0.7 ? "var(--orange)" : "var(--green)";
  appleProgress.style.stroke = appleColor;
  appleProgress.style.strokeDasharray = `${Math.round(percent * 100)} 100`;
  $("calorieRing").classList.toggle("limit-reached", consumed >= limit);

  $("macroBars").innerHTML = [
    macroCard('<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v16M18 4v16M6 12h12"/></svg>', "Протеин", totals.protein, targets.protein, "var(--orange)"),
    macroCard('<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>', "Въгл.", totals.carbs, targets.carbs, "var(--blue)"),
    macroCard('<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/></svg>', "Мазнини", totals.fat, targets.fat, "var(--yellow)")
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

  renderAIPlan();
  renderGoalSuggestions(targets);
  renderFavorites();
  renderTodayMeals();
  renderProgressCards(targets);
}

function updateCalorieBackground(ratio) {
  const zone = ratio >= 1
    ? "red"
    : ratio >= 0.8
      ? "orange"
      : ratio >= 0.5
        ? "yellow"
        : "green";
  document.documentElement.dataset.calorieZone = zone;
}

async function generateAIPlan(force = false) {
  if (state.aiPlan && !force) {
    renderAIPlan();
    return;
  }

  const targets = calculateTargets(state.profile);
  const variant = Number(state.aiPlanVariant || 0);
  const focus = planFocus(variant);
  state.aiPlan = {
    title: "Генерирам персонален режим...",
    days: [],
    tips: ["Моля, изчакайте няколко секунди."]
  };
  renderAIPlan();

  const prompt = [
    "Създай персонален, безопасен хранителен режим на български.",
    "Профил:",
    `- Пол: ${state.profile.gender}`,
    `- Възраст: ${state.profile.age}`,
    `- Височина: ${state.profile.height} см`,
    `- Тегло: ${state.profile.weight} кг`,
    `- Желано тегло: ${state.profile.targetWeight} кг`,
    `- Активност: ${state.profile.activityLabel}`,
    `- Цел: ${state.profile.goal}`,
    `- Калории: ${state.profile.dailyLimit} kcal`,
    `- Протеини: ${targets.protein} г`,
    `- Мазнини: ${targets.fat} г`,
    `- Въглехидрати: ${targets.carbs} г`,
    `- Фибри: ${targets.fiber} г`,
    `- Вода: ${targets.water} мл`,
    "",
    `Направи различно предложение от предишното. Вариант: ${variant}. Фокус: ${focus}.`,
    "Не препоръчвай опасни диети. Направи кратък, практичен режим за 1 ден с 4 хранения.",
    "Върни само JSON:",
    JSON.stringify({ title: "", days: [{ meal: "", food: "", calories: 0, note: "" }], tips: [] })
  ].join("\n");

  try {
    const data = await callGroq([
      {
        role: "system",
        content: "Ти си експерт нутриционист. Връщай само валиден JSON на български. Всяко ново генериране трябва да е осезаемо различно като храни."
      },
      {
        role: "user",
        content: prompt
      }
    ], true);
    state.aiPlan = normalizePlan(parseGroqJsonLoose(data));
  } catch {
    state.aiPlan = fallbackPlan(targets, variant);
  }

  save("nutriai.aiPlan", state.aiPlan);
  renderAIPlan();
}
function renderAIPlan() {
  const target = $("aiMealPlan");
  if (!target) return;
  const plan = state.aiPlan || fallbackPlan(calculateTargets(state.profile));
  const meals = Array.isArray(plan.days) ? plan.days : [];
  const tips = Array.isArray(plan.tips) ? plan.tips : [];
  target.innerHTML = `
    <div class="plan-heading">${escapeHtml(plan.title || "Персонален хранителен режим")}</div>
    ${meals.map((item) => `
      <div class="plan-item plan-meal">
        <div>
          <strong>${escapeHtml(item.meal || "Хранене")}</strong>
          <span>${escapeHtml(item.food || "")}</span>
          ${item.note ? `<small>${escapeHtml(item.note)}</small>` : ""}
        </div>
        <b>${Math.round(numberFrom(item.calories)) || ""} kcal</b>
      </div>
    `).join("")}
    ${tips.map((tip) => `<div class="plan-item"><span>${escapeHtml(tip)}</span></div>`).join("")}
  `;

  const setupPlan = $("nutritionPlan");
  if (setupPlan && !state.profile.hasCompletedSetup) {
    setupPlan.innerHTML = target.innerHTML;
  }
}

function normalizePlan(raw) {
  return {
    title: String(raw.title || raw.summary || "Персонален хранителен режим"),
    days: Array.isArray(raw.days) ? raw.days.map((item) => ({
      meal: String(item.meal || item.name || "Хранене"),
      food: String(item.food || item.description || ""),
      calories: numberFrom(item.calories ?? item.kcal),
      note: String(item.note || "")
    })) : [],
    tips: Array.isArray(raw.tips) ? raw.tips.map(String) : []
  };
}

function fallbackPlan(targets, variant = Number(state.aiPlanVariant || 0)) {
  const variants = [
    {
      title: `Баланс за ${state.profile.goal.toLowerCase()} • ${state.profile.dailyLimit} kcal`,
      days: [
        { meal: "Закуска", food: "Кисело мляко с овес, горски плодове и малко ядки", calories: Math.round(state.profile.dailyLimit * 0.25), note: "Протеин + бавни въглехидрати" },
        { meal: "Обяд", food: "Пилешко или тофу със салата и ориз/картофи", calories: Math.round(state.profile.dailyLimit * 0.35), note: "Основно хранене с фибри" },
        { meal: "Следобед", food: "Плод с извара или протеиново кисело мляко", calories: Math.round(state.profile.dailyLimit * 0.15), note: "Лека закуска" },
        { meal: "Вечеря", food: "Риба, яйца или бобови със зеленчуци", calories: Math.round(state.profile.dailyLimit * 0.25), note: "По-лека вечеря" }
      ]
    },
    {
      title: `Средиземноморски вариант • ${state.profile.dailyLimit} kcal`,
      days: [
        { meal: "Закуска", food: "Омлет със зеленчуци и филия пълнозърнест хляб", calories: Math.round(state.profile.dailyLimit * 0.25), note: "Засищащо начало" },
        { meal: "Обяд", food: "Риба тон/сьомга със салата, нахут и лимонов дресинг", calories: Math.round(state.profile.dailyLimit * 0.35), note: "Повече омега мазнини" },
        { meal: "Следобед", food: "Ябълка и шепа сурови ядки", calories: Math.round(state.profile.dailyLimit * 0.15), note: "Контролирана порция" },
        { meal: "Вечеря", food: "Пуешко, пилешко или леща със задушени зеленчуци", calories: Math.round(state.profile.dailyLimit * 0.25), note: "Протеин и фибри" }
      ]
    },
    {
      title: `Бърз практичен режим • ${state.profile.dailyLimit} kcal`,
      days: [
        { meal: "Закуска", food: "Протеинов шейк или скир с банан", calories: Math.round(state.profile.dailyLimit * 0.24), note: "Лесно за натоварен ден" },
        { meal: "Обяд", food: "Купа с пилешко/боб, зеленчуци и булгур", calories: Math.round(state.profile.dailyLimit * 0.36), note: "Може да се подготви предварително" },
        { meal: "Следобед", food: "Моркови, хумус и плод", calories: Math.round(state.profile.dailyLimit * 0.15), note: "Фибри без тежест" },
        { meal: "Вечеря", food: "Извара/яйца или тофу със салата", calories: Math.round(state.profile.dailyLimit * 0.25), note: "Лека и богата на протеин" }
      ]
    }
  ];

  const plan = variants[Math.abs(variant) % variants.length];
  return {
    ...plan,
    tips: [
      `Цел протеин: около ${targets.protein} г дневно.`,
      `Пий около ${targets.water} мл вода дневно.`,
      goalPaceText()
    ]
  };
}

function planFocus(variant) {
  return ["повече протеин", "по-бързи храни за приготвяне", "средиземноморски стил", "по-бюджетни продукти"][Math.abs(variant) % 4];
}

function goalPaceText() {
  const diff = Number(state.profile.weight) - Number(state.profile.targetWeight);
  if (Math.abs(diff) < 1) return "Поддържай теглото със стабилни порции и редовно движение.";
  if (diff > 0) return "Здравословна цел е около 0.3-0.7 кг надолу седмично.";
  return "Здравословна цел е около 0.2-0.5 кг нагоре седмично.";
}

function renderGoalSuggestions(targets) {
  const target = $("goalSuggestions");
  if (!target) return;
  const limit = state.profile.dailyLimit || targets.recommendedCalories;
  const diff = Number(state.profile.weight) - Number(state.profile.targetWeight);
  const direction = Math.abs(diff) < 1 ? "поддържане" : diff > 0 ? "отслабване" : "покачване";
  const pace = Math.abs(diff) < 1 ? "стабилно тегло" : diff > 0 ? "0.3-0.7 кг надолу седмично" : "0.2-0.5 кг нагоре седмично";
  const remainingKg = Math.abs(diff).toFixed(1).replace(".0", "");
  const weeks = Math.max(2, Math.ceil(Math.abs(diff) / (diff > 0 ? 0.5 : 0.35)));
  const timeline = Math.abs(diff) < 1 ? "следи средната стойност 2-3 седмици" : `ориентир: ${weeks} седмици`;

  target.innerHTML = [
    goalItem("Посока", direction),
    goalItem("Калории", `около ${limit} kcal дневно`),
    goalItem("Темпо", pace),
    goalItem("До целта", Math.abs(diff) < 1 ? "целта е почти достигната" : `около ${remainingKg} кг • ${timeline}`),
    goalItem("Протеин", `около ${targets.protein} г дневно`),
    goalItem("Вода", `около ${targets.water} мл дневно`)
  ].join("");
}

function goalItem(label, value) {
  return `<div class="goal-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}
function metricHtml(label, value) {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

function macroCard(icon, title, current, target, color) {
  const percent = Math.min(Number(current || 0) / Math.max(Number(target || 1), 1), 1);
  return `
    <div class="macro-card">
      <span class="macro-icon">${icon}</span>
      <small>${escapeHtml(title)}</small>
      <div class="macro-bar"><span style="width:${percent * 100}%;background:${color}"></span></div>
      <strong>${Math.round(current || 0)} / ${Math.round(target || 0)}g</strong>
    </div>
  `;
}

function macroTotalsToday() {
  const today = new Date().toDateString();
  return state.meals
    .filter((meal) => new Date(meal.date).toDateString() === today)
    .reduce((sum, meal) => {
      const nutrition = nutritionFromMeal(meal);
      sum.protein += nutrition.protein;
      sum.carbs += nutrition.carbs;
      sum.fat += nutrition.fat;
      sum.fiber += nutrition.fiber;
      return sum;
    }, { protein: 0, carbs: 0, fat: 0, fiber: 0 });
}

function nutritionFromMeal(meal) {
  const analysis = meal?.analysis || {};
  const foods = Array.isArray(analysis.foods) ? analysis.foods : [];
  const foodTotals = foods.reduce((sum, food) => {
    sum.protein += nutritionNumber(food.protein);
    sum.carbs += nutritionNumber(food.carbs);
    sum.fat += nutritionNumber(food.fat);
    sum.fiber += nutritionNumber(food.fiber);
    return sum;
  }, { protein: 0, carbs: 0, fat: 0, fiber: 0 });
  return {
    protein: nutritionNumber(analysis.protein ?? analysis.proteins) || foodTotals.protein,
    carbs: nutritionNumber(analysis.carbs ?? analysis.carbohydrates) || foodTotals.carbs,
    fat: nutritionNumber(analysis.fat ?? analysis.fats) || foodTotals.fat,
    fiber: nutritionNumber(analysis.fiber ?? analysis.fibre) || foodTotals.fiber
  };
}

function nutritionNumber(value) {
  const number = Number(String(value ?? 0).replace(",", "."));
  return Number.isFinite(number) ? number : 0;
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
    progressCard('<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14a8 8 0 0 1 16 0"/><path d="M12 14l4-3"/><circle cx="12" cy="14" r="1.6"/></svg>', "BMI Индекс", targets.bmi, bmiCategory, getBMIColor(targets.bmi)),
    progressCard('<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>', "BMR", targets.bmr, "kcal / ден", "var(--orange)"),
    progressCard('<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h7l-1 8 10-12h-7z"/></svg>', "TDEE", targets.tdee, "kcal / ден", "var(--blue)")
  ].join("");
  $("weightGoalLabel").textContent = `Цел: ${state.profile.targetWeight} кг`;
  renderWeekProgress();
}

function progressCard(icon, title, value, desc, color) {
  return `<div class="progress-mini-card"><b>${icon}</b><small>${escapeHtml(title)}</small><strong style="color:${color}">${escapeHtml(value)}</strong><span>${escapeHtml(desc)}</span></div>`;
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
  $("foodImage").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    state.selectedImageDataUrl = await fileToDataUrl(file);
    selectMealTypeByTime(new Date());
    $("preview").src = state.selectedImageDataUrl;
    $("preview").style.display = "block";
    $("photoPlaceholder").style.display = "none";
    $("analysisPanel").classList.add("hidden");
    $("foodScanOverlay").classList.add("hidden");
    $("foodScanOverlay").innerHTML = "";
    $("photoFrame").classList.remove("has-scan-results");
  });

  $("analyzeButton").addEventListener("click", analyzeFood);
  $("saveMeal").addEventListener("click", saveAnalyzedMeal);
  $("toggleAnalysisFavorite")?.addEventListener("click", toggleAnalysisFavorite);
  $("clearAnalysis").addEventListener("click", clearCameraAnalysis);
  $("foodScanOverlay").addEventListener("click", handleDetectedFoodAdd);
}


function bindManualMeal() {
  $("manualMealForm")?.addEventListener("submit", saveManualMeal);
}

async function saveManualMeal(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type='submit']");
  const name = $("manualName").value.trim();
  const grams = numberFromField("manualGrams");
  const nutrition = getManualNutritionValues();
  const calories = nutrition.calories;

  if (!name || calories === null) {
    $("manualMealStatus").textContent = "Въведи име и калории.";
    return;
  }

  const meal = {
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
    title: name,
    mealType: $("mealType").value,
    image: "",
    quantityGrams: grams || 0,
    analysis: {
      totalCalories: calories,
      protein: nutrition.protein,
      carbs: nutrition.carbs,
      fat: nutrition.fat,
      fiber: nutrition.fiber,
      rating: grams ? grams + " г · ръчно добавено" : "Ръчно добавено",
      foods: [{
        name,
        grams: grams || 0,
        calories,
        protein: nutrition.protein,
        carbs: nutrition.carbs,
        fat: nutrition.fat,
        fiber: nutrition.fiber
      }],
      reason: "Хранителните стойности са въведени ръчно."
    }
  };

  button.disabled = true;
  $("manualMealStatus").textContent = "Запазвам в дневника...";
  state.meals.unshift(meal);

  try {
    await save("nutriai.meals", state.meals);
    if ($("saveAsFavorite")?.checked) await addCurrentFavorite(name, grams, nutrition);
    renderAll();
    form.reset();
    $("manualMealStatus").textContent = name + " е добавен към дневника.";
    document.querySelector('.tab[data-view="dashboard"]')?.click();
  } catch (error) {
    state.meals = state.meals.filter((item) => item.id !== meal.id);
    $("manualMealStatus").textContent = "Не успях да запазя храната. Опитай отново.";
    console.error(error);
  } finally {
    button.disabled = false;
  }
}

function numberFromField(id) {
  const value = $(id).value.trim();
  if (value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

async function saveAnalyzedMeal() {
  if (!state.lastAnalysis) {
    $("analysisStatus").textContent = "Първо анализирай снимката.";
    return;
  }

  const button = $("saveMeal");
  button.disabled = true;
  $("analysisStatus").textContent = "Запазвам в дневника...";

  const title = state.lastAnalysis.foods?.[0]?.name || "Хранене";
  const meal = {
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
    title,
    mealType: $("mealType").value,
    image: state.selectedImageDataUrl,
    analysis: structuredClone(state.lastAnalysis)
  };

  state.meals.unshift(meal);

  try {
    await save("nutriai.meals", state.meals);
    renderAll();
    $("analysisStatus").textContent = "Храненето е добавено към дневника.";
    document.querySelector('.tab[data-view="dashboard"]')?.click();
  } catch (error) {
    state.meals = state.meals.filter((item) => item.id !== meal.id);
    $("analysisStatus").textContent = "Не успях да запазя храненето. Опитай отново.";
    console.error(error);
  } finally {
    button.disabled = false;
  }
}

async function analyzeFood() {
  if (!canUseServerProxy() && !state.apiKey) {
    $("analysisStatus").textContent = "AI анализът работи автоматично през Vercel, когато е настроен GROQ_API_KEY.";
    return;
  }
  if (!state.selectedImageDataUrl) {
    $("analysisStatus").textContent = "Избери или снимай храна.";
    return;
  }

  $("analysisStatus").textContent = "Анализирам снимката...";
  $("clearAnalysis").classList.remove("hidden");
  $("analyzeButton").disabled = true;

  const remaining = state.profile.dailyLimit - consumedToday();
  const prompt = `Ти си професионален AI диетолог и нутриционист.
Получаваш снимка на храна. Разпознай всички храни, оцени приблизителните грамове, калории, протеини, въглехидрати, мазнини и фибри.
Профил: пол ${state.profile.gender}, възраст ${state.profile.age}, височина ${state.profile.height} см, тегло ${state.profile.weight} кг, желано тегло ${state.profile.targetWeight} кг, активност ${state.profile.activityLabel}, цел ${state.profile.goal}, дневен калориен лимит ${state.profile.dailyLimit}.
Оставащи калории преди това хранене: ${Math.round(remaining)}.
Оцени полезността на цялото хранене с healthScore от 0 до 100, където 0 е много вредно, а 100 е много полезно. В healthLevel върни точно една от стойностите: "Много вредна", "По-скоро вредна", "Умерена", "По-скоро полезна", "Много полезна". Вземи предвид степента на преработка, захарта, солта, наситените мазнини, протеина, фибрите, зеленчуците и размера на порцията.
Не измисляй факти. Ако количеството не е сигурно, отбележи, че е ориентировъчна оценка.
Върни само JSON със структура:
{"foods":[{"name":"","estimatedGrams":0,"calories":0,"protein":0,"carbs":0,"fat":0,"fiber":0,"confidenceNote":""}],"totalCalories":0,"protein":0,"carbs":0,"fat":0,"fiber":0,"healthScore":0,"healthLevel":"","rating":"","reason":"","remainingCalories":0,"recommendation":""}
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
    renderFoodScanOverlay(state.lastAnalysis);
    renderAnalysisFavoriteButton();
    populateAnalysisCorrection();
    $("analysisPanel").classList.remove("hidden");
    $("analysisStatus").textContent = "Готово.";
    showCalorieMascot(state.lastAnalysis.totalCalories);
  } catch (error) {
    $("analysisStatus").textContent = error.message;
  } finally {
    $("analyzeButton").disabled = false;
  }
}

function renderAnalysisSummary(analysis) {
  $("analysisCalories").textContent = `${Math.round(analysis.totalCalories || 0)} kcal`;
  const health = getHealthRating(analysis);
  const panel = $("analysisPanel");
  panel.classList.remove("health-very-bad", "health-bad", "health-medium", "health-good", "health-great");
  panel.classList.add(health.className);

  const foodsHtml = analysis.foods?.length
    ? `<div class="food-list">${analysis.foods.map(foodItemHtml).join("")}</div>`
    : `<div class="empty-copy">Не са разпознати конкретни храни. Опитайте с по-ясна снимка.</div>`;
  $("analysisSummary").innerHTML = `
    <div class="health-rating ${health.className}">
      <span class="health-dot"></span>
      <div><small>Оценка за полезност</small><strong>${escapeHtml(health.label)}</strong></div>
      <b>${health.score}/100</b>
    </div>
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

function getHealthRating(analysis) {
  let score = Number(analysis.healthScore);
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    const calories = Math.max(1, Number(analysis.totalCalories) || 1);
    const protein = Number(analysis.protein) || 0;
    const fiber = Number(analysis.fiber) || 0;
    const fat = Number(analysis.fat) || 0;
    score = 55 + Math.min(18, protein * 0.6) + Math.min(15, fiber * 2.5) - Math.min(20, fat * 0.5) - Math.max(0, calories - 700) / 35;
  }
  score = Math.round(Math.max(0, Math.min(100, score)));
  if (score < 20) return { score, label: "Много вредна", className: "health-very-bad" };
  if (score < 40) return { score, label: "По-скоро вредна", className: "health-bad" };
  if (score < 60) return { score, label: "Умерена", className: "health-medium" };
  if (score < 80) return { score, label: "По-скоро полезна", className: "health-good" };
  return { score, label: "Много полезна", className: "health-great" };
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
    model: "qwen/qwen3.6-27b",
    messages,
    temperature: 0.2,
    max_completion_tokens: 1400,
    top_p: 1,
    stream: false
  };
  if (jsonMode) {
    body.response_format = { type: "json_object" };
  }

  const useProxy = canUseServerProxy() && !state.apiKey;
  const endpoint = useProxy ? "/api/groq" : "https://api.groq.com/openai/v1/chat/completions";
  const headers = {
    "Content-Type": "application/json"
  };
  if (!useProxy) {
    if (!state.apiKey) {
      throw new Error("Липсва Groq ключ. Във Vercel добави Environment Variable GROQ_API_KEY.");
    }
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

function canUseServerProxy() {
  return Boolean(location.hostname) && !location.hostname.endsWith("github.io") && location.hostname !== "localhost" && location.hostname !== "127.0.0.1";
}

function parseGroqJson(data) {
  return normalizeAnalysis(parseGroqJsonLoose(data));
}

function parseGroqJsonLoose(data) {
  const text = data.choices?.[0]?.message?.content || "";
  if (!text.trim()) throw new Error("AI не върна текстов резултат.");
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");
  return JSON.parse(cleaned);
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
  let meals = state.meals;
  if (state.historyDate) {
    meals = meals.filter((meal) => localDateKey(new Date(meal.date)) === state.historyDate);
  }
  if (!meals.length) {
    $("mealHistory").innerHTML = `<div class="empty-copy">Няма запазени хранения за избрания период.</div>`;
    renderWeeklyStats();
    return;
  }
  $("mealHistory").innerHTML = meals.map((meal) => mealRowHtml(meal, true)).join("");
  renderWeeklyStats();
}

function mealRowHtml(meal, includeDate = false) {
  const time = includeDate ? new Date(meal.date).toLocaleString("bg-BG") : new Date(meal.date).toLocaleTimeString("bg-BG", { hour: "2-digit", minute: "2-digit" });
  const mealType = mealTypeLabel(meal.mealType);
  const health = getHealthRating(meal.analysis || {});
  const nutrition = nutritionFromMeal(meal);
  const favorite = findFavoriteByName(meal.title);
  const favoriteButton = '<button type="button" class="icon-action favorite-toggle ' + (favorite ? 'active' : '') + '" data-toggle-meal-favorite="' + escapeHtml(meal.id) + '" title="' + (favorite ? 'Премахни от любими' : 'Добави в любими') + '" aria-label="' + (favorite ? 'Премахни от любими' : 'Добави в любими') + '">' + (favorite ? '♥' : '♡') + '</button>';
  return '<div class="meal-row meal-health ' + health.className + '" data-meal-id="' + escapeHtml(meal.id) + '">' +
    mealImageHtml(meal) +
    '<div class="meal-row-main">' +
      '<strong>' + mealTypeIcon(meal.mealType) + ' ' + escapeHtml(meal.title) + '</strong>' +
      '<p>' + escapeHtml(time) + ' • ' + escapeHtml(mealType) + '</p>' +
      '<div class="meal-macro-summary" aria-label="Макронутриенти">' +
        '<span class="macro-protein">П ' + round(nutrition.protein, 1) + ' г</span>' +
        '<span class="macro-carbs">В ' + round(nutrition.carbs, 1) + ' г</span>' +
        '<span class="macro-fat">М ' + round(nutrition.fat, 1) + ' г</span>' +
      '</div>' +
    '</div>' +
    '<div class="meal-row-side">' +
      '<strong>+' + Math.round(meal.analysis.totalCalories || 0) + ' kcal</strong>' +
      '<div class="meal-actions">' + favoriteButton +
        '<button type="button" class="icon-action" data-edit-meal="' + escapeHtml(meal.id) + '" title="Редактирай" aria-label="Редактирай">✎</button>' +
        '<button type="button" class="icon-action danger" data-delete-meal="' + escapeHtml(meal.id) + '" title="Изтрий" aria-label="Изтрий">×</button>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function mealImageHtml(meal) {
  if (!meal.image || !String(meal.image).startsWith("data:image/")) {
    return '<div class="meal-thumb meal-thumb-placeholder" aria-hidden="true">🍽</div>';
  }
  return '<img class="meal-thumb" src="' + meal.image + '" alt="Запазена снимка на хранене">';
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
    if (!canUseServerProxy() && !state.apiKey) {
      alert("AI чатът работи автоматично през Vercel, когато е настроен GROQ_API_KEY.");
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


function bindEnhancedFeatures() {
  $("mealHistory")?.addEventListener("click", handleMealHistoryAction);
  $("todayMeals")?.addEventListener("click", handleMealHistoryAction);
  $("mealEditForm")?.addEventListener("submit", saveMealEdit);
  $("cancelMealEdit")?.addEventListener("click", () => $("mealEditor").close());
  $("favoriteEditForm")?.addEventListener("submit", saveFavoriteEdit);
  $("cancelFavoriteEdit")?.addEventListener("click", () => $("favoriteEditor").close());

  $("historyDate")?.addEventListener("change", (event) => {
    state.historyDate = event.target.value;
    renderHistory();
  });
  $("showAllHistory")?.addEventListener("click", () => {
    state.historyDate = "";
    $("historyDate").value = "";
    renderHistory();
  });

  ["manualGrams", "manualCalories", "manualProtein", "manualCarbs", "manualFat", "manualFiber", "manualPer100"].forEach((id) => {
    $(id)?.addEventListener("input", updateManualNutritionPreview);
    $(id)?.addEventListener("change", updateManualNutritionPreview);
  });

  $("dashboardFavorites")?.addEventListener("click", handleDashboardFavorite);
  $("foodSearchForm")?.addEventListener("submit", searchWorldFoods);
  $("foodSearchResults")?.addEventListener("click", selectWorldFood);
  $("lookupBarcode")?.addEventListener("click", () => lookupBarcodeProduct($("barcodeValue").value.trim()));
  $("startBarcodeScanner")?.addEventListener("click", startLiveBarcodeScanner);
  $("closeBarcodeScanner")?.addEventListener("click", stopLiveBarcodeScanner);
  $("clearManualFood")?.addEventListener("click", clearManualFoodData);
  $("barcodeImage")?.addEventListener("change", scanBarcodeImage);
  $("applyAnalysisCorrection")?.addEventListener("click", applyAnalysisCorrection);
  $("exportData")?.addEventListener("click", exportNutriData);
  $("importData")?.addEventListener("change", importNutriData);
  $("saveReminders")?.addEventListener("click", saveReminderSettings);
  $("previousWeek")?.addEventListener("click", () => { state.progressWeekOffset -= 1; renderWeekProgress(); });
  $("nextWeek")?.addEventListener("click", () => { state.progressWeekOffset += 1; renderWeekProgress(); });
  $("currentWeek")?.addEventListener("click", () => { state.progressWeekOffset = 0; renderWeekProgress(); });

  hydrateReminderForm();
  renderFavorites();
  updateManualNutritionPreview();
  startReminderChecks();
}

function getManualNutritionValues() {
  const grams = numberFromField("manualGrams");
  const per100 = Boolean($("manualPer100")?.checked);
  const factor = per100 && grams !== null ? grams / 100 : 1;
  const scaled = (id) => Math.round(((numberFromField(id) || 0) * factor) * 10) / 10;
  return {
    calories: numberFromField("manualCalories") === null ? null : Math.round(numberFromField("manualCalories") * factor),
    protein: scaled("manualProtein"),
    carbs: scaled("manualCarbs"),
    fat: scaled("manualFat"),
    fiber: scaled("manualFiber")
  };
}

function updateManualNutritionPreview() {
  const values = getManualNutritionValues();
  const preview = $("manualNutritionPreview");
  if (!preview) return;
  if (values.calories === null) {
    preview.textContent = "Въведи количество и стойности.";
    return;
  }
  preview.textContent = `За порцията: ${values.calories} kcal · П ${values.protein} г · В ${values.carbs} г · М ${values.fat} г`;
}

async function addCurrentFavorite(name, grams, portionNutrition) {
  const favorite = {
    id: crypto.randomUUID(),
    name,
    grams: grams || 0,
    per100: Boolean($("manualPer100")?.checked),
    calories: numberFromField("manualCalories") || 0,
    protein: numberFromField("manualProtein") || 0,
    carbs: numberFromField("manualCarbs") || 0,
    fat: numberFromField("manualFat") || 0,
    fiber: numberFromField("manualFiber") || 0,
    portionNutrition: {
      calories: nutritionNumber(portionNutrition?.calories),
      protein: nutritionNumber(portionNutrition?.protein),
      carbs: nutritionNumber(portionNutrition?.carbs),
      fat: nutritionNumber(portionNutrition?.fat),
      fiber: nutritionNumber(portionNutrition?.fiber)
    }
  };
  const existing = state.favorites.findIndex((item) => item.name.toLowerCase() === name.toLowerCase());
  if (existing >= 0) state.favorites[existing] = { ...favorite, id: state.favorites[existing].id, image: favorite.image || state.favorites[existing].image || "" };
  else state.favorites.unshift(favorite);
  await save("nutriai.favorites", state.favorites);
  renderFavorites();
}

function renderFavorites() {
  const dashboard = $("dashboardFavorites");
  if (!dashboard) return;
  if (!state.favorites.length) {
    dashboard.innerHTML = '<div class="empty-copy">Все още нямате любими храни. Добавете продукт от AI снимка, от днешните хранения или чрез ръчно въвеждане.</div>';
    return;
  }
  dashboard.innerHTML = state.favorites.map((item) => {
    const nutrition = favoritePortionNutrition(item);
    const portion = item.per100 ? `${item.grams || 100} г` : (item.grams ? `${item.grams} г` : "1 порция");
    return `
      <div class="dashboard-favorite-row">
        ${favoriteImageHtml(item)}
        <div class="favorite-food-main">
          <strong>${escapeHtml(item.name)}</strong>
          <span>${escapeHtml(portion)} · ${nutrition.calories} kcal</span>
          <div class="favorite-macro-line"><b>П ${round(nutrition.protein, 1)} г</b><b>В ${round(nutrition.carbs, 1)} г</b><b>М ${round(nutrition.fat, 1)} г</b></div>
        </div>
        <button type="button" class="favorite-add-button" data-add-favorite="${escapeHtml(item.id)}" title="Добави към днешните калории">＋ Добави</button>
        <button type="button" class="icon-action" data-edit-favorite="${escapeHtml(item.id)}" title="Коригирай любимата храна" aria-label="Коригирай любимата храна">✎</button>
        <button type="button" class="icon-action danger" data-delete-favorite="${escapeHtml(item.id)}" title="Премахни от любими" aria-label="Премахни от любими">×</button>
      </div>`;
  }).join("");
}

function favoritePortionNutrition(item) {
  const grams = Number(item.grams) || (item.per100 ? 100 : 0);
  const factor = item.per100 ? grams / 100 : 1;
  const savedPortion = item.portionNutrition || item.nutrition || item.analysis || null;
  if (savedPortion) {
    return {
      grams,
      calories: Math.round(nutritionNumber(savedPortion.calories ?? savedPortion.totalCalories)),
      protein: round(nutritionNumber(savedPortion.protein ?? savedPortion.proteins), 1),
      carbs: round(nutritionNumber(savedPortion.carbs ?? savedPortion.carbohydrates), 1),
      fat: round(nutritionNumber(savedPortion.fat ?? savedPortion.fats), 1),
      fiber: round(nutritionNumber(savedPortion.fiber ?? savedPortion.fibre), 1)
    };
  }
  const directNutrition = {
    grams,
    calories: Math.round(nutritionNumber(item.calories) * factor),
    protein: round(nutritionNumber(item.protein ?? item.proteins) * factor, 1),
    carbs: round(nutritionNumber(item.carbs ?? item.carbohydrates) * factor, 1),
    fat: round(nutritionNumber(item.fat ?? item.fats) * factor, 1),
    fiber: round(nutritionNumber(item.fiber ?? item.fibre) * factor, 1)
  };
  if (directNutrition.protein || directNutrition.carbs || directNutrition.fat || directNutrition.fiber) {
    return directNutrition;
  }

  const matchingMeal = state.meals.find((meal) =>
    String(meal.title || "").toLowerCase() === String(item.name || "").toLowerCase()
  );
  if (!matchingMeal) return directNutrition;
  const mealNutrition = nutritionFromMeal(matchingMeal);
  if (!mealNutrition.protein && !mealNutrition.carbs && !mealNutrition.fat && !mealNutrition.fiber) {
    return directNutrition;
  }
  return {
    grams: Number(matchingMeal.quantityGrams) || grams,
    calories: Math.round(nutritionNumber(matchingMeal.analysis?.totalCalories) || directNutrition.calories),
    ...mealNutrition
  };
}

async function handleDashboardFavorite(event) {
  const addId = event.target.dataset.addFavorite;
  const editId = event.target.dataset.editFavorite;
  const deleteId = event.target.dataset.deleteFavorite;
  if (addId) await addFavoriteToToday(addId, event.target);
  if (editId) openFavoriteEditor(editId);
  if (deleteId) await deleteFavorite(deleteId);
}

async function addFavoriteToToday(id, button) {
  const item = state.favorites.find((favorite) => favorite.id === id);
  if (!item) return;
  button.disabled = true;
  let nutrition = favoritePortionNutrition(item);
  let estimatedByAI = false;
  if (!hasMacroNutrition(nutrition)) {
    $("favoriteQuickStatus").textContent = `Допълвам хранителните стойности за ${item.name}...`;
    try {
      nutrition = await estimateFavoriteNutrition(item, nutrition);
      estimatedByAI = true;
      item.grams = nutrition.grams || item.grams;
      item.portionNutrition = {
        calories: nutrition.calories,
        protein: nutrition.protein,
        carbs: nutrition.carbs,
        fat: nutrition.fat,
        fiber: nutrition.fiber
      };
      await save("nutriai.favorites", state.favorites);
    } catch (error) {
      $("favoriteQuickStatus").textContent = "Липсват протеин, въглехидрати и мазнини. Отворете „Нова“ и попълнете стойностите или изберете продукт от световната база.";
      button.disabled = false;
      return;
    }
  }
  const meal = {
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
    title: item.name,
    mealType: mealTypeForTime(new Date()),
    image: item.image || "",
    quantityGrams: nutrition.grams,
    analysis: {
      totalCalories: nutrition.calories,
      protein: nutrition.protein,
      carbs: nutrition.carbs,
      fat: nutrition.fat,
      fiber: nutrition.fiber,
      rating: estimatedByAI ? "Ориентировъчна AI оценка" : "Добавено от любими",
      foods: [{
        name: item.name,
        grams: nutrition.grams,
        calories: nutrition.calories,
        protein: nutrition.protein,
        carbs: nutrition.carbs,
        fat: nutrition.fat,
        fiber: nutrition.fiber
      }],
      reason: estimatedByAI
        ? "Липсващите хранителни стойности са попълнени ориентировъчно от AI."
        : "Запазена любима храна."
    }
  };
  state.meals.unshift(meal);
  try {
    await save("nutriai.meals", state.meals);
    renderAll();
    renderFavorites();
    $("favoriteQuickStatus").textContent = estimatedByAI
      ? `${item.name} е добавена. Макронутриентите са ориентировъчна AI оценка.`
      : `${item.name} е добавена към днешните калории.`;
  } catch (error) {
    state.meals = state.meals.filter((savedMeal) => savedMeal.id !== meal.id);
    $("favoriteQuickStatus").textContent = "Храната не можа да бъде добавена. Опитайте отново.";
  } finally {
    button.disabled = false;
  }
}

function hasMacroNutrition(nutrition) {
  return nutritionNumber(nutrition?.protein) > 0
    || nutritionNumber(nutrition?.carbs) > 0
    || nutritionNumber(nutrition?.fat) > 0
    || nutritionNumber(nutrition?.fiber) > 0;
}

async function estimateFavoriteNutrition(item, currentNutrition) {
  const grams = nutritionNumber(currentNutrition?.grams) || nutritionNumber(item.grams) || 100;
  const statedCalories = nutritionNumber(currentNutrition?.calories) || nutritionNumber(item.calories);
  const data = await callGroq([
    {
      role: "system",
      content: "Ти си нутриционист. Връщай само валиден JSON. Оценките трябва да са реалистични, но ясно ориентировъчни."
    },
    {
      role: "user",
      content: `Оцени хранителните стойности за цялата порция: храна „${item.name}", количество ${grams} г, записани калории ${statedCalories || "неизвестни"}. Ако записаните калории са очевидно несъвместими с храната и порцията, използвай по-реалистична ориентировъчна стойност. Върни точно: {"calories":0,"protein":0,"carbs":0,"fat":0,"fiber":0}`
    }
  ], true);
  const result = parseGroqJsonLoose(data);
  const nutrition = {
    grams,
    calories: Math.round(nutritionNumber(result.calories ?? result.totalCalories)),
    protein: round(nutritionNumber(result.protein ?? result.proteins), 1),
    carbs: round(nutritionNumber(result.carbs ?? result.carbohydrates), 1),
    fat: round(nutritionNumber(result.fat ?? result.fats), 1),
    fiber: round(nutritionNumber(result.fiber ?? result.fibre), 1)
  };
  if (!nutrition.calories || !hasMacroNutrition(nutrition)) {
    throw new Error("AI не върна достатъчно хранителни стойности.");
  }
  return nutrition;
}

async function deleteFavorite(id) {
  const item = state.favorites.find((favorite) => favorite.id === id);
  if (!item || !confirm(`Да премахна ли „${item.name}“ от любими?`)) return;
  state.favorites = state.favorites.filter((favorite) => favorite.id !== id);
  await save("nutriai.favorites", state.favorites);
  renderFavorites();
}

function handleMealHistoryAction(event) {
  const favoriteMealId = event.target.dataset.toggleMealFavorite;
  if (favoriteMealId) { toggleMealFavorite(favoriteMealId); return; }
  const editId = event.target.dataset.editMeal;
  const deleteId = event.target.dataset.deleteMeal;
  if (editId) openMealEditor(editId);
  if (deleteId) deleteMeal(deleteId);
}

function openMealEditor(id) {
  const meal = state.meals.find((item) => item.id === id);
  if (!meal) return;
  $("editMealId").value = meal.id;
  $("editMealName").value = meal.title;
  $("editMealDate").value = toLocalDateTimeInput(new Date(meal.date));
  $("editMealCalories").value = meal.analysis.totalCalories || 0;
  $("editMealProtein").value = meal.analysis.protein || 0;
  $("editMealCarbs").value = meal.analysis.carbs || 0;
  $("editMealFat").value = meal.analysis.fat || 0;
  $("editMealFiber").value = meal.analysis.fiber || 0;
  $("mealEditor").showModal();
}

async function saveMealEdit(event) {
  event.preventDefault();
  const meal = state.meals.find((item) => item.id === $("editMealId").value);
  if (!meal) return;
  meal.title = $("editMealName").value.trim() || meal.title;
  meal.date = new Date($("editMealDate").value).toISOString();
  meal.analysis.totalCalories = Number($("editMealCalories").value) || 0;
  meal.analysis.protein = Number($("editMealProtein").value) || 0;
  meal.analysis.carbs = Number($("editMealCarbs").value) || 0;
  meal.analysis.fat = Number($("editMealFat").value) || 0;
  meal.analysis.fiber = Number($("editMealFiber").value) || 0;
  meal.analysis.rating = "Коригирано ръчно";
  delete meal.analysis.healthScore;
  await save("nutriai.meals", state.meals);
  $("mealEditor").close();
  renderAll();
}

async function deleteMeal(id) {
  if (!confirm("Да изтрия ли това хранене?")) return;
  state.meals = state.meals.filter((item) => item.id !== id);
  await save("nutriai.meals", state.meals);
  renderAll();
}

function toLocalDateTimeInput(date) {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 16);
}

function localDateKey(date) {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 10);
}

function renderWeeklyStats() {
  const container = $("weeklyStats");
  if (!container) return;
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - 6);
  const recent = state.meals.filter((meal) => new Date(meal.date) >= since);
  const totalCalories = recent.reduce((sum, meal) => sum + Number(meal.analysis.totalCalories || 0), 0);
  const totalProtein = recent.reduce((sum, meal) => sum + Number(meal.analysis.protein || 0), 0);
  const days = new Set(recent.map((meal) => localDateKey(new Date(meal.date)))).size || 1;
  const withinGoal = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(since);
    day.setDate(since.getDate() + index);
    const calories = recent.filter((meal) => localDateKey(new Date(meal.date)) === localDateKey(day))
      .reduce((sum, meal) => sum + Number(meal.analysis.totalCalories || 0), 0);
    return calories > 0 && calories <= state.profile.dailyLimit;
  }).filter(Boolean).length;
  container.innerHTML = `
    <div><strong>${Math.round(totalCalories / days)}</strong><span>средно kcal</span></div>
    <div><strong>${Math.round(totalProtein / days)} г</strong><span>средно протеин</span></div>
    <div><strong>${withinGoal}/7</strong><span>дни в целта</span></div>
  `;
}


async function lookupBarcodeProduct(code) {
  const status = $("barcodeStatus");
  if (!code) {
    status.textContent = "Въведи или снимай баркод.";
    return;
  }
  status.textContent = "Търся продукта...";
  try {
    const data = await fetchFoodDatabase({ barcode: code });
    if (!data.product) throw new Error("Продуктът не е намерен.");
    const product = data.product;
    const nutrients = product.nutriments || {};
    $("manualName").value = product.product_name_bg || product.product_name || product.generic_name || "Продукт";
    $("manualPer100").checked = true;
    $("manualCalories").value = Math.round(Number(nutrients["energy-kcal_100g"]) || 0);
    $("manualProtein").value = Number(nutrients.proteins_100g) || 0;
    $("manualCarbs").value = Number(nutrients.carbohydrates_100g) || 0;
    $("manualFat").value = Number(nutrients.fat_100g) || 0;
    $("manualFiber").value = Number(nutrients.fiber_100g) || 0;
    updateManualNutritionPreview();
    status.textContent = "Данните за продукта са заредени. Провери етикета преди запис.";
  } catch (error) {
    status.textContent = error.message || "Не успях да заредя продукта.";
  }
}

async function searchWorldFoods(event) {
  event.preventDefault();
  const query = $("foodSearchQuery").value.trim();
  const status = $("foodSearchStatus");
  const results = $("foodSearchResults");
  if (query.length < 2) {
    status.textContent = "Въведете поне 2 букви.";
    return;
  }
  status.textContent = "Търся в световната база...";
  results.innerHTML = "";
  try {
    const data = await fetchFoodDatabase({ query });
    const products = (data.products || []).map(normalizeWorldFood).filter((item) => item.name && item.calories > 0);
    window.nutriWorldFoodResults = products;
    if (!products.length) {
      status.textContent = "Не намерих храна с хранителни стойности. Опитайте с друго име или марка.";
      return;
    }
    status.textContent = `${products.length} резултата. Стойностите са за 100 г и са ориентировъчни.`;
    results.innerHTML = products.map((item, index) => `
      <div class="food-search-result">
        ${item.image ? `<img src="${escapeHtml(item.image)}" alt="" loading="lazy">` : '<div class="food-result-placeholder">🍽</div>'}
        <div>
          <strong>${escapeHtml(item.name)}</strong>
          <span>${escapeHtml(item.brand || "Хранителен продукт")} · ${item.calories} kcal / 100 г</span>
        </div>
        <button type="button" class="secondary" data-world-food-index="${index}">Избери</button>
      </div>`).join("");
  } catch (error) {
    status.textContent = error.message || "Търсенето не бе успешно. Проверете връзката и опитайте отново.";
  }
}

async function fetchFoodDatabase({ query = "", barcode = "" }) {
  const fields = "code,product_name,product_name_bg,generic_name,brands,image_front_small_url,nutriments,serving_quantity";
  const localParams = barcode ? `barcode=${encodeURIComponent(barcode)}` : `query=${encodeURIComponent(query)}`;
  const directPath = barcode
    ? `/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${encodeURIComponent(fields)}`
    : `/cgi/search.pl?action=process&search_terms=${encodeURIComponent(query)}&search_simple=1&json=1&page_size=12&fields=${encodeURIComponent(fields)}`;
  const urls = [
    `/api/foods?${localParams}`,
    `https://world.openfoodfacts.org${directPath}`,
    `https://bg.openfoodfacts.org${directPath}`
  ];

  let lastError;
  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      const response = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
      clearTimeout(timeout);
      const contentType = response.headers.get("content-type") || "";
      if (!response.ok || !contentType.includes("json")) throw new Error("Източникът не отговори коректно.");
      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(lastError?.name === "AbortError"
    ? "Търсенето отне твърде дълго. Опитайте отново."
    : "Няма връзка с хранителната база. Проверете интернет връзката и опитайте отново.");
}

function normalizeWorldFood(product) {
  const nutrients = product.nutriments || {};
  return {
    name: product.product_name_bg || product.product_name || "",
    brand: product.brands || "",
    image: product.image_front_small_url || "",
    grams: Number(product.serving_quantity) || 100,
    calories: Math.round(Number(nutrients["energy-kcal_100g"]) || Number(nutrients.energy_100g) / 4.184 || 0),
    protein: round(Number(nutrients.proteins_100g) || 0, 1),
    carbs: round(Number(nutrients.carbohydrates_100g) || 0, 1),
    fat: round(Number(nutrients.fat_100g) || 0, 1),
    fiber: round(Number(nutrients.fiber_100g) || 0, 1)
  };
}

function selectWorldFood(event) {
  const index = event.target.dataset.worldFoodIndex;
  if (index === undefined) return;
  const item = window.nutriWorldFoodResults?.[Number(index)];
  if (!item) return;
  $("manualName").value = item.name;
  $("manualGrams").value = item.grams;
  $("manualPer100").checked = true;
  $("manualCalories").value = item.calories;
  $("manualProtein").value = item.protein;
  $("manualCarbs").value = item.carbs;
  $("manualFat").value = item.fat;
  $("manualFiber").value = item.fiber;
  updateManualNutritionPreview();
  $("foodSearchStatus").textContent = `${item.name} е заредена. Проверете порцията и натиснете „Добави към дневника“.`;
  $("manualName").scrollIntoView({ behavior: "smooth", block: "center" });
}

async function scanBarcodeImage(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const status = $("barcodeStatus");
  status.textContent = "Разчитам баркода...";
  let rawValue = "";

  try {
    if ("BarcodeDetector" in window) {
      try {
        const detector = new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] });
        const bitmap = await createImageBitmap(file);
        const codes = await detector.detect(bitmap);
        bitmap.close();
        rawValue = codes[0]?.rawValue || "";
      } catch {
        rawValue = "";
      }
    }

    if (!rawValue) {
      status.textContent = "Опитвам разширено разпознаване...";
      try {
        const zxing = await import("https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm");
        const reader = new zxing.BrowserMultiFormatReader();
        const imageUrl = URL.createObjectURL(file);
        try {
          const result = await reader.decodeFromImageUrl(imageUrl);
          rawValue = result?.getText?.() || result?.text || "";
        } finally {
          URL.revokeObjectURL(imageUrl);
          reader.reset?.();
        }
      } catch {
        rawValue = "";
      }
    }

    if (!rawValue) {
      status.textContent = "Проверявам с EAN/UPC скенер...";
      rawValue = await decodeBarcodeWithQuagga(file);
    }

    if (!rawValue) throw new Error("Баркодът не се вижда достатъчно ясно. Снимай само баркода отблизо, хоризонтално, на светло и без отблясък.");

    $("barcodeValue").value = rawValue;
    status.textContent = "Баркодът е разпознат: " + rawValue;
    await lookupBarcodeProduct(rawValue);
  } catch (error) {
    status.textContent = error.message || "Баркодът не беше разпознат. Въведи цифрите под него ръчно.";
  } finally {
    event.target.value = "";
  }
}

async function decodeBarcodeWithQuagga(file) {
  try {
    const module = await import("https://cdn.jsdelivr.net/npm/@ericblade/quagga2@1.12.1/+esm");
    const Quagga = module.default || module;
    const imageUrl = URL.createObjectURL(file);
    try {
      return await new Promise((resolve) => {
        Quagga.decodeSingle({
          src: imageUrl,
          numOfWorkers: 0,
          locate: true,
          locator: { patchSize: "medium", halfSample: true },
          inputStream: { size: 1280 },
          decoder: { readers: ["ean_reader", "ean_8_reader", "upc_reader", "upc_e_reader", "code_128_reader"] }
        }, (result) => resolve(result?.codeResult?.code || ""));
      });
    } finally {
      URL.revokeObjectURL(imageUrl);
    }
  } catch {
    return "";
  }
}

function populateAnalysisCorrection() {
  const analysis = state.lastAnalysis;
  if (!analysis || !$("correctedCalories")) return;
  $("correctedName").value = analysis.foods?.[0]?.name || "";
  $("correctedCalories").value = Math.round(analysis.totalCalories || 0);
  $("correctedProtein").value = analysis.protein || 0;
  $("correctedCarbs").value = analysis.carbs || 0;
  $("correctedFat").value = analysis.fat || 0;
  $("correctedFiber").value = analysis.fiber || 0;
}

function applyAnalysisCorrection() {
  if (!state.lastAnalysis) return;
  const name = $("correctedName").value.trim() || state.lastAnalysis.foods?.[0]?.name || "Хранене";
  state.lastAnalysis.totalCalories = Number($("correctedCalories").value) || 0;
  state.lastAnalysis.protein = Number($("correctedProtein").value) || 0;
  state.lastAnalysis.carbs = Number($("correctedCarbs").value) || 0;
  state.lastAnalysis.fat = Number($("correctedFat").value) || 0;
  state.lastAnalysis.fiber = Number($("correctedFiber").value) || 0;
  state.lastAnalysis.rating = "Коригирано ръчно";
  delete state.lastAnalysis.healthScore;
  state.lastAnalysis.foods = state.lastAnalysis.foods?.length
    ? [{ ...state.lastAnalysis.foods[0], name }, ...state.lastAnalysis.foods.slice(1)]
    : [{ name, estimatedGrams: 0, calories: state.lastAnalysis.totalCalories }];
  if (state.lastAnalysis.foods?.[0]) {
    Object.assign(state.lastAnalysis.foods[0], {
      name,
      calories: state.lastAnalysis.totalCalories,
      protein: state.lastAnalysis.protein,
      carbs: state.lastAnalysis.carbs,
      fat: state.lastAnalysis.fat,
      fiber: state.lastAnalysis.fiber
    });
  }
  renderAnalysisSummary(state.lastAnalysis);
  renderFoodScanOverlay(state.lastAnalysis);
  renderAnalysisFavoriteButton();
  $("analysisStatus").textContent = "Корекцията е приложена. Можеш да добавиш храната.";
}

function exportNutriData() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: state.profile,
    meals: state.meals,
    weights: state.weights,
    favorites: state.favorites,
    reminders: state.reminders,
    water: state.water
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `nutriai-backup-${localDateKey(new Date())}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  $("archiveStatus").textContent = "Архивът е създаден.";
}

async function importNutriData(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.meals)) throw new Error("Невалиден архив.");
    if (data.profile) state.profile = data.profile;
    state.meals = data.meals;
    state.weights = Array.isArray(data.weights) ? data.weights : state.weights;
    state.favorites = Array.isArray(data.favorites) ? data.favorites : state.favorites;
    state.reminders = data.reminders || state.reminders;
    state.water = data.water || state.water;
    await Promise.all([
      save("nutriai.profile", state.profile),
      save("nutriai.meals", state.meals),
      save("nutriai.weights", state.weights),
      save("nutriai.favorites", state.favorites),
      save("nutriai.reminders", state.reminders),
      save("nutriai.water", state.water)
    ]);
    hydrateReminderForm();
    renderFavorites();
    renderAll();
    $("archiveStatus").textContent = "Архивът е възстановен успешно.";
  } catch (error) {
    $("archiveStatus").textContent = error.message || "Архивът не може да бъде прочетен.";
  } finally {
    event.target.value = "";
  }
}

function hydrateReminderForm() {
  if (!$("reminderWater")) return;
  $("reminderWater").checked = Boolean(state.reminders.water);
  $("waterInterval").value = String(state.reminders.waterInterval || 120);
}

async function saveReminderSettings() {
  const enabled = $("reminderWater").checked;
  if (enabled && "Notification" in window && Notification.permission === "default") {
    await Notification.requestPermission();
  }
  const interval = Number($("waterInterval").value) || 120;
  const notificationAllowed = "Notification" in window && Notification.permission === "granted";
  state.reminders = {
    water: enabled,
    waterInterval: interval,
    nextWaterAt: enabled ? Date.now() + interval * 60000 : 0
  };
  await save("nutriai.reminders", state.reminders);
  $("reminderStatus").textContent = !enabled
    ? "Напомнянето за вода е изключено."
    : notificationAllowed
      ? `Ще ти напомня след ${interval / 60} ${interval === 60 ? "час" : "часа"}.`
      : "Настройката е запазена, но трябва да разрешиш известията.";
}

function startReminderChecks() {
  if (window.nutriReminderTimer) clearInterval(window.nutriReminderTimer);
  window.nutriReminderTimer = setInterval(checkReminders, 30000);
  checkReminders();
}

async function checkReminders() {
  if (!state.reminders.water || !state.reminders.nextWaterAt) return;
  if (Date.now() < state.reminders.nextWaterAt) return;
  const interval = Number(state.reminders.waterInterval) || 120;
  state.reminders.nextWaterAt = Date.now() + interval * 60000;
  await save("nutriai.reminders", state.reminders);
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("Време за вода", {
      body: "Изпий чаша вода и я добави към дневния прием.",
      icon: "icons/icon-192.png"
    });
  }
}


function clearManualFoodData() {
  $("manualMealForm")?.reset();
  $("barcodeValue").value = "";
  if ($("barcodeImage")) $("barcodeImage").value = "";
  $("barcodeStatus").textContent = "Данните са изчистени.";
  $("manualMealStatus").textContent = "";
  updateManualNutritionPreview();
}

function selectMealTypeByTime(date = new Date()) {
  const type = mealTypeForTime(date);
  $("mealType").value = type;
  document.querySelectorAll("[data-meal]").forEach((button) => {
    button.classList.toggle("active", button.dataset.meal === type);
  });
}

function mealTypeForTime(date = new Date()) {
  const hour = date.getHours();
  return hour < 11 ? "breakfast" : hour < 16 ? "lunch" : hour < 22 ? "dinner" : "snack";
}


function renderWeekProgress() {
  const container = $("weekProgress");
  if (!container) return;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monday = new Date(today);
  const dayIndex = (today.getDay() + 6) % 7;
  monday.setDate(today.getDate() - dayIndex + state.progressWeekOffset * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const dayNames = ["Пон", "Вто", "Сря", "Чет", "Пет", "Съб", "Нед"];
  const limit = Number(state.profile.dailyLimit) || 1;

  $("weekProgressRange").textContent = monday.toLocaleDateString("bg-BG", { day: "numeric", month: "short" }) + " – " + sunday.toLocaleDateString("bg-BG", { day: "numeric", month: "short" });
  $("nextWeek").disabled = state.progressWeekOffset >= 0;

  container.innerHTML = dayNames.map((name, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    const key = localDateKey(date);
    const calories = state.meals
      .filter((meal) => localDateKey(new Date(meal.date)) === key)
      .reduce((sum, meal) => sum + Number(meal.analysis.totalCalories || 0), 0);
    const isFuture = date > today;
    const hasData = calories > 0;
    const percent = hasData ? Math.round(calories / limit * 100) : 0;
    const fill = Math.min(percent, 100);
    const status = isFuture || !hasData ? "week-empty" : percent > 100 ? "week-over" : percent >= 85 ? "week-good" : "week-low";
    const color = status === "week-over" ? "var(--red)" : status === "week-good" ? "var(--green)" : status === "week-low" ? "var(--yellow)" : "var(--line)";
    const center = isFuture || !hasData ? "—" : percent + "%";
    const detail = isFuture ? "Предстои" : hasData ? Math.round(calories) + " kcal" : "Няма данни";
    return '<div class="week-day ' + status + (key === localDateKey(today) ? ' is-today' : '') + '">' +
      '<strong>' + name + '</strong>' +
      '<div class="week-ring" style="background:conic-gradient(' + color + ' ' + (fill * 3.6) + 'deg, var(--card-2) 0deg)"><span>' + center + '</span></div>' +
      '<b>' + date.getDate() + '</b><small>' + detail + '</small></div>';
  }).join("");
}


function bindFridge() {
  $("fridgeForm")?.addEventListener("submit", addFridgeItems);
  $("fridgeItems")?.addEventListener("click", removeFridgeItem);
  $("clearFridge")?.addEventListener("click", clearFridgeItems);
  $("generateFridgeRecipe")?.addEventListener("click", generateFridgeRecipe);
  renderFridgeItems();
  renderFridgeRecipe();
}

async function addFridgeItems(event) {
  event.preventDefault();
  const names = $("fridgeInput").value.split(",").map((name) => name.trim()).filter(Boolean);
  if (!names.length) return;
  for (const name of names) {
    if (!state.fridgeItems.some((item) => item.name.toLowerCase() === name.toLowerCase())) {
      state.fridgeItems.push({ id: crypto.randomUUID(), name });
    }
  }
  $("fridgeInput").value = "";
  await save("nutriai.fridgeItems", state.fridgeItems);
  renderFridgeItems();
}

async function removeFridgeItem(event) {
  const id = event.target.dataset.removeFridge;
  if (!id) return;
  state.fridgeItems = state.fridgeItems.filter((item) => item.id !== id);
  await save("nutriai.fridgeItems", state.fridgeItems);
  renderFridgeItems();
}

async function clearFridgeItems() {
  if (!state.fridgeItems.length) return;
  state.fridgeItems = [];
  state.fridgeRecipe = null;
  await Promise.all([save("nutriai.fridgeItems", []), save("nutriai.fridgeRecipe", null)]);
  renderFridgeItems();
  renderFridgeRecipe();
  $("fridgeStatus").textContent = "Хладилникът е изчистен.";
}

function renderFridgeItems() {
  const container = $("fridgeItems");
  if (!container) return;
  if (!state.fridgeItems.length) {
    container.innerHTML = '<div class="empty-copy">Добави продуктите, които имаш вкъщи.</div>';
    return;
  }
  container.innerHTML = state.fridgeItems.map((item) =>
    '<span class="fridge-chip">' + escapeHtml(item.name) +
    '<button type="button" data-remove-fridge="' + escapeHtml(item.id) + '" aria-label="Премахни ' + escapeHtml(item.name) + '">×</button></span>'
  ).join("");
}

async function generateFridgeRecipe() {
  if (!state.fridgeItems.length) {
    $("fridgeStatus").textContent = "Първо добави поне един продукт.";
    return;
  }
  if (!canUseServerProxy() && !state.apiKey) {
    $("fridgeStatus").textContent = "AI рецептата работи през Vercel с настроен GROQ_API_KEY.";
    return;
  }
  const button = $("generateFridgeRecipe");
  button.disabled = true;
  $("fridgeStatus").textContent = "Създавам рецепта от наличните продукти...";
  const available = state.fridgeItems.map((item) => item.name).join(", ");
  const remaining = Math.max(0, state.profile.dailyLimit - consumedToday());
  const prompt = [
    "Създай една практична рецепта на български основно от наличните продукти.",
    "Налични продукти: " + available,
    "Цел: " + state.profile.goal,
    "Дневен лимит: " + state.profile.dailyLimit + " kcal",
    "Оставащи калории днес: " + remaining + " kcal",
    "Може да използваш само базови продукти като вода, сол, черен пипер и малко мазнина, но ги отбележи отделно.",
    "Не включвай друг основен продукт, който не е в списъка.",
    'Върни само JSON: {"title":"","description":"","servings":1,"timeMinutes":0,"ingredients":[""],"basics":[""],"steps":[""],"caloriesPerServing":0,"proteinPerServing":0,"tip":""}'
  ].join("\n");
  try {
    const data = await callGroq([
      { role: "system", content: "Ти си практичен нутриционист и готвач. Връщай само валиден JSON на български." },
      { role: "user", content: prompt }
    ], true);
    state.fridgeRecipe = parseGroqJsonLoose(data);
    await save("nutriai.fridgeRecipe", state.fridgeRecipe);
    renderFridgeRecipe();
    $("fridgeStatus").textContent = "Рецептата е готова.";
  } catch (error) {
    $("fridgeStatus").textContent = error.message || "Не успях да създам рецепта.";
  } finally {
    button.disabled = false;
  }
}

function renderFridgeRecipe() {
  const container = $("fridgeRecipe");
  if (!container) return;
  const recipe = state.fridgeRecipe;
  if (!recipe) {
    container.classList.add("hidden");
    container.innerHTML = "";
    return;
  }
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  const basics = Array.isArray(recipe.basics) ? recipe.basics : [];
  const steps = Array.isArray(recipe.steps) ? recipe.steps : [];
  container.innerHTML =
    '<div class="fridge-recipe-head"><div><small>AI рецепта</small><h3>' + escapeHtml(recipe.title || "Рецепта") + '</h3></div>' +
    '<span>' + Math.round(Number(recipe.caloriesPerServing) || 0) + ' kcal</span></div>' +
    '<p>' + escapeHtml(recipe.description || "") + '</p>' +
    '<div class="recipe-meta"><span>' + Math.max(1, Number(recipe.servings) || 1) + ' порции</span><span>' + Math.round(Number(recipe.timeMinutes) || 0) + ' мин</span><span>' + Math.round(Number(recipe.proteinPerServing) || 0) + ' г протеин</span></div>' +
    '<h4>Продукти</h4><ul>' + ingredients.map((item) => '<li>' + escapeHtml(item) + '</li>').join("") + '</ul>' +
    (basics.length ? '<h4>Основни добавки</h4><ul>' + basics.map((item) => '<li>' + escapeHtml(item) + '</li>').join("") + '</ul>' : '') +
    '<h4>Приготвяне</h4><ol>' + steps.map((item) => '<li>' + escapeHtml(item) + '</li>').join("") + '</ol>' +
    (recipe.tip ? '<div class="recommendation-box"><strong>Съвет</strong><span>' + escapeHtml(recipe.tip) + '</span></div>' : '');
  container.classList.remove("hidden");
}


function showCalorieMascot(calories) {
  const mascot = $("calorieMascot");
  if (!mascot) return;
  clearTimeout(window.nutriMascotTimer);
  $("mascotCalories").textContent = Math.round(Number(calories) || 0);
  mascot.classList.remove("show");
  mascot.setAttribute("aria-hidden", "false");
  void mascot.offsetWidth;
  mascot.classList.add("show");
  window.nutriMascotTimer = setTimeout(() => {
    mascot.classList.remove("show");
    mascot.setAttribute("aria-hidden", "true");
  }, 4000);
}


function renderFoodScanOverlay(analysis) {
  const overlay = $("foodScanOverlay");
  const foods = Array.isArray(analysis.foods) ? analysis.foods.slice(0, 5) : [];
  if (!foods.length) {
    overlay.classList.add("hidden");
    $("photoFrame").classList.remove("has-scan-results");
    return;
  }
  overlay.innerHTML = foods.map((food, index) => {
    const favorite = findFavoriteByName(food.name);
    return '<div class="scan-food-label">' +
      '<div class="scan-food-copy"><strong>' + escapeHtml(food.name || "Храна") + ' <small>' + Math.round(food.estimatedGrams || food.grams || 0) + ' г</small></strong>' +
      '<span><b>🔥 ' + Math.round(food.calories || 0) + '</b><b>П ' + round(nutritionNumber(food.protein), 1) + '</b><b>В ' + round(nutritionNumber(food.carbs), 1) + '</b><b>М ' + round(nutritionNumber(food.fat), 1) + '</b></span></div>' +
      '<div class="scan-food-actions">' +
        '<button type="button" class="scan-favorite-button' + (favorite ? ' active' : '') + '" data-favorite-food-index="' + index + '" title="' + (favorite ? 'Премахни от любими' : 'Добави в любими') + '" aria-label="' + (favorite ? 'Премахни от любими' : 'Добави в любими') + '">' + (favorite ? '♥' : '♡') + '</button>' +
        '<button type="button" data-add-food-index="' + index + '">Добави</button>' +
      '</div>' +
    '</div>';
  }).join("");
  overlay.classList.remove("hidden");
  $("photoFrame").classList.add("has-scan-results");
}

async function handleDetectedFoodAdd(event) {
  const favoriteValue = event.target.dataset.favoriteFoodIndex;
  if (favoriteValue !== undefined) {
    await toggleScannedFoodFavorite(Number(favoriteValue));
    return;
  }
  const value = event.target.dataset.addFoodIndex;
  if (value === undefined) return;
  const index = Number(value);
  const food = state.lastAnalysis?.foods?.[index];
  if (!food) return;
  const button = event.target;
  button.disabled = true;
  const meal = mealFromDetectedFood(food);
  state.meals.unshift(meal);
  try {
    await save("nutriai.meals", state.meals);
    renderAll();
    button.textContent = "Добавено";
    $("analysisStatus").textContent = food.name + " е добавено към дневника.";
  } catch (error) {
    state.meals = state.meals.filter((item) => item.id !== meal.id);
    button.disabled = false;
    $("analysisStatus").textContent = "Продуктът не беше запазен.";
  }
}

function mealFromDetectedFood(food) {
  return {
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
    title: food.name || "Храна",
    mealType: $("mealType").value,
    image: state.selectedImageDataUrl || "",
    quantityGrams: nutritionNumber(food.estimatedGrams ?? food.grams),
    analysis: {
      foods: [structuredClone(food)],
      totalCalories: nutritionNumber(food.calories),
      protein: nutritionNumber(food.protein),
      carbs: nutritionNumber(food.carbs),
      fat: nutritionNumber(food.fat),
      fiber: nutritionNumber(food.fiber),
      rating: "Добавено от AI скенера",
      reason: "Отделен продукт, разпознат от снимката."
    }
  };
}

function clearCameraAnalysis() {
  state.selectedImageDataUrl = "";
  state.lastAnalysis = null;
  $("foodImage").value = "";
  $("preview").removeAttribute("src");
  $("preview").style.display = "none";
  $("photoPlaceholder").style.display = "";
  $("analysisPanel").classList.add("hidden");
  renderAnalysisFavoriteButton();
  $("foodScanOverlay").classList.add("hidden");
  $("foodScanOverlay").innerHTML = "";
  $("photoFrame").classList.remove("has-scan-results");
  $("analysisStatus").textContent = "";
  $("clearAnalysis").classList.add("hidden");
  $("analyzeButton").disabled = false;
  const mascot = $("calorieMascot");
  if (mascot) {
    mascot.classList.remove("show");
    mascot.setAttribute("aria-hidden", "true");
  }
  clearTimeout(window.nutriMascotTimer);
}


function updateCurrentDate(show = true) {
  const element = $("currentDate");
  if (!element) return;
  element.textContent = new Intl.DateTimeFormat("bg-BG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date());
  element.classList.toggle("hidden", !show);
}


async function startLiveBarcodeScanner() {
  const modal = $("barcodeScannerModal");
  const video = $("barcodeVideo");
  const status = $("liveBarcodeStatus");
  modal.classList.remove("hidden");
  status.textContent = "Разреши достъп до камерата и насочи баркода в рамката.";
  window.nutriBarcodeDetected = false;

  try {
    const zxing = await import("https://cdn.jsdelivr.net/npm/@zxing/browser@0.2.0/+esm");
    const reader = new zxing.BrowserMultiFormatReader();
    const controls = await reader.decodeFromConstraints({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    }, video, async (result) => {
      if (!result || window.nutriBarcodeDetected) return;
      window.nutriBarcodeDetected = true;
      const rawValue = result.getText?.() || result.text || "";
      if (!rawValue) {
        window.nutriBarcodeDetected = false;
        return;
      }
      status.textContent = "Баркодът е разпознат: " + rawValue;
      $("barcodeValue").value = rawValue;
      stopLiveBarcodeScanner();
      $("barcodeStatus").textContent = "Зареждам продукта...";
      await lookupBarcodeProduct(rawValue);
    });
    window.nutriBarcodeControls = controls;
  } catch (error) {
    stopBarcodeMediaTracks();
    status.textContent = error?.name === "NotAllowedError"
      ? "Камерата не е разрешена. Разреши достъпа от настройките на браузъра."
      : "Камерата не можа да се стартира. Опитай от защитената Vercel страница.";
  }
}

function stopLiveBarcodeScanner() {
  try {
    window.nutriBarcodeControls?.stop();
  } catch {
    // Camera tracks are stopped below as a fallback.
  }
  window.nutriBarcodeControls = null;
  window.nutriBarcodeDetected = false;
  stopBarcodeMediaTracks();
  $("barcodeScannerModal")?.classList.add("hidden");
}

function stopBarcodeMediaTracks() {
  const video = $("barcodeVideo");
  const stream = video?.srcObject;
  if (stream?.getTracks) stream.getTracks().forEach((track) => track.stop());
  if (video) video.srcObject = null;
}


function favoriteNameKey(name) {
  return String(name || "").trim().toLocaleLowerCase("bg-BG").replace(/\s+/g, " ");
}

function findFavoriteByName(name) {
  const key = favoriteNameKey(name);
  return state.favorites.find((favorite) => favoriteNameKey(favorite.name) === key) || null;
}

function favoriteFromMeal(meal) {
  const nutrition = nutritionFromMeal(meal);
  const grams = nutritionNumber(meal.quantityGrams)
    || nutritionNumber(meal.analysis?.foods?.[0]?.estimatedGrams)
    || nutritionNumber(meal.analysis?.foods?.[0]?.grams);
  const calories = Math.round(nutritionNumber(meal.analysis?.totalCalories));
  return {
    id: crypto.randomUUID(),
    name: meal.title || meal.analysis?.foods?.[0]?.name || "Храна",
    grams,
    per100: false,
    calories,
    protein: nutrition.protein,
    carbs: nutrition.carbs,
    fat: nutrition.fat,
    fiber: nutrition.fiber,
    image: meal.image || "",
    portionNutrition: {
      calories,
      protein: nutrition.protein,
      carbs: nutrition.carbs,
      fat: nutrition.fat,
      fiber: nutrition.fiber
    }
  };
}

async function setMealFavorite(meal, shouldSave) {
  const existing = findFavoriteByName(meal.title);
  if (shouldSave) {
    const next = favoriteFromMeal(meal);
    if (existing) state.favorites[state.favorites.indexOf(existing)] = { ...next, id: existing.id, image: next.image || existing.image || "" };
    else state.favorites.unshift(next);
  } else if (existing) {
    state.favorites = state.favorites.filter((favorite) => favorite.id !== existing.id);
  }
  await save("nutriai.favorites", state.favorites);
  renderFavorites();
  renderTodayMeals();
  if (state.lastAnalysis) {
    renderFoodScanOverlay(state.lastAnalysis);
    renderAnalysisFavoriteButton();
  }
}

async function toggleScannedFoodFavorite(index) {
  const food = state.lastAnalysis?.foods?.[index];
  if (!food) return;
  const meal = mealFromDetectedFood(food);
  const existing = findFavoriteByName(meal.title);
  await setMealFavorite(meal, !existing);
  $("analysisStatus").textContent = existing
    ? meal.title + " е премахнато от любими."
    : meal.title + " е запазено в любими.";
}

function analysisAsMeal() {
  const analysis = state.lastAnalysis;
  if (!analysis) return null;
  const foods = Array.isArray(analysis.foods) ? analysis.foods : [];
  const title = foods.length === 1
    ? foods[0].name
    : foods.slice(0, 3).map((food) => food.name).filter(Boolean).join(", ") || "AI хранене";
  return {
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
    title,
    mealType: $("mealType").value,
    image: state.selectedImageDataUrl || "",
    quantityGrams: foods.reduce((sum, food) => sum + nutritionNumber(food.estimatedGrams ?? food.grams), 0),
    analysis: structuredClone(analysis)
  };
}

async function toggleAnalysisFavorite() {
  const meal = analysisAsMeal();
  if (!meal) return;
  const existing = findFavoriteByName(meal.title);
  await setMealFavorite(meal, !existing);
  $("analysisStatus").textContent = existing
    ? meal.title + " е премахнато от любими."
    : meal.title + " е запазено в любими.";
}

function renderAnalysisFavoriteButton() {
  const button = $("toggleAnalysisFavorite");
  if (!button) return;
  const meal = analysisAsMeal();
  if (!meal) {
    button.textContent = "♡ Запази в любими";
    button.classList.remove("active");
    return;
  }
  const active = Boolean(findFavoriteByName(meal.title));
  button.textContent = active ? "♥ В любими" : "♡ Запази в любими";
  button.classList.toggle("active", active);
}


async function toggleMealFavorite(mealId) {
  const meal = state.meals.find((item) => item.id === mealId);
  if (!meal) return;
  const existing = findFavoriteByName(meal.title);
  await setMealFavorite(meal, !existing);
  $("favoriteQuickStatus").textContent = existing
    ? meal.title + " е премахнато от любими."
    : meal.title + " е запазено в любими.";
}


function favoriteImageHtml(item) {
  if (item.image && String(item.image).startsWith("data:image/")) {
    return '<img class="favorite-food-image" src="' + item.image + '" alt="Снимка на ' + escapeHtml(item.name) + '">';
  }
  return '<div class="favorite-food-image favorite-food-placeholder" aria-hidden="true">🍽</div>';
}

function openFavoriteEditor(id) {
  const item = state.favorites.find((favorite) => favorite.id === id);
  if (!item) return;
  const nutrition = favoritePortionNutrition(item);
  $("editFavoriteId").value = item.id;
  $("editFavoriteName").value = item.name || "";
  $("editFavoriteGrams").value = nutrition.grams || item.grams || "";
  $("editFavoriteCalories").value = nutrition.calories || 0;
  $("editFavoriteProtein").value = nutrition.protein || 0;
  $("editFavoriteCarbs").value = nutrition.carbs || 0;
  $("editFavoriteFat").value = nutrition.fat || 0;
  $("editFavoriteFiber").value = nutrition.fiber || 0;
  const image = $("editFavoriteImage");
  if (item.image && String(item.image).startsWith("data:image/")) {
    image.src = item.image;
    image.classList.remove("hidden");
  } else {
    image.removeAttribute("src");
    image.classList.add("hidden");
  }
  $("favoriteEditor").showModal();
}

async function saveFavoriteEdit(event) {
  event.preventDefault();
  const item = state.favorites.find((favorite) => favorite.id === $("editFavoriteId").value);
  if (!item) return;
  const nutrition = {
    calories: Math.max(0, Number($("editFavoriteCalories").value) || 0),
    protein: Math.max(0, Number($("editFavoriteProtein").value) || 0),
    carbs: Math.max(0, Number($("editFavoriteCarbs").value) || 0),
    fat: Math.max(0, Number($("editFavoriteFat").value) || 0),
    fiber: Math.max(0, Number($("editFavoriteFiber").value) || 0)
  };
  item.name = $("editFavoriteName").value.trim() || item.name;
  item.grams = Math.max(0, Number($("editFavoriteGrams").value) || 0);
  item.per100 = false;
  Object.assign(item, nutrition);
  item.portionNutrition = { ...nutrition };
  await save("nutriai.favorites", state.favorites);
  $("favoriteEditor").close();
  renderFavorites();
  renderTodayMeals();
  renderHistory();
  $("favoriteQuickStatus").textContent = item.name + " е коригирано. Снимката е запазена.";
}
