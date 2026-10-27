/* Shared read-only Open Food Facts client for the scanner and diary. */
(() => {
  "use strict";
  const fields = [
    "code", "product_name", "product_name_bg", "generic_name", "brands",
    "image_url", "image_small_url", "image_front_url", "image_front_small_url",
    "selected_images", "nutriments", "serving_quantity", "quantity",
    "nutriscore_grade", "nova_group", "ingredients_text", "ingredients_text_bg",
    "allergens_tags", "additives_tags", "ingredients_analysis_tags", "categories_tags"
  ].join(",");
  const error = (message, kind = "service") => Object.assign(new Error(message), { kind });
  const validData = (data, barcode) => data && !Array.isArray(data) && typeof data === "object" &&
    (barcode ? data.status === 0 || (data.product && typeof data.product === "object" && !Array.isArray(data.product))
      : Array.isArray(data.products));

  async function get({ query = "", barcode = "" } = {}) {
    barcode = String(barcode).replace(/\D/g, "");
    query = String(query).trim();
    if (barcode ? barcode.length < 8 || barcode.length > 14 : query.length < 2) {
      throw error("Въведи валиден EAN/UPC или поне 2 символа за търсене.", "invalid");
    }
    const params = new URLSearchParams(barcode ? { barcode } : { query });
    const path = barcode
      ? "/api/v2/product/" + encodeURIComponent(barcode) + ".json?fields=" + encodeURIComponent(fields)
      : "/cgi/search.pl?action=process&search_terms=" + encodeURIComponent(query) +
        "&search_simple=1&json=1&page_size=12&fields=" + encodeURIComponent(fields);
    const urls = ["/api/foods?" + params, "https://world.openfoodfacts.org" + path, "https://bg.openfoodfacts.org" + path];
    let lastError, proxyError;
    for (const url of urls) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), url.startsWith("/") ? 10500 : 6500);
      try {
        const response = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
        const type = response.headers.get("content-type") || "";
        const data = type.includes("json") ? await response.json().catch(() => null) : null;
        // A deployment's HTML 404 is not proof that the product is missing.
        if (barcode && response.status === 404 && (data?.status === 0 || data?.code === "PRODUCT_NOT_FOUND")) {
          return { status: 0, product: null };
        }
        if (response.status === 429) {
          throw error(data?.error || "Хранителната база временно ограничава заявките. Опитай отново след минута.", "rate-limit");
        }
        if (response.status === 400) throw error(data?.error || "Невалиден баркод или име.", "invalid");
        if (!response.ok) throw error(data?.error || "Хранителната база временно не отговаря.");
        if (!validData(data, barcode)) throw error("Хранителната база не върна валиден отговор.");
        return data;
      } catch (cause) {
        if (cause.kind === "rate-limit" || cause.kind === "invalid") throw cause;
        lastError = cause.name === "AbortError" || cause.name === "TimeoutError"
          ? error("Връзката с хранителната база се забави. Опитай отново.")
          : error(cause.message || "Няма връзка с хранителната база.");
        if (url.startsWith("/")) proxyError = lastError;
      } finally { clearTimeout(timer); }
    }
    throw proxyError || lastError || error("Хранителната база временно не отговаря.");
  }
  window.NutriAIFoodDatabase = Object.freeze({ get });
})();
