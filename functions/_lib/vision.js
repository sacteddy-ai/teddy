import { safeString } from "./util.js";

function resolveOpenAiConfig(env) {
  const apiKey = safeString(env?.OPENAI_API_KEY, "");
  const baseUrl = safeString(env?.OPENAI_BASE_URL, "https://api.openai.com/v1");
  const model = safeString(env?.OPENAI_VISION_MODEL, "gpt-4.1-mini");
  return { apiKey, baseUrl, model };
}

export async function detectIngredientsFromImage(context, imageDataUrl, textHint = null) {
  const { apiKey, baseUrl, model } = resolveOpenAiConfig(context.env);
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for vision detection.");
  }

  const hint = textHint && String(textHint).trim() ? `User hint: ${String(textHint).trim()}` : "";
  const prompt = [
    "You are a fridge ingredient detector.",
    "From the image, list food ingredients you can confidently identify.",
    "Return ONLY JSON with this shape: {\"detected_items\": [string, ...]}",
    "Rules:",
    "- Use short ingredient names (not brands).",
    "- No duplicates.",
    "- Max 12 items.",
    "- If uncertain, omit the item."
  ];
  if (hint) {
    prompt.push(hint);
  }

  const payload = {
    model,
    temperature: 0.2,
    messages: [
      { role: "system", content: "Return JSON only." },
      {
        role: "user",
        content: [
          { type: "text", text: prompt.join("\n") },
          { type: "image_url", image_url: { url: String(imageDataUrl), detail: "low" } }
        ]
      }
    ],
    response_format: { type: "json_object" }
  };

  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    const errMsg =
      parsed?.error?.message ||
      parsed?.message ||
      `Vision request failed: ${res.status}`;
    throw new Error(errMsg);
  }

  const content = parsed?.choices?.[0]?.message?.content ?? "";
  let obj = null;
  try {
    obj = content ? JSON.parse(content) : null;
  } catch {
    obj = null;
  }

  const items = Array.isArray(obj?.detected_items) ? obj.detected_items : [];
  const normalized = [];
  const seen = new Set();
  for (const raw of items) {
    const value = String(raw || "").trim();
    if (!value) {
      continue;
    }
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(value);
    if (normalized.length >= 12) {
      break;
    }
  }

  return {
    detected_items: normalized,
    provider: "openai",
    model,
    segmentation: {
      provider: "none",
      segment_count: 1,
      warnings: []
    },
    raw: { id: parsed?.id || null }
  };
}

