/* NutriAI product insights: presentation aid, not a toxicity or safety test.
   Nutri-Score is an A–E nutrition label. The 0–10 conversion is a visual
   convention, explicitly disclosed to the user. When it is unavailable,
   a separate label-based indicator requires >=3 measured traffic-light fields. */
(() => {
  "use strict";

  // Nutrition label thresholds per 100 g / 100 ml:
  // https://www.nhs.uk/live-well/eat-well/food-guidelines-and-food-labels/how-to-read-food-labels/
  // https://www.gov.uk/government/publications/school-food-standards-practical-guide-and-resources-for-schools/preparing-varied-and-tasty-menus
  const thresholds = Object.freeze({
    food: {
      sugar: { low: 5, high: 22.5, label: "Захари", icon: "🍬", noun: "захари" },
      saturated: { low: 1.5, high: 5, label: "Наситени мазнини", icon: "🧈", noun: "наситени мазнини" },
      salt: { low: 0.3, high: 1.5, label: "Сол", icon: "🧂", noun: "сол" },
      fat: { low: 3, high: 17.5, label: "Мазнини", icon: "🥑", noun: "мазнини" }
    },
    drink: {
      sugar: { low: 2.5, high: 11.25, label: "Захари", icon: "🍬", noun: "захари" },
      saturated: { low: 0.75, high: 2.5, label: "Наситени мазнини", icon: "🧈", noun: "наситени мазнини" },
      salt: { low: 0.3, high: 0.75, label: "Сол", icon: "🧂", noun: "сол" },
      fat: { low: 1.5, high: 8.75, label: "Мазнини", icon: "🥑", noun: "мазнини" }
    }
  });
  const gradeScale = Object.freeze({ A: 9.5, B: 8.0, C: 6.5, D: 4.0, E: 2.5 });
  const trafficWeights = Object.freeze({ sugar: 3, saturated: 3, salt: 2.5, fat: 1.5 });
  const minKnownForFallback = 3;
  const toNumber = value => {
    if (value === undefined || value === null || value === "") return null;
    const v = Number(value);
    return Number.isFinite(v) && v >= 0 ? v : null;
  };
  const format = n => Number(n).toLocaleString("bg-BG", { maximumFractionDigits: 1 });
  function gradeOf(product) {
    const value = String(product?.score || "").toUpperCase();
    return Object.hasOwn(gradeScale, value) ? value : null;
  }
  function levels(product) {
    const type = product?.isDrink === true ? "drink" : product?.isDrink === false ? "food" : null;
    if (!type) return { type: null, data: [] };
    const data = Object.entries(thresholds[type]).flatMap(([key, rule]) => {
      const value = toNumber(product?.[key]);
      if (value === null) return [];
      const level = value > rule.high ? "high" : value <= rule.low ? "low" : "medium";
      return [{ key, ...rule, value, level }];
    });
    return { type, data };
  }
  function toneFor(score) {
    if (score === null) return { tone: "unknown", title: "Няма достатъчно данни", subtitle: "Провери етикета на продукта" };
    if (score >= 8) return { tone: "excellent", title: "По-благоприятен профил", subtitle: "Подходящ за сравняване с други храни" };
    if (score >= 6) return { tone: "balanced", title: "Умерен хранителен профил", subtitle: "Обърни внимание на порцията" };
    if (score >= 4) return { tone: "caution", title: "Консумирай с мярка", subtitle: "Виж кои показатели са повишени" };
    return { tone: "limit", title: "По-рядка консумация", subtitle: "Потърси и продукти с по-добър профил" };
  }
  function signals(product, traffic) {
    const unit = traffic.type === "drink" ? "100 мл" : "100 г";
    const warn = [], good = [], neutral = [];
    for (const field of traffic.data) {
      if (field.level === "high") {
        warn.push({
          icon: field.icon, label: "Високо съдържание на " + field.noun,
          detail: format(field.value) + " г / " + unit + " — над " + format(field.high) + " г",
          type: "warn", severity: "high"
        });
      } else if (field.level === "medium" && field.key !== "fat") {
        neutral.push({
          icon: field.icon, label: "Умерено количество " + field.noun,
          detail: format(field.value) + " г / " + unit, type: "neutral", severity: "medium"
        });
      }
    }
    if (product?.nova === 4) warn.push({
      icon: "⚙️", label: "Ултрапреработен продукт",
      detail: "NOVA 4 описва степен на преработка, а не токсичност",
      type: "warn", severity: "processing"
    });
    else if (product?.nova === 1) good.push({
      icon: "🌿", label: "Минимална преработка",
      detail: "NOVA 1 — непреработени или минимално преработени храни",
      type: "good"
    });
    if (toNumber(product?.fiber) !== null && product.fiber >= 6 && traffic.type === "food") {
      good.push({
        icon: "🌾", label: "Високо съдържание на фибри",
        detail: format(product.fiber) + " г / 100 г", type: "good"
      });
    }
    const text = String(product?.ingredients || "");
    if (/частично[\s-]*хидрогениран|partially[\s-]+hydrogenated/i.test(text)) warn.push({
      icon: "🧈", label: "Посочени частично хидрогенирани мазнини",
      detail: "Провери етикета за информация относно трансмазнините",
      type: "warn", severity: "ingredient"
    });
    if (Array.isArray(product?.additives) && product.additives.length) neutral.push({
      icon: "🧾", label: "Добавки в състава: " + product.additives.length,
      detail: "Наличието на добавки само по себе си не доказва вредност",
      type: "neutral"
    });
    return { warn, good, neutral };
  }
  function assess(product = {}) {
    const grade = gradeOf(product);
    const traffic = levels(product);
    let score = null;
    let source = "unknown";
    let method = "Няма достатъчно данни за обща оценка. Показваме само наличните хранителни стойности. Липсата на предупреждения не доказва, че продуктът е полезен или безопасен.";
    if (grade) {
      score = gradeScale[grade];
      source = "nutriscore";
      method = "Nutri-Score е официална буквена хранителна оценка A–E. За визуализация NutriAI я показва като A=9,5; B=8,0; C=6,5; D=4,0; E=2,5 по скала 0–10. Това НЕ е официална 10-точкова оценка, медицинска оценка или измерване на токсичност.";
    } else if (traffic.data.length >= minKnownForFallback) {
      const weightTotal = traffic.data.reduce((total, field) => total + trafficWeights[field.key], 0);
      const weighted = traffic.data.reduce((total, field) =>
        total + trafficWeights[field.key] * (field.level === "high" ? 1 : field.level === "medium" ? 0.42 : 0), 0);
      score = Math.max(2.0, Math.min(9.5, Math.round((9.5 - 7.5 * weighted / weightTotal) * 10) / 10));
      source = "label";
      method = "Ориентировъчен индикатор на NutriAI, изчислен единствено от наличните стойности за захари, мазнини, наситени мазнини и сол по етикета. Използва праговете за хранителен светофар (NHS) за храни или напитки. Не е официален Nutri-Score и не отчита всички хранителни качества, индивидуални нужди и размера на порцията.";
    }
    const wording = toneFor(score);
    const details = signals(product, traffic);
    return {
      score, grade, source, method, type: traffic.type, unit: traffic.type === "drink" ? "100 мл" : traffic.type === "food" ? "100 г" : "100 г/мл",
      tone: wording.tone, title: wording.title, subtitle: wording.subtitle,
      indicators: traffic.data, ...details,
      scoreLabel: score === null ? "—" : score.toFixed(1),
      scorePercent: score === null ? 0 : Math.min(100, Math.max(0, Math.round(score * 10)))
    };
  }

  window.NutriAIInsights = Object.freeze({ assess, thresholds });
})();
