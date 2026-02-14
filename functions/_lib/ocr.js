import { epochDayToIso, parseIsoDateToEpochDay, todayEpochDay } from "./util.js";

function convertMatchToEpochDay(match) {
  const yearText = match.groups?.year;
  const monthText = match.groups?.month;
  const dayText = match.groups?.day;
  if (!yearText || !monthText || !dayText) {
    return null;
  }

  let year = Number(yearText);
  if (String(yearText).length === 2) {
    year = 2000 + year;
  }
  const month = Number(monthText);
  const day = Number(dayText);

  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  try {
    return parseIsoDateToEpochDay(iso);
  } catch {
    return null;
  }
}

export function parseOcrExpirationDate(rawText) {
  const raw = String(rawText || "");
  if (!raw.trim()) {
    throw new Error("raw_text is required.");
  }

  const normalized = raw.toUpperCase();

  const keywordPatterns = [
    /(EXP|EXPIRY|EXPIRES|BEST\s*BEFORE|USE\s*BY)\D*(?<year>\d{2,4})[.\-\/](?<month>\d{1,2})[.\-\/](?<day>\d{1,2})/i,
    /(EXP|EXPIRY|EXPIRES|BEST\s*BEFORE|USE\s*BY)\D*(?<year>\d{2,4})(?<month>\d{2})(?<day>\d{2})/i
  ];

  for (const re of keywordPatterns) {
    const m = re.exec(normalized);
    if (!m) {
      continue;
    }
    const epochDay = convertMatchToEpochDay(m);
    if (epochDay !== null) {
      return {
        parsed_expiration_date: epochDayToIso(epochDay),
        parser_confidence: "high",
        matched_pattern: "keyword_date",
        raw_match: m[0]
      };
    }
  }

  const genericPatterns = [
    /(?<year>\d{4})[.\-\/](?<month>\d{1,2})[.\-\/](?<day>\d{1,2})/g,
    /(?<year>\d{2})[.\-\/](?<month>\d{1,2})[.\-\/](?<day>\d{1,2})/g,
    /(?<year>\d{4})(?<month>\d{2})(?<day>\d{2})/g
  ];

  const dates = [];
  for (const re of genericPatterns) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(normalized))) {
      const epochDay = convertMatchToEpochDay(m);
      if (epochDay !== null) {
        dates.push({ epochDay, raw: m[0] });
      }
    }
    if (dates.length > 0) {
      break;
    }
  }

  if (dates.length === 0) {
    return {
      parsed_expiration_date: null,
      parser_confidence: "none",
      matched_pattern: null,
      raw_match: null
    };
  }

  const today = todayEpochDay();
  const future = dates.filter((d) => d.epochDay >= today).sort((a, b) => a.epochDay - b.epochDay);
  const selected =
    future.length > 0 ? future[0] : dates.sort((a, b) => b.epochDay - a.epochDay)[0];

  return {
    parsed_expiration_date: epochDayToIso(selected.epochDay),
    parser_confidence: "medium",
    matched_pattern: "generic_date",
    raw_match: selected.raw
  };
}

