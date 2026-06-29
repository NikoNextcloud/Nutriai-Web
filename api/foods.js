const OPEN_FOOD_FACTS = "https://world.openfoodfacts.org";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed" });
  }

  const query = cleanValue(request.query?.query, 80);
  const barcode = cleanValue(request.query?.barcode, 32).replace(/\D/g, "");

  if (!query && !barcode) {
    return response.status(400).json({ error: "Въведете име или баркод на продукт." });
  }

  const fields = "code,product_name,product_name_bg,generic_name,brands,image_front_small_url,nutriments,serving_quantity";
  const upstreamUrl = barcode
    ? `${OPEN_FOOD_FACTS}/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${encodeURIComponent(fields)}`
    : `${OPEN_FOOD_FACTS}/cgi/search.pl?action=process&search_terms=${encodeURIComponent(query)}&search_simple=1&json=1&page_size=12&fields=${encodeURIComponent(fields)}`;

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "NutriAI-Web/1.0 (Vercel food diary)"
      }
    });

    if (!upstream.ok) {
      return response.status(502).json({ error: "Световната база временно не отговаря." });
    }

    const data = await upstream.json();
    response.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return response.status(200).json(data);
  } catch (error) {
    return response.status(502).json({
      error: "Няма връзка със световната база. Опитайте отново след малко."
    });
  }
}

function cleanValue(value, maxLength) {
  const singleValue = Array.isArray(value) ? value[0] : value;
  return String(singleValue || "").trim().slice(0, maxLength);
}
