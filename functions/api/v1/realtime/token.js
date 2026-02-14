import { jsonResponse, errorResponse, withOptionsCors, readJsonOptional } from "../../../_lib/http.js";
import { clampNumber, safeString } from "../../../_lib/util.js";

function resolveOpenAiRealtimeConfig(env) {
  const apiKey = safeString(env?.OPENAI_API_KEY, "");
  const baseUrl = safeString(env?.OPENAI_BASE_URL, "https://api.openai.com/v1");
  const model = safeString(env?.OPENAI_REALTIME_MODEL, "gpt-realtime");
  const voice = safeString(env?.OPENAI_REALTIME_VOICE, "alloy");
  const instructions = safeString(
    env?.OPENAI_REALTIME_INSTRUCTIONS,
    "You are a helpful fridge assistant. You may receive camera snapshots as images. Speak naturally, describe visible ingredients when asked, and ask short clarification questions when uncertain."
  );
  const transcriptionModel = safeString(env?.OPENAI_REALTIME_TRANSCRIPTION_MODEL, "whisper-1");
  const transcriptionLanguage = safeString(env?.OPENAI_REALTIME_TRANSCRIPTION_LANGUAGE, "ko");
  return { apiKey, baseUrl, model, voice, instructions, transcriptionModel, transcriptionLanguage };
}

async function requestClientSecret(cfg, body) {
  const url = `${cfg.baseUrl.replace(/\/+$/, "")}/realtime/client_secrets`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
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
      text ||
      `Realtime token request failed: ${res.status}`;
    const err = new Error(errMsg);
    err.status = res.status;
    err.raw = text;
    throw err;
  }

  return parsed;
}

function isSameOriginRequest(context) {
  const expected = new URL(context.request.url).origin;
  const origin = safeString(context.request.headers.get("Origin"), "");
  if (origin) {
    return origin === expected;
  }
  const referer = safeString(context.request.headers.get("Referer"), "");
  if (referer) {
    return referer.startsWith(expected);
  }
  return false;
}

export async function onRequest(context) {
  const method = context.request.method.toUpperCase();
  if (method === "OPTIONS") {
    return withOptionsCors(context);
  }
  if (method !== "POST") {
    return errorResponse(context, "Not found.", 404);
  }

  try {
    // Avoid turning your Pages project into a public token minting service.
    if (safeString(context.env?.ALLOW_REALTIME_TOKEN_ANY_ORIGIN, "").toLowerCase() !== "true") {
      if (!isSameOriginRequest(context)) {
        return errorResponse(context, "Forbidden.", 403);
      }
    }

    const payload = await readJsonOptional(context.request);
    const cfg = resolveOpenAiRealtimeConfig(context.env);
    if (!cfg.apiKey) {
      throw new Error("OPENAI_API_KEY is required for realtime token.");
    }

    const model = safeString(payload?.model, cfg.model);
    const voice = safeString(payload?.voice, cfg.voice);
    const instructions = safeString(payload?.instructions, cfg.instructions);
    const expiresSeconds = clampNumber(payload?.expires_seconds, 600, 30, 600);
    const transcriptionModel = safeString(payload?.transcription_model, cfg.transcriptionModel);
    const transcriptionLanguage = safeString(payload?.transcription_language, cfg.transcriptionLanguage);

    // Match current Realtime schema:
    // - transcription: session.audio.input.transcription
    // - VAD: session.audio.input.turn_detection
    const sessionPrimary = {
      type: "realtime",
      model,
      instructions,
      audio: {
        input: {
          // Helps for phone mic in near-field situations.
          noise_reduction: { type: "near_field" },
          transcription: transcriptionModel
            ? {
                model: transcriptionModel,
                language: transcriptionLanguage || undefined
              }
            : undefined,
          turn_detection: {
            type: "server_vad",
            // We only want the transcript for inventory capture unless the UI explicitly requests a reply.
            create_response: false
          }
        },
        output: { voice }
      }
    };

    // Some deployments may reject turn_detection updates; keep transcription enabled.
    const sessionFallback = {
      type: "realtime",
      model,
      instructions,
      audio: {
        input: {
          noise_reduction: { type: "near_field" },
          transcription: transcriptionModel
            ? {
                model: transcriptionModel,
                language: transcriptionLanguage || undefined
              }
            : undefined
        },
        output: { voice }
      }
    };

    const baseBody = {
      expires_after: { anchor: "created_at", seconds: expiresSeconds }
    };

    let parsed = null;
    try {
      parsed = await requestClientSecret(cfg, { ...baseBody, session: sessionPrimary });
    } catch (err) {
      const msg = safeString(err?.message, "");
      if (/Unknown parameter/i.test(msg) || /Missing required parameter/i.test(msg)) {
        parsed = await requestClientSecret(cfg, { ...baseBody, session: sessionFallback });
      } else {
        throw err;
      }
    }

    const value = safeString(parsed?.value, "");
    if (!value) {
      throw new Error("Realtime token response did not include value.");
    }

    return jsonResponse(context, {
      data: {
        value,
        expires_at: parsed?.expires_at ?? null,
        session: parsed?.session ?? null
      }
    });
  } catch (err) {
    return errorResponse(context, err?.message || String(err));
  }
}
