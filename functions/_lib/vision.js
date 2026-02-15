import { safeString } from "./util.js";

function resolveOpenAiConfig(env) {
  const apiKey = safeString(env?.OPENAI_API_KEY, "");
  const baseUrl = safeString(env?.OPENAI_BASE_URL, "https://api.openai.com/v1");
  const model = safeString(env?.OPENAI_VISION_MODEL, "gpt-4.1-mini");
  return { apiKey, baseUrl, model };
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return null;
  }
  return Math.min(1, Math.max(0, n));
}

function normalizeBbox(raw) {
  const x = clamp01(raw?.x);
  const y = clamp01(raw?.y);
  const w = clamp01(raw?.w);
  const h = clamp01(raw?.h);
  if (x === null || y === null || w === null || h === null) {
    return null;
  }
  if (w <= 0 || h <= 0) {
    return null;
  }
  // Ensure it fits in [0..1].
  const ww = Math.min(w, 1 - x);
  const hh = Math.min(h, 1 - y);
  if (ww <= 0 || hh <= 0) {
    return null;
  }
  return {
    x: Math.round(x * 10000) / 10000,
    y: Math.round(y * 10000) / 10000,
    w: Math.round(ww * 10000) / 10000,
    h: Math.round(hh * 10000) / 10000
  };
}

export async function detectIngredientsFromImage(context, imageDataUrl, textHint = null, options = {}) {
  const { apiKey, baseUrl, model } = resolveOpenAiConfig(context.env);
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for vision detection.");
  }

  const hint = textHint && String(textHint).trim() ? `User hint: ${String(textHint).trim()}` : "";
  const uiLang = options?.ui_lang ? String(options.ui_lang).trim().toLowerCase() : "";
  const langHint = uiLang === "ko" ? "Language: Korean" : uiLang ? `Language: ${uiLang}` : "";
  const prompt = [
    "You are a fridge ingredient detector.",
    "From the image, identify individual food items (ingredients, packaged foods, or prepared dishes).",
    "For each item, return a name and a bounding box.",
    "Bounding box format: normalized coordinates in [0..1] relative to the image.",
    "- x, y: top-left corner",
    "- w, h: width and height",
    "",
    "Return ONLY JSON with this shape:",
    "{\"detected_objects\": [{\"name\": \"...\", \"bbox\": {\"x\": 0.1, \"y\": 0.2, \"w\": 0.3, \"h\": 0.4}}]}",
    "Rules:",
    "- Use short ingredient names (not brands).",
    "- No duplicates.",
    "- Max 12 items.",
    "- If uncertain, omit the item."
  ];
  if (langHint) {
    prompt.push(langHint);
  }
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

  const rawObjects = Array.isArray(obj?.detected_objects) ? obj.detected_objects : [];
  const detectedObjects = [];
  const detectedItems = [];
  const seen = new Set();

  for (const raw of rawObjects) {
    const name = raw?.name ? String(raw.name).trim() : "";
    if (!name) {
      continue;
    }
    const bbox = normalizeBbox(raw?.bbox);
    if (!bbox) {
      continue;
    }

    const key = name.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    detectedObjects.push({ name, bbox });
    detectedItems.push(name);
    if (detectedObjects.length >= 12) {
      break;
    }
  }

  return {
    detected_items: detectedItems,
    detected_objects: detectedObjects,
    provider: "openai",
    model,
    segmentation: {
      provider: detectedObjects.length > 0 ? "openai_bbox" : "none",
      segment_count: detectedObjects.length,
      warnings: detectedObjects.length > 0 ? [] : ["no_objects"]
    },
    raw: { id: parsed?.id || null }
  };
}
