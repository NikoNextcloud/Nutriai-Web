/* NutriAI barcode engine — camera-first, with native and ZXing decoder fallback.
   The camera stream is opened from the user's click before loading the local decoder. */
(() => {
  "use strict";

  let generation = 0;
  let active = null;
  let libraryPromise = null;
  const formats = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];
  const libraryURL = new URL("vendor/zxing-0.2.1.js", document.currentScript?.src || document.baseURI).href;

  function normalize(value) {
    const digits = String(value ?? "").replace(/\D/g, "");
    return digits.length >= 8 && digits.length <= 14 ? digits : "";
  }

  function variants(value) {
    const code = normalize(value);
    if (!code) return [];
    const candidates = [code];
    // UPC-A (12 digits) and EAN-13 with a leading zero refer to the same product.
    if (code.length === 12) candidates.push("0" + code);
    if (code.length === 13 && code.startsWith("0")) candidates.push(code.slice(1));
    return [...new Set(candidates)];
  }

  function capture(video) {
    if (!video?.videoWidth || !video?.videoHeight) return "";
    try {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 680 / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.55);
    } catch { return ""; }
  }

  async function loadLibrary() {
    if (!libraryPromise) {
      libraryPromise = (async () => {
        if (window.NutriAIZXing?.BrowserMultiFormatReader) return window.NutriAIZXing;
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          const timer = setTimeout(() => { script.remove(); reject(new Error("Timeout loading ZXing")); }, 10000);
          script.src = libraryURL;
          script.onload = () => { clearTimeout(timer); resolve(); };
          script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error("Библиотеката за разпознаване не се зареди.")); };
          document.head.append(script);
        });
        if (typeof window.NutriAIZXing?.BrowserMultiFormatReader !== "function") throw new Error("Неподдържан модул за сканиране.");
        return window.NutriAIZXing;
      })().catch(error => {
        libraryPromise = null; // A later scan can retry after network recovery.
        throw error;
      });
    }
    return libraryPromise;
  }

  function availableDetector() {
    return typeof window.BarcodeDetector === "function";
  }

  async function nativeDetector() {
    if (!availableDetector()) return null;
    try {
      const supported = typeof window.BarcodeDetector.getSupportedFormats === "function"
        ? await window.BarcodeDetector.getSupportedFormats()
        : formats;
      const filtered = formats.filter(format => supported.includes(format));
      return filtered.length ? new window.BarcodeDetector({ formats: filtered }) : null;
    } catch { return null; }
  }

  function stop() {
    generation += 1;
    const old = active;
    active = null;
    if (!old) return;
    if (old.nativeTimer) clearTimeout(old.nativeTimer);
    if (old.zxingTimer) clearTimeout(old.zxingTimer);
    try { old.controls?.stop?.(); } catch {}
    try { old.reader?.reset?.(); } catch {}
    try { old.stream?.getTracks?.().forEach(track => track.stop()); } catch {}
    try {
      if (old.video) {
        old.video.pause?.();
        old.video.srcObject = null;
      }
    } catch {}
  }

  async function start({ video, onDetected, onStatus, onError } = {}) {
    if (!video || typeof onDetected !== "function") {
      throw new Error("Скенерът не е настроен.");
    }
    stop();
    const token = generation;
    const session = { token, video, onDetected, onStatus, onError, stream: null, controls: null,
      reader: null, nativeTimer: null, zxingTimer: null, delivered: false, detector: null };
    active = session;
    const alive = () => active === session && generation === token && !session.delivered;
    const report = text => { if (alive()) onStatus?.(text); };
    const found = result => {
      const code = normalize(result);
      if (!code || !alive()) return;
      const photo = capture(video);
      session.delivered = true;
      stop();
      onDetected(code, photo);
    };
    const fail = error => {
      if (!alive()) return;
      onError?.(error);
    };

    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
      fail(new Error("Камерата изисква HTTPS страница и разрешен достъп. Използвай „Снимай баркод“ или въведи EAN."));
      return false;
    }

    try {
      // Request access immediately rather than after waiting for an external script.
      report("Отварям камерата...");
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }
        });
      } catch (error) {
        // Retry with the simplest constraints for iOS and older Android browsers.
        if (error?.name !== "OverconstrainedError" && error?.name !== "NotFoundError") throw error;
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
      }
      if (!alive()) {
        stream.getTracks().forEach(track => track.stop());
        return false;
      }
      session.stream = stream;
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play().catch(() => {});
      if (!alive()) return false;
      report("Насочи цифрите и линиите на баркода в рамката. Дръж телефона неподвижно.");

      const detector = await nativeDetector();
      if (!alive()) return false;
      session.detector = detector;
      if (detector) {
        const loop = async () => {
          if (!alive() || !session.detector) return;
          try {
            if (video.readyState >= 2) {
              const detected = await detector.detect(video);
              const match = detected.find(item => normalize(item.rawValue));
              if (match) return found(match.rawValue);
            }
          } catch { /* A single unreadable video frame is normal. */ }
          if (alive() && session.detector) session.nativeTimer = setTimeout(loop, 240);
        };
        session.nativeTimer = setTimeout(loop, 150);
        report("Камерата работи. Разпознавам EAN/UPC...");
        // If native decoding struggles, try ZXing over the same stream.
        session.zxingTimer = setTimeout(() => { startZXing(session, alive, found, report, false).catch(fail); }, 5000);
      } else {
        await startZXing(session, alive, found, report, true);
      }
      return true;
    } catch (error) {
      if (!alive()) return false;
      fail(error);
      // Keep modal open so the user can still upload a picture or enter EAN.
      if (session.stream) {
        session.stream.getTracks().forEach(track => track.stop());
        video.srcObject = null;
        session.stream = null;
      }
      return false;
    }
  }

  async function startZXing(session, alive, found, report, required) {
    if (!alive()) return;
    report("Зареждам допълнителното разпознаване...");
    let module;
    try { module = await loadLibrary(); }
    catch (error) {
      if (required) throw new Error("Баркод библиотеката не се зареди. Използвай „Снимай баркод“ или въведи EAN.");
      report("Продължавам сканирането с вградения четец...");
      return;
    }
    if (!alive()) return;
    try {
      session.reader = new module.BrowserMultiFormatReader();
      const controls = await session.reader.decodeFromStream(
        session.stream, session.video, result => {
          if (result) found(result.getText?.() || result.text || "");
        }
      );
      if (!alive()) { controls?.stop?.(); return; }
      session.controls = controls;
      if (session.nativeTimer) clearTimeout(session.nativeTimer);
      session.detector = null;
      report("Сканирам... приближи баркода и осигури добра светлина.");
    } catch (error) {
      if (required) throw error;
      report("Скенерът е активен. Ако няма резултат, използвай снимка или EAN.");
    }
  }

  async function scanFile(file, onStatus) {
    if (!file?.type?.startsWith("image/")) return "";
    onStatus?.("Проверявам снимката на баркода...");
    const detector = await nativeDetector();
    if (detector && typeof createImageBitmap === "function") {
      let bitmap;
      try {
        bitmap = await createImageBitmap(file);
        const found = await detector.detect(bitmap);
        const match = found.find(item => normalize(item.rawValue));
        if (match) return normalize(match.rawValue);
      } catch { /* The native API may not support this image format. */ }
      finally { bitmap?.close?.(); }
    }
    onStatus?.("Използвам разширено разпознаване на снимката...");
    let reader, imageUrl;
    try {
      const module = await loadLibrary();
      reader = new module.BrowserMultiFormatReader();
      imageUrl = URL.createObjectURL(file);
      const result = await reader.decodeFromImageUrl(imageUrl);
      return normalize(result?.getText?.() || result?.text || "");
    } catch {
      return "";
    } finally {
      try { reader?.reset?.(); } catch {}
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    }
  }

  window.NutriAIBarcodeEngine = Object.freeze({ start, stop, scanFile, normalize, variants, capture });
})();
