export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: { message: "Method not allowed" } });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return response.status(500).json({
      error: {
        message: "GEMINI_API_KEY не е настроен във Vercel. Добави го в Settings -> Environment Variables и направи Redeploy."
      }
    });
  }

  try {
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const payload = buildGeminiPayload(request.body?.messages || [], Boolean(request.body?.jsonMode));
    const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify(payload)
    });

    const data = await upstream.json().catch(() => ({
      error: {
        message: "Gemini върна нечетим отговор. Опитай отново след малко."
      }
    }));

    if (!upstream.ok) {
      return response.status(upstream.status).json({
        error: {
          message: data?.error?.message || "Gemini заявката не бе успешна."
        }
      });
    }

    return response.status(200).json(toOpenAIShape(data));
  } catch (error) {
    return response.status(500).json({
      error: {
        message: error.message || "Връзката към Gemini не бе успешна."
      }
    });
  }
}

function buildGeminiPayload(messages, jsonMode) {
  const systemText = messages
    .filter((message) => message.role === "system")
    .map((message) => textFromContent(message.content))
    .filter(Boolean)
    .join("\n\n");

  const contents = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: partsFromContent(message.content)
    }))
    .filter((content) => content.parts.length > 0);

  const payload = {
    contents,
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1400
    }
  };

  if (jsonMode) {
    payload.generationConfig.responseMimeType = "application/json";
  }

  if (systemText) {
    payload.systemInstruction = {
      parts: [{ text: systemText }]
    };
  }

  return payload;
}

function partsFromContent(content) {
  if (typeof content === "string") {
    return content.trim() ? [{ text: content }] : [];
  }

  if (!Array.isArray(content)) {
    return [];
  }

  return content.flatMap((part) => {
    if (part.type === "text" && part.text) {
      return [{ text: part.text }];
    }

    const imageUrl = part.type === "image_url" ? part.image_url?.url : "";
    if (imageUrl) {
      const image = dataUrlToInlineData(imageUrl);
      return image ? [{ inline_data: image }] : [];
    }

    return [];
  });
}

function textFromContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part.type === "text" && part.text)
    .map((part) => part.text)
    .join("\n");
}

function dataUrlToInlineData(dataUrl) {
  const match = String(dataUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;

  return {
    mime_type: match[1],
    data: match[2]
  };
}

function toOpenAIShape(data) {
  const text = data?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim() || "";

  return {
    choices: [
      {
        message: {
          content: text
        }
      }
    ]
  };
}
