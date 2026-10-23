// Open Food Facts read-only proxy. Results are community-maintained, not medical advice.
const OPEN_FOOD_FACTS_HOSTS = [
  "https://world.openfoodfacts.org",
  "https://bg.openfoodfacts.org"
];
const PRODUCT_FIELDS = [
  "code", "product_name", "product_name_bg", "generic_name", "brands",
  "image_url", "image_small_url", "image_front_url", "image_front_small_url",
  "selected_images", "nutriments", "serving_quantity", "quantity",
  "nutriscore_grade", "nova_group", "ingredients_text", "ingredients_text_bg",
  "allergens_tags", "additives_tags", "ingredients_analysis_tags", "categories_tags"
].join(",");

// Identifiable user agent as requested in the official Open Food Facts API guide.
const USER_AGENT = "NutriAI-Web/2.0 (+https://github.com/NikoNextcloud/Nutriai-Web; food product lookup)";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Методът не е позволен." });
  }

  const query = cleanValue(request.query?.query, 80);
  const barcode = cleanValue(request.query?.barcode, 32).replace(/\D/g, "");
  if (!query && !barcode) {
    return response.status(400).json({ error: "Въведете име или баркод на продукт." });
  }
  if (barcode && (barcode.length < 8 || barcode.length > 14)) {
    return response.status(400).json({ error: "Баркодът трябва да съдържа между 8 и 14 цифри." });
  }
  if (!barcode && query.length < 2) {
    return response.status(400).json({ error: "Въведете поне 2 символа за търсене." });
  }

  const upstreamPath = barcode
    ? "/api/v2/product/" + encodeURIComponent(barcode) + ".json?fields=" + encodeURIComponent(PRODUCT_FIELDS)
    : "/cgi/search.pl?action=process&search_terms=" + encodeURIComponent(query)
      + "&search_simple=1&json=1&page_size=12&fields=" + encodeURIComponent(PRODUCT_FIELDS);

  let lastStatus = 0;
  let sawTimeout = false;
  for (const host of OPEN_FOOD_FACTS_HOSTS) {
    try {
      const upstream = await fetch(host + upstreamPath, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Accept-Language": "bg,en;q=0.8",
          "User-Agent": USER_AGENT
        },
        signal: AbortSignal.timeout(6500)
      });
      lastStatus = upstream.status;

      if (upstream.status === 429) {
        response.setHeader("Retry-After", upstream.headers.get("retry-after") || "60");
        return response.status(429).json({
          error: "Хранителната база временно ограничава заявките. Опитайте отново след около минута."
        });
      }
      if (upstream.status === 403) {
        return response.status(503).json({
          error: "Външната хранителна база ограничава достъпа. Опитайте отново по-късно."
        });
      }
      if (!upstream.ok) {
        // Temporary upstream errors may be resolved via the alternative regional host.
        continue;
      }

      const type = upstream.headers.get("content-type") || "";
      if (!type.includes("json")) continue;
      const data = await upstream.json();
      if (!data || typeof data !== "object") continue;

      response.setHeader("Cache-Control", barcode
        ? "public, s-maxage=1800, stale-while-revalidate=3600"
        : "public, s-maxage=600, stale-while-revalidate=1200");
      return response.status(200).json(data);
    } catch (error) {
      if (error?.name === "TimeoutError" || error?.name === "AbortError") sawTimeout = true;
      // Network failure: try the next host instead of masking all errors as 502.
    }
  }

  if (lastStatus === 404 && barcode) {
    return response.status(404).json({ error: "Баркодът не е намерен в хранителната база." });
  }
  if (sawTimeout) {
    return response.status(504).json({ error: "Връзката с хранителната база е твърде бавна. Опитайте отново." });
  }
  return response.status(503).json({
    error: "Хранителната база временно не отговаря. Опитайте отново след малко.",
    upstreamStatus: lastStatus || undefined
  });
}

function cleanValue(value, maxLength) {
  const singleValue = Array.isArray(value) ? value[0] : value;
  return String(singleValue || "").trim().slice(0, maxLength);
}
