const cache = new Map();

export async function loadStaticJson(context, assetPath) {
  const path = String(assetPath || "");
  if (!path.startsWith("/")) {
    throw new Error(`assetPath must start with '/': ${path}`);
  }

  if (cache.has(path)) {
    return cache.get(path);
  }

  const url = new URL(path, context.request.url);
  const req = new Request(url.toString(), { method: "GET", headers: { Accept: "application/json" } });

  // Prefer local asset fetch when available (Cloudflare Pages Functions).
  const assets = context?.env?.ASSETS;
  const res =
    assets && typeof assets.fetch === "function"
      ? await assets.fetch(req)
      : await fetch(req);

  if (!res.ok) {
    throw new Error(`Failed to load static json asset '${path}': ${res.status}`);
  }

  const data = await res.json();
  cache.set(path, data);
  return data;
}
