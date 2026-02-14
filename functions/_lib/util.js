const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function nowIso() {
  return new Date().toISOString();
}

export function normalizeWhitespace(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeWord(value) {
  return normalizeWhitespace(value).toLowerCase();
}

export function normalizeIngredientKey(value) {
  let normalized = normalizeWord(value);
  normalized = normalized.replace(/[\s\-]+/g, "_");
  normalized = normalized.replace(/[^\p{L}\p{N}_]+/gu, "_");
  normalized = normalized.replace(/_+/g, "_");
  normalized = normalized.replace(/^_+|_+$/g, "");
  return normalized;
}

export function removeKoreanParticleSuffix(value) {
  let trimmed = String(value || "");
  if (!trimmed) {
    return trimmed;
  }

  const suffixes = [
    "이에요",
    "예요",
    "이야",
    "야",
    "은",
    "는",
    "이",
    "가",
    "을",
    "를",
    "와",
    "과",
    "도",
    "고",
    "만",
    "까지",
    "에서",
    "부터"
  ];

  // Strip up to a few stacked endings, e.g. "마늘짱아치이고" -> "마늘짱아치".
  for (let iter = 0; iter < 3; iter += 1) {
    let changed = false;
    for (const suffix of suffixes) {
      if (trimmed.endsWith(suffix) && trimmed.length > suffix.length + 1) {
        trimmed = trimmed.slice(0, -suffix.length);
        changed = true;
        break;
      }
    }
    if (!changed) {
      break;
    }
  }

  return trimmed;
}

let stopwordMapCache = null;

export function getDefaultStopwordMap() {
  if (stopwordMapCache) {
    return stopwordMapCache;
  }

  const stopwords = [
    "this",
    "that",
    "is",
    "are",
    "a",
    "an",
    "the",
    "and",
    "or",
    "to",
    "with",
    "plus",
    "이거",
    "저거",
    "그거",
    "이건",
    "저건",
    "그건",
    "이거는",
    "저거는",
    "그거는",
    "그리고",
    "또",
    "이거야",
    "저거야",
    "그거야",
    "입니다",
    "이고",
    "하고",
    "및",
    // Spatial / sequencing filler words (Korean)
    "그",
    "옆",
    "그옆",
    "다음",
    "그다음",
    "왼쪽",
    "오른쪽",
    "가운데",
    "중간",
    "위쪽",
    "아래쪽",
    "앞쪽",
    "뒤쪽",
    "윗칸",
    "아랫칸",
    "칸",
    "선반",
    "서랍",
    "냉장실",
    "냉동실"
  ];

  const map = new Map();
  for (const sw of stopwords) {
    const token = normalizeWord(sw);
    if (token) {
      map.set(token, true);
    }
  }

  stopwordMapCache = map;
  return map;
}

export function isLikelySpatialOrOrdinalToken(token) {
  const t = normalizeWord(token);
  if (!t) {
    return false;
  }

  // Ordinals / slot descriptors, e.g. "첫번째거", "3번째", "둘째"
  if (t.includes("번째") || t.endsWith("째")) {
    return true;
  }

  // Locative tails often used in spatial descriptions, e.g. "위에서", "냉장실에서"
  if (t.endsWith("에서") || t.endsWith("부터")) {
    return true;
  }

  // "아랫칸", "윗칸", "2칸" etc.
  if (t.endsWith("칸") && t.length <= 5) {
    return true;
  }

  // Common combined fillers without spaces, e.g. "그옆"
  if (/^그(옆|다음|위|아래|왼쪽|오른쪽|가운데|중간)/u.test(t)) {
    return true;
  }

  return false;
}

export function normalizeReviewPhraseValue(value, stopwordMap = null) {
  const raw = String(value || "");
  if (!raw.trim()) {
    return "";
  }

  const sw = stopwordMap || getDefaultStopwordMap();
  const parts = raw
    .split(/[^\p{L}\p{N}_]+/gu)
    .map((v) => v.trim())
    .filter((v) => v.length > 0);

  if (parts.length === 0) {
    return "";
  }

  const normalizedTokens = [];
  for (const part of parts) {
    let token = normalizeWord(part);
    if (!token) {
      continue;
    }

    token = removeKoreanParticleSuffix(token);
    token = normalizeWhitespace(token);
    if (!token) {
      continue;
    }

    if (sw.has(token)) {
      continue;
    }
    if (/^\d+$/.test(token)) {
      continue;
    }
    if (isLikelySpatialOrOrdinalToken(token)) {
      continue;
    }

    normalizedTokens.push(token);
  }

  if (normalizedTokens.length === 0) {
    return "";
  }

  return normalizeWhitespace(normalizedTokens.join(" "));
}

export function parseIsoDateToEpochDay(value) {
  const raw = String(value || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) {
    throw new Error(`Invalid date format: '${raw}'. Use ISO date like 2026-02-13.`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const ms = Date.UTC(year, month - 1, day);
  const dt = new Date(ms);
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) {
    throw new Error(`Invalid date value: '${raw}'.`);
  }
  return Math.floor(ms / MS_PER_DAY);
}

export function parseDateOrDateTimeToEpochDay(value) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }

  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return parseIsoDateToEpochDay(raw);
  }

  const parsedMs = Date.parse(raw);
  if (!Number.isFinite(parsedMs)) {
    throw new Error(`Invalid date format: '${raw}'. Use ISO date like 2026-02-13.`);
  }

  const dt = new Date(parsedMs);
  const ms = Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
  return Math.floor(ms / MS_PER_DAY);
}

export function epochDayToIso(epochDay) {
  const ms = Number(epochDay) * MS_PER_DAY;
  const dt = new Date(ms);
  const yyyy = String(dt.getUTCFullYear()).padStart(4, "0");
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function todayEpochDay() {
  const now = new Date();
  const ms = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor(ms / MS_PER_DAY);
}

export function clampNumber(value, fallback, min = null, max = null) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  if (min !== null && n < min) {
    return min;
  }
  if (max !== null && n > max) {
    return max;
  }
  return n;
}

export function safeString(value, fallback = "") {
  const v = String(value ?? "").trim();
  return v || fallback;
}
