/* Install and update UI. User data is never stored in, or removed from, Cache Storage. */
(() => {
  "use strict";
  const base = new URL(".", document.currentScript.src);
  const $ = id => document.getElementById(id);
  const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let installPrompt = null, registration = null, applyingUpdate = false;
  const installed = () => { $("pwaInstall").hidden = standalone(); };
  const connection = () => {
    $("pwaConnection").hidden = navigator.onLine;
    $("pwaConnection").textContent = "Без интернет · дневникът и личните продукти са достъпни. AI и онлайн търсенето изискват връзка.";
  };
  const offerUpdate = () => { $("pwaUpdate").hidden = !registration?.waiting || !navigator.serviceWorker.controller; };

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    installPrompt = event;
    $("pwaNativeInstall").hidden = false;
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    $("pwaInstall").hidden = true;
    $("pwaNativeInstall").hidden = true;
    $("pwaInstallHelp").close();
  });
  $("pwaInstall").addEventListener("click", () => {
    $("pwaInstallSteps").textContent = ios
      ? "В Safari отвори Споделяне → Добави към началния екран → включи „Отваряне като уеб приложение“, ако се показва → Добави. После отвори иконата NutriAI."
      : "На Android отвори менюто ⋮ на Chrome → Инсталиране на приложението (или Добавяне към началния екран → Инсталиране). След това отвори иконата NutriAI. Ако има бутон „Инсталирай“ по-долу, използвай него.";
    $("pwaNativeInstall").hidden = !installPrompt;
    $("pwaInstallHelp").showModal();
  });
  $("pwaNativeInstall").addEventListener("click", async () => {
    if (!installPrompt) return;
    const prompt = installPrompt;
    installPrompt = null;
    $("pwaNativeInstall").hidden = true;
    try {
      await prompt.prompt();
      const result = await prompt.userChoice;
      $("pwaInstallStatus").textContent = result.outcome === "accepted" ? "Инсталацията започна." : "Можеш да инсталираш по-късно от менюто на браузъра.";
      // A browser may deny persistence. This does not replace an exported backup.
      await navigator.storage?.persist?.();
    } catch { $("pwaInstallStatus").textContent = "Използвай менюто на браузъра за инсталиране."; }
  });
  $("pwaApplyUpdate").addEventListener("click", async () => {
    if (!registration?.waiting || applyingUpdate) return;
    applyingUpdate = true;
    $("pwaApplyUpdate").disabled = true;
    try {
      await window.NutriAIStorage?.flush?.();
      registration.waiting.postMessage({ type: "ACTIVATE_UPDATE" });
    } catch {
      applyingUpdate = false;
      $("pwaApplyUpdate").disabled = false;
      $("pwaUpdate").querySelector("span").textContent = "Записът не е завършен. Направи архив от История преди обновяване.";
    }
  });
  window.addEventListener("online", connection);
  window.addEventListener("offline", connection);
  window.addEventListener("pageshow", () => { installed(); connection(); });
  installed(); connection();
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (applyingUpdate) location.reload(); // Only the explicit Update click permits a reload.
  });
  navigator.serviceWorker.addEventListener("message", event => {
    if (event.data?.type !== "UPDATE_BLOCKED") return;
    applyingUpdate = false;
    $("pwaApplyUpdate").disabled = false;
    $("pwaUpdate").querySelector("span").textContent = "Затвори другите отворени прозорци на NutriAI и натисни Обнови отново.";
  });
  window.addEventListener("load", async () => {
    try {
      registration = await navigator.serviceWorker.register(new URL("sw.js", base), { scope: base.pathname, updateViaCache: "none" });
      offerUpdate();
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed") offerUpdate();
        });
      });
      await navigator.serviceWorker.ready;
      $("pwaOfflineReady").hidden = false;
      setTimeout(() => { $("pwaOfflineReady").hidden = true; }, 8000);
    } catch (error) {
      console.warn("NutriAI offline setup unavailable", error);
      $("pwaOfflineReady").textContent = "Офлайн режимът още не е готов. Отвори приложението отново при налична връзка.";
      $("pwaOfflineReady").hidden = false;
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    connection(); offerUpdate();
    if (navigator.onLine) registration?.update().catch(() => {});
  });
})();
