// core/plugins/CachePlugin.js
const fs = require("fs-extra");
const path = require("path");

module.exports = ({ app, options = {} } = {}) => {
  if (!app) throw new Error("CachePlugin: app é obrigatório");

  // Registro do plugin
  if (typeof app?.pluginsNames === "object")
    app.pluginsNames.CachePlugin = true;

  const ROOT = options.root ?? path.join(process.cwd(), "mydb"); // raiz do cache
  fs.ensureDirSync(ROOT);

  const DEFAULT_TTL = options.ttl ?? 0; // 0 = nunca expira
  const CLEANUP_INTERVAL_MS = options.cleanupIntervalMs ?? 0;
  const CACHE_FILE = path.join(ROOT, options.cacheFile ?? "cache.json");

  const store = new Map();
  const stats = { hits: 0, misses: 0, sets: 0, deletes: 0, clears: 0 };
  let cleanupHandle = null;
  const now = () => Date.now();

  // ---------------------------
  // TTL
  // ---------------------------
  const getExpiresAt = (ttl) => {
    if (ttl == null || ttl === false || ttl === 0) return 0;
    if (typeof ttl === "number") return now() + ttl;
    if (typeof ttl === "object" && ttl.val && ttl.tipo) {
      const factor = {
        segundo: 1000,
        s: 1000,
        minuto: 60_000,
        m: 60_000,
        hora: 3_600_000,
        h: 3_600_000,
        dia: 86_400_000,
        d: 86_400_000,
      }[ttl.tipo.toLowerCase()];
      return factor ? now() + ttl.val * factor : 0;
    }
    return 0;
  };

  const isExpired = (entry) =>
    entry?.expiresAt !== 0 && now() > entry.expiresAt;

  // ---------------------------
  // Persistência em JSON
  // ---------------------------
  const saveCacheToFile = async () => {
    try {
      const obj = {};
      for (const [key, entry] of store.entries()) {
        obj[key] = { value: entry.value, expiresAt: entry.expiresAt };
      }
      await fs.ensureFile(CACHE_FILE);
      await fs.writeJSON(CACHE_FILE, obj, { spaces: 2 });
    } catch (err) {
      console.error("CachePlugin: erro ao salvar cache:", err);
    }
  };

  const loadCacheFromFile = async () => {
    try {
      const exists = await fs.pathExists(CACHE_FILE);
      if (!exists) return;
      const obj = await fs.readJSON(CACHE_FILE);
      for (const [key, entry] of Object.entries(obj)) {
        store.set(key, entry);
      }
    } catch (err) {
      console.warn(
        "CachePlugin: não foi possível ler cache do arquivo:",
        err.message
      );
    }
  };

  // ---------------------------
  // Cleanup automático
  // ---------------------------
  const purgeExpired = () => {
    for (const [key, entry] of store.entries()) {
      if (isExpired(entry)) {
        store.delete(key);
        stats.deletes++;
      }
    }
  };

  const startCleanup = (intervalMs) => {
    if (cleanupHandle || !intervalMs || intervalMs <= 0) return;
    cleanupHandle = setInterval(async () => {
      purgeExpired();
      await saveCacheToFile();
    }, intervalMs);
    if (cleanupHandle.unref) cleanupHandle.unref();
  };

  const stopCleanup = () => {
    if (cleanupHandle) clearInterval(cleanupHandle);
    cleanupHandle = null;
  };

  // ---------------------------
  // API Pública
  // ---------------------------
  const set = (key, value, ttl = DEFAULT_TTL) => {
    store.set(key, { value, expiresAt: getExpiresAt(ttl) });
    stats.sets++;
    saveCacheToFile();
    return true;
  };

  const get = (key, defaultValue = null) => {
    const entry = store.get(key);
    if (!entry || isExpired(entry)) {
      if (entry) {
        store.delete(key);
        stats.deletes++;
      }
      stats.misses++;
      return defaultValue;
    }
    stats.hits++;
    return entry.value;
  };

  const has = (key) => {
    const entry = store.get(key);
    if (!entry) return false;
    if (isExpired(entry)) {
      store.delete(key);
      stats.deletes++;
      return false;
    }
    return true;
  };

  const del = (key) => {
    const existed = store.delete(key);
    if (existed) stats.deletes++;
    saveCacheToFile();
    return existed;
  };

  const clear = () => {
    store.clear();
    stats.clears++;
    saveCacheToFile();
    return true;
  };

  const invalidate = (pattern) => {
    let removed = 0;
    if (pattern instanceof RegExp) {
      for (const key of [...store.keys()]) {
        if (pattern.test(key)) {
          store.delete(key);
          removed++;
          stats.deletes++;
        }
      }
    } else if (pattern) {
      const str = String(pattern);
      for (const key of [...store.keys()]) {
        if (key.includes(str)) {
          store.delete(key);
          removed++;
          stats.deletes++;
        }
      }
    }
    saveCacheToFile();
    return removed;
  };

  const keys = () => [...store.keys()].filter((k) => !isExpired(store.get(k)));
  const size = () => keys().length;
  const getStats = () => ({ ...stats, size: size() });

  // ---------------------------
  // Inicialização
  // ---------------------------
  loadCacheFromFile();
  if (CLEANUP_INTERVAL_MS > 0) startCleanup(CLEANUP_INTERVAL_MS);

  // ---------------------------
  // Expor API
  // ---------------------------
  const cacheAPI = {
    set,
    get,
    has,
    del,
    clear,
    invalidate,
    keys,
    size,
    getStats,
    startCleanup,
    stopCleanup,
    ROOT,
  };
  app.cache = cacheAPI;
  return cacheAPI;
};
