import { jsonResponse, errorResponse, withOptionsCors } from "../../../_lib/http.js";
import { getIngredientCatalogEntries } from "../../../_lib/catalog.js";
import { normalizeWord } from "../../../_lib/util.js";

export async function onRequest(context) {
  const method = context.request.method.toUpperCase();
  if (method === "OPTIONS") {
    return withOptionsCors(context);
  }
  if (method !== "GET") {
    return errorResponse(context, "Not found.", 404);
  }

  try {
    const url = new URL(context.request.url);
    const userId = (url.searchParams.get("user_id") || "demo-user").trim() || "demo-user";
    const query = (url.searchParams.get("q") || "").trim();
    const topN = Number(url.searchParams.get("top_n") || 50);
    const limit = Number.isFinite(topN) && topN > 0 ? Math.min(500, Math.floor(topN)) : 50;

    let items = await getIngredientCatalogEntries(context, userId);

    if (query) {
      const nq = normalizeWord(query);
      items = items.filter((entry) => {
        const name = normalizeWord(entry.display_name || entry.ingredient_key || "");
        if (name.includes(nq)) {
          return true;
        }
        const aliases = Array.isArray(entry.aliases) ? entry.aliases : [];
        return aliases.some((a) => normalizeWord(a).includes(nq));
      });
    }

    items.sort((a, b) => String(a.display_name).localeCompare(String(b.display_name)));
    const limited = items.slice(0, limit);

    return jsonResponse(context, {
      data: {
        items: limited,
        count: limited.length
      }
    });
  } catch (err) {
    return errorResponse(context, err?.message || String(err), 400);
  }
}

