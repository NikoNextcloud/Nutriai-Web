export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return response.status(500).json({
      error: {
        message: "GROQ_API_KEY не е настроен във Vercel. Добави го в Settings -> Environment Variables и redeploy."
      }
    });
  }

  try {
    const payload = {
      ...request.body,
      model: normalizeGroqModel(request.body?.model)
    };

    const upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    const data = await upstream.json().catch(() => ({
      error: {
        message: "Groq върна нечетим отговор. Опитай отново след малко."
      }
    }));
    return response.status(upstream.status).json(data);
  } catch (error) {
    return response.status(500).json({
      error: {
        message: error.message || "Връзката към Groq не бе успешна."
      }
    });
  }
}

function normalizeGroqModel(model) {
  const deprecatedModels = new Set([
    "meta-llama/llama-4-scout-17b-16e-instruct",
    "meta-llama/llama-4-maverick-17b-128e-instruct",
    "llama-3.2-11b-vision-preview",
    "llama-3.2-90b-vision-preview"
  ]);

  if (!model || deprecatedModels.has(model)) {
    return "qwen/qwen3.6-27b";
  }

  return model;
}
