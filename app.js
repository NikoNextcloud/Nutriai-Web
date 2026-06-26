const state = {
  profile: load("nutriai.profile", defaultProfile()),
  meals: load("nutriai.meals", []),
  weights: load("nutriai.weights", []),
  messages: load("nutriai.messages", []),
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
  bindProgress();
  bindChat();
  hydrateProfileForm();
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
    dailyLimit: 1800
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
      $(`view-${view}`).classList.add("active");
      if (view === "progress") drawWeightChart();
    });
  });

  $("themeToggle").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("nutriai.theme", next);
  });
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
      dailyLimit: Number($("dailyLimit").value)
    };
    const targets = calculateTargets(state.profile);
    state.profile.dailyLimit = targets.recommendedCalories;
    $("dailyLimit").value = targets.recommendedCalories;
    save("nutriai.profile", state.profile);
    renderAll();
  });
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
  const targets = calculateTargets(state.profile);
  const consumed = consumedToday();
  const limit = state.profile.dailyLimit || targets.recommendedCalories;
  const remaining = Math.round(limit - consumed);
  const percent = Math.min(Math.max(consumed / limit, 0), 1);
  $("remainingCalories").textContent = `${remaining} kcal`;
  $("caloriePercent").textContent = `${Math.round(percent * 100)}%`;
  $("calorieRing").style.background = `conic-gradient(var(--accent) ${percent * 360}deg, rgba(148, 163, 184, 0.22) 0deg)`;

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
}

function metricHtml(label, value) {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
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
{"foods":[],"totalCalories":0,"protein":0,"carbs":0,"fat":0,"fiber":0,"rating":"","reason":"","remainingCalories":0,"recommendation":""}`;

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
    $("analysisJson").textContent = JSON.stringify(state.lastAnalysis, null, 2);
    $("analysisPanel").classList.remove("hidden");
    $("analysisStatus").textContent = "Готово.";
  } catch (error) {
    $("analysisStatus").textContent = error.message;
  } finally {
    $("analyzeButton").disabled = false;
  }
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
  return JSON.parse(text.replace(/^```json\s*|\s*```$/g, ""));
}

function renderHistory() {
  if (!state.meals.length) {
    $("mealHistory").innerHTML = `<p class="muted">Все още няма запазени хранения.</p>`;
    return;
  }
  $("mealHistory").innerHTML = state.meals.map((meal) => `
    <div class="meal-card">
      <div>
        <strong>${escapeHtml(meal.title)}</strong>
        <p class="muted">${new Date(meal.date).toLocaleString("bg-BG")}</p>
        <p>${escapeHtml(meal.analysis.rating || "")}</p>
      </div>
      <strong>${Math.round(meal.analysis.totalCalories || 0)} kcal</strong>
    </div>
  `).join("");
}

function bindProgress() {
  $("weightForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const value = Number($("weightEntry").value);
    if (!value) return;
    state.weights.push({ id: crypto.randomUUID(), date: new Date().toISOString(), weight: value });
    save("nutriai.weights", state.weights);
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

  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--accent");
  ctx.lineWidth = 4;
  ctx.beginPath();
  points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
  ctx.stroke();

  points.forEach((point) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--accent");
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
