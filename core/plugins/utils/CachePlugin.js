const fs = require("fs-extra");
const path = require("path");

module.exports = ({ app, options = {} } = {}) => {
  if (!app) throw new Error("CachePlugin: app é obrigatório");

  // Registro do plugin
  if (typeof app?.pluginsNames === "object") {
    app.pluginsNames.CachePlugin = true;
  }

  // ---------------------------
  // Configurações
  // ---------------------------
  const ROOT = options.root ?? path.join(process.cwd(), "mydb");
  fs.ensureDirSync(ROOT);

  const DEFAULT_TTL = options.ttl ?? 0; // 0 = nunca expira
  const CACHE_FILE = path.join(ROOT, options.cacheFile ?? "cache.json");

  const store = new Map();
  const stats = { hits: 0, misses: 0, sets: 0, deletes: 0, clears: 0 };
  let cleanupHandle = null;
  let saveTimeout = null;

  const now = () => Date.now();

  // ---------------------------
  // Conversão de unidades de tempo
  // ---------------------------
  const timeMap = {
    s: 1000,
    segundo: 1000,
    segundos: 1000,
    m: 60000,
    minuto: 60000,
    minutos: 60000,
    h: 3600000,
    hora: 3600000,
    horas: 3600000,
    d: 86400000,
    dia: 86400000,
    dias: 86400000,
  };

  // Calcula o timestamp de expiração com base no TTL
  const getExpiresAt = (ttl) => {
    if (ttl == null || ttl === false || ttl === 0) return 0; // nunca expira

    if (typeof ttl === "number") return now() + ttl;

    if (
      typeof ttl === "object" &&
      ttl.val != null &&
      typeof ttl.tipo === "string"
    ) {
      const unit = ttl.tipo.toLowerCase();
      const factor = timeMap[unit];
      if (factor != null) return now() + ttl.val * factor;
    }

    return 0; // fallback: nunca expira
  };

  // Converte intervalo para milissegundos (0 = desativado)
  const parseInterval = (interval) => {
    if (interval == null || interval === 0 || interval === false) return 0;

    if (typeof interval === "number") return interval;

    if (
      typeof interval === "object" &&
      interval.val != null &&
      typeof interval.tipo === "string"
    ) {
      const unit = interval.tipo.toLowerCase();
      const factor = timeMap[unit];
      if (factor == null) {
        throw new Error(`Unidade de tempo desconhecida: ${interval.tipo}`);
      }
      return interval.val * factor;
    }

    throw new Error(
      "Intervalo inválido. Use número (ms) ou {val: N, tipo: 'unidade'}"
    );
  };

  // Verifica se uma entrada expirou
  const isExpired = (entry) =>
    entry && entry.expiresAt !== 0 && now() > entry.expiresAt;

  // ---------------------------
  // Persistência (com debounce)
  // ---------------------------
  const saveCacheToFile = () => {
    if (saveTimeout) clearTimeout(saveTimeout);

    saveTimeout = setTimeout(async () => {
      try {
        const obj = {};
        for (const [key, entry] of store.entries()) {
          if (!isExpired(entry)) {
            obj[key] = { value: entry.value, expiresAt: entry.expiresAt };
          }
        }
        await fs.ensureFile(CACHE_FILE);
        await fs.writeJSON(CACHE_FILE, obj, { spaces: 2 });
      } catch (err) {
        console.error("CachePlugin: erro ao salvar cache:", err);
      }
    }, 500);
  };

  const loadCacheFromFile = async () => {
    try {
      if (!(await fs.pathExists(CACHE_FILE))) return;
      const obj = await fs.readJSON(CACHE_FILE);
      for (const [key, entry] of Object.entries(obj)) {
        if (!isExpired(entry)) {
          store.set(key, entry);
        }
      }
    } catch (err) {
      console.warn("CachePlugin: erro ao carregar cache:", err.message);
    }
  };

  // ---------------------------
  // API Pública
  // ---------------------------
  const set = (key, value, ttl = DEFAULT_TTL) => {
    const expiresAt = getExpiresAt(ttl);
    store.set(key, { value, expiresAt });
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
    if (existed) {
      stats.deletes++;
      saveCacheToFile();
    }
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
    const keysToTest = [...store.keys()];
    const isRegExp = pattern instanceof RegExp;

    for (const key of keysToTest) {
      const match = isRegExp
        ? pattern.test(key)
        : key.includes(String(pattern));
      if (match) {
        store.delete(key);
        removed++;
        stats.deletes++;
      }
    }
    if (removed > 0) saveCacheToFile();
    return removed;
  };

  const keys = () => [...store.keys()].filter((k) => !isExpired(store.get(k)));
  const size = () => keys().length;
  const getStats = () => ({ ...stats, size: size() });

  // const ttlRemaining = async ({ key }) => {
  //   await loadCacheFromFile();
  //   const entry = store.get(key);
  //   if (!entry) return "Inexistente";
  //   if (entry.expiresAt === 0) return "Infinito";
  //   const diff = entry.expiresAt - now();
  //   if (diff <= 0) return "Expirado";
  //   return `${Math.round(diff / 1000)}s restantes`;
  // };

  const ttlRemaining = async ({ key }) => {
    // Opcional: recarregar do disco para garantir estado atualizado
    await loadCacheFromFile();

    const entry = store.get(key);
    if (!entry) return "Inexistente";
    if (entry.expiresAt === 0) return "Infinito";

    const diffMs = entry.expiresAt - now();
    if (diffMs <= 0) return "Expirado";

    // Converter milissegundos para h, m, s
    const totalSeconds = Math.floor(diffMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`); // mostra "0s" se for exatamente 0

    return `${parts.join(" ")} restantes`;
  };

  // ---------------------------
  // Limpeza automática
  // ---------------------------
  const purgeExpired = () => {
    for (const [key, entry] of store.entries()) {
      if (isExpired(entry)) {
        store.delete(key);
        stats.deletes++;
      }
    }
  };

  const startCleanup = (interval) => {
    const intervalMs = parseInterval(interval);
    if (intervalMs <= 0 || cleanupHandle) return;

    cleanupHandle = setInterval(() => {
      purgeExpired();
      saveCacheToFile();
    }, intervalMs);

    if (cleanupHandle.unref) cleanupHandle.unref();
  };

  const stopCleanup = () => {
    if (cleanupHandle) {
      clearInterval(cleanupHandle);
      cleanupHandle = null;
    }
  };

  // ---------------------------
  // Inicialização
  // ---------------------------
  // Define intervalo de limpeza: padrão = 3 horas, a menos que definido
  const cleanupIntervalMs = options.cleanupIntervalMs ?? {
    val: 3,
    tipo: "hora",
  };

  loadCacheFromFile();
  startCleanup(cleanupIntervalMs);

  // ---------------------------
  // Exposição da API
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
    ttlRemaining,
    ROOT,
  };

  app.cache = cacheAPI;
  return cacheAPI;
};
