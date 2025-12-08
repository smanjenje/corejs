// core/plugins/CachePlugin.js
// Plugin de cache para CoreJS — versão com melhorias (cleanup, stats, invalidation por RegExp)

module.exports = ({ app, options = {} } = {}) => {
  // Configurações padrão
  const DEFAULT_TTL = options.ttl ?? 0; // 0 = never expire
  const CLEANUP_INTERVAL_MS = options.cleanupIntervalMs ?? 0; // 0 = disabled

  // Objeto Tempo (ms)
  const Tempo = {
    SEGUNDO: 1000,
    MINUTO: 60 * 1000,
    HORA: 60 * 60 * 1000,
    DIA: 24 * 60 * 60 * 1000,
    SEMANA: 7 * 24 * 60 * 60 * 1000,
    MES: 30 * 24 * 60 * 60 * 1000,
    ANO: 365 * 24 * 60 * 60 * 1000,

    time: (val, tipo) => {
      if (typeof val !== "number" || val < 0) {
        throw new Error("Tempo inválido: val deve ser número >= 0");
      }
      if (!tipo || typeof tipo !== "string") {
        throw new Error("Tipo de tempo inválido: deve ser string");
      }
      const tipoNorm = tipo.toLowerCase();
      const tipos = {
        segundo: Tempo.SEGUNDO,
        segundos: Tempo.SEGUNDO,
        s: Tempo.SEGUNDO,
        minuto: Tempo.MINUTO,
        minutos: Tempo.MINUTO,
        m: Tempo.MINUTO,
        hora: Tempo.HORA,
        horas: Tempo.HORA,
        h: Tempo.HORA,
        dia: Tempo.DIA,
        dias: Tempo.DIA,
        d: Tempo.DIA,
        semana: Tempo.SEMANA,
        semanas: Tempo.SEMANA,
        semanaS: Tempo.SEMANA,
        mes: Tempo.MES,
        meses: Tempo.MES,
        ano: Tempo.ANO,
        anos: Tempo.ANO,
      };

      const factor = tipos[tipoNorm];
      if (!factor) {
        throw new Error(`Tipo de tempo inválido: ${tipo}`);
      }

      return val * factor;
    },
  };

  // Cache interno: Map<key, { value, expiresAt }>
  const store = new Map();

  // Estatísticas
  const stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    clears: 0,
  };

  // Cleanup interval handle
  let cleanupHandle = null;

  // Funções internas
  const now = () => Date.now();

  const getExpiresAt = (ttl) => {
    const t = ttl === undefined ? DEFAULT_TTL : ttl;
    if (!t || t === 0) return 0; // 0 => never expire

    if (typeof t === "number") {
      if (t < 0) return 0;
      return now() + t;
    }

    if (typeof t === "object" && t !== null) {
      const { val, tipo } = t;
      return now() + Tempo.time(Number(val), tipo);
    }

    // Fallback: treat as never expire
    return 0;
  };

  const isExpired = (entry) => {
    if (!entry) return true;
    if (entry.expiresAt === 0) return false;
    return now() > entry.expiresAt;
  };

  const purgeExpired = () => {
    for (const [key, entry] of store.entries()) {
      if (isExpired(entry)) {
        store.delete(key);
        stats.deletes++;
      }
    }
  };

  const startCleanup = (intervalMs) => {
    if (cleanupHandle) return;
    if (!intervalMs || intervalMs <= 0) return;
    cleanupHandle = setInterval(() => {
      try {
        purgeExpired();
      } catch (err) {
        // Não propagar erros do cleanup
        // opcional: console.error('Cache cleanup error', err)
      }
    }, intervalMs);
    if (cleanupHandle.unref) cleanupHandle.unref(); // allow process to exit
  };

  const stopCleanup = () => {
    if (cleanupHandle) {
      clearInterval(cleanupHandle);
      cleanupHandle = null;
    }
  };

  // API do cache
  const set = (key, value, ttl = DEFAULT_TTL) => {
    if (typeof key !== "string") {
      throw new Error("Cache.set: key deve ser string");
    }
    const expiresAt = getExpiresAt(ttl);
    store.set(key, { value, expiresAt });
    stats.sets++;
    return true;
  };

  const get = (key, defaultValue = null) => {
    if (typeof key !== "string") {
      throw new Error("Cache.get: key deve ser string");
    }
    const entry = store.get(key);
    if (!entry) {
      stats.misses++;
      return defaultValue;
    }
    if (isExpired(entry)) {
      store.delete(key);
      stats.misses++;
      stats.deletes++;
      return defaultValue;
    }
    stats.hits++;
    return entry.value;
  };

  const del = (key) => {
    if (typeof key !== "string") {
      throw new Error("Cache.del: key deve ser string");
    }
    const existed = store.delete(key);
    if (existed) stats.deletes++;
    return existed;
  };

  const clear = () => {
    store.clear();
    stats.clears++;
    return true;
  };

  const invalidate = (pattern) => {
    if (!pattern) return 0;
    let removed = 0;
    if (pattern instanceof RegExp) {
      for (const key of store.keys()) {
        if (pattern.test(key)) {
          store.delete(key);
          removed++;
          stats.deletes++;
        }
      }
    } else {
      const pat = String(pattern);
      for (const key of store.keys()) {
        if (key.includes(pat)) {
          store.delete(key);
          removed++;
          stats.deletes++;
        }
      }
    }
    return removed;
  };

  const keys = () => Array.from(store.keys());
  const size = () => store.size;
  const getStats = () => ({ ...stats, size: size() });

  // Inicializa cleanup se configurado
  if (CLEANUP_INTERVAL_MS && CLEANUP_INTERVAL_MS > 0) {
    startCleanup(CLEANUP_INTERVAL_MS);
  }

  // Integração com CoreJS
  app.cache = {
    set,
    get,
    del,
    clear,
    invalidate,
    keys,
    size,
    getStats,
    // controle do cleanup
    startCleanup,
    stopCleanup,
  };

  // Retorna a mesma referência do app.cache (compatibilidade)
  return app.cache;
};
