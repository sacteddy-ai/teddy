function requireKv(env) {
  const kv = env?.TEDDY_KV;
  if (!kv) {
    throw new Error("KV binding 'TEDDY_KV' is required (Cloudflare KV).");
  }
  return kv;
}

export async function kvGetJson(env, key, defaultValue) {
  const kv = requireKv(env);
  const value = await kv.get(String(key), { type: "json" });
  if (value === null || value === undefined) {
    return defaultValue;
  }
  return value;
}

export async function kvPutJson(env, key, value) {
  const kv = requireKv(env);
  await kv.put(String(key), JSON.stringify(value ?? null));
}

