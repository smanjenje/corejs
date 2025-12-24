// core/plugins/CachePlugin.js
// Plugin de cache em memória com TTL, cleanup automático, estatísticas e invalidação avançada.

/**
 * @typedef {Object} TTLOptions
 * @property {number} val
 * @property {string} tipo
 */

/**
 * @typedef {Object} CacheEntry
 * @property {*} value
 * @property {number} expiresAt - timestamp (0 = never expires)
 */

module.exports = ({ app, options = {} } = {}) => {
  // Registro do plugin
  if (typeof app?.pluginsNames === "object") {
    app.pluginsNames.CachePlugin = true;
  }

  // Configurações
  const DEFAULT_TTL = options.ttl ?? 0; // 0, false, null → never expire
  const CLEANUP_INTERVAL_MS = options.cleanupIntervalMs ?? 0;

  // Unidades de tempo (em ms)
  const Tempo = {
    SEGUNDO: 1_000,
    MINUTO: 60 * 1_000,
    HORA: 60 * 60 * 1_000,
    DIA: 24 * 60 * 60 * 1_000,
    SEMANA: 7 * 24 * 60 * 60 * 1_000,
    MES: 30 * 24 * 60 * 60 * 1_000,
    ANO: 365 * 24 * 60 * 60 * 1_000,

    /**
     * Converte valor + unidade para milissegundos
     * @param {number} val
     * @param {string} tipo
     * @returns {number}
     */
    time(val, tipo) {
      if (typeof val !== "number" || val < 0) {
        throw new Error("Tempo.time: 'val' deve ser número >= 0");
      }
      if (!tipo || typeof tipo !== "string") {
        throw new Error("Tempo.time: 'tipo' deve ser string");
      }

      const map = {
        segundo: 1,
        segundos: 1,
        s: 1,
        minuto: 60,
        minutos: 60,
        m: 60,
        hora: 3_600,
        horas: 3_600,
        h: 3_600,
        dia: 86_400,
        dias: 86_400,
        d: 86_400,
        semana: 604_800,
        semanas: 604_800,
        mes: 2_592_000,
        meses: 2_592_000,
        ano: 31_536_000,
        anos: 31_536_000,
      };

      const factor = map[tipo.toLowerCase()];
      if (factor === undefined) {
        throw new Error(`Tempo.time: unidade inválida '${tipo}'`);
      }

      return val * factor * 1_000; // converter para ms
    },
  };

  // Armazenamento e estatísticas
  const store = new Map(); // Map<string, CacheEntry>
  const stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    clears: 0,
  };

  let cleanupHandle = null;
  const now = () => Date.now();

  /**
   * Calcula timestamp de expiração
   * @param {number|TTLOptions|boolean|null|undefined} ttl
   * @returns {number} timestamp (0 = never expires)
   */
  const getExpiresAt = (ttl) => {
    // Valores "falsy" (exceto 0 numérico) = never expire
    if (ttl == null || ttl === false) return 0;
    if (ttl === 0 && typeof ttl === "number") return 0;

    if (typeof ttl === "number") {
      return ttl > 0 ? now() + ttl : 0;
    }

    if (typeof ttl === "object" && ttl !== null) {
      const { val, tipo } = ttl;
      if (typeof val !== "number" || typeof tipo !== "string") {
        throw new Error("TTL objeto deve ter { val: number, tipo: string }");
      }
      return now() + Tempo.time(val, tipo);
    }

    return 0; // fallback
  };

  /**
   * Verifica se entrada está expirada
   * @param {CacheEntry} entry
   * @returns {boolean}
   */
  const isExpired = (entry) => {
    return entry?.expiresAt !== 0 && now() > entry.expiresAt;
  };

  /**
   * Remove entradas expiradas
   */
  const purgeExpired = () => {
    for (const [key, entry] of store.entries()) {
      if (isExpired(entry)) {
        store.delete(key);
        stats.deletes++;
      }
    }
  };

  /**
   * Inicia limpeza periódica
   * @param {number} intervalMs
   */
  const startCleanup = (intervalMs) => {
    if (cleanupHandle || !intervalMs || intervalMs <= 0) return;
    cleanupHandle = setInterval(purgeExpired, intervalMs);
    if (cleanupHandle.unref) cleanupHandle.unref(); // não impedir exit do processo
  };

  /**
   * Para limpeza periódica
   */
  const stopCleanup = () => {
    if (cleanupHandle) {
      clearInterval(cleanupHandle);
      cleanupHandle = null;
    }
  };

  // ---------------------------
  // API Pública do Cache
  // ---------------------------

  /**
   * Define valor no cache
   * @param {string} key
   * @param {*} value
   * @param {number|TTLOptions} [ttl]
   * @returns {boolean}
   */
  const set = (key, value, ttl = DEFAULT_TTL) => {
    if (typeof key !== "string")
      throw new Error("Cache.set: key deve ser string");
    const expiresAt = getExpiresAt(ttl);
    store.set(key, { value, expiresAt });
    stats.sets++;
    return true;
  };

  /**
   * Obtém valor do cache
   * @param {string} key
   * @param {*} [defaultValue]
   * @returns {*}
   */
  const get = (key, defaultValue = null) => {
    if (typeof key !== "string")
      throw new Error("Cache.get: key deve ser string");
    const entry = store.get(key);
    if (!entry || isExpired(entry)) {
      if (entry) store.delete(key); // limpa se expirado
      stats.misses++;
      if (entry) stats.deletes++;
      return defaultValue;
    }
    stats.hits++;
    return entry.value;
  };

  /**
   * Verifica se chave existe (e não está expirada)
   * @param {string} key
   * @returns {boolean}
   */
  const has = (key) => {
    if (typeof key !== "string") return false;
    const entry = store.get(key);
    if (!entry) return false;
    if (isExpired(entry)) {
      store.delete(key);
      stats.deletes++;
      return false;
    }
    return true;
  };

  /**
   * Remove chave do cache
   * @param {string} key
   * @returns {boolean}
   */
  const del = (key) => {
    if (typeof key !== "string")
      throw new Error("Cache.del: key deve ser string");
    const existed = store.delete(key);
    if (existed) stats.deletes++;
    return existed;
  };

  /**
   * Limpa todo o cache
   * @returns {boolean}
   */
  const clear = () => {
    store.clear();
    stats.clears++;
    return true;
  };

  /**
   * Invalida chaves por padrão (RegExp ou string)
   * @param {RegExp|string} pattern
   * @returns {number} número de chaves removidas
   */
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
      const str = String(pattern);
      for (const key of store.keys()) {
        if (key.includes(str)) {
          store.delete(key);
          removed++;
          stats.deletes++;
        }
      }
    }

    return removed;
  };

  /**
   * Retorna todas as chaves (não expiradas)
   * @returns {string[]}
   */
  const keys = () => {
    const validKeys = [];
    for (const [key, entry] of store.entries()) {
      if (!isExpired(entry)) {
        validKeys.push(key);
      } else {
        store.delete(key);
        stats.deletes++;
      }
    }
    return validKeys;
  };

  /**
   * Tamanho do cache (não expiradas)
   * @returns {number}
   */
  const size = () => keys().length;

  /**
   * Retorna estatísticas do cache
   * @returns {Object}
   */
  const getStats = () => ({ ...stats, size: size()});

  // Inicializa cleanup, se configurado
  if (CLEANUP_INTERVAL_MS > 0) {
    startCleanup(CLEANUP_INTERVAL_MS);
  }

  // API exposta no app
  const cacheAPI = {
    Tempo,
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
  };

  // Integra com app
  app.cache = cacheAPI;

  // Retorna para compatibilidade com plugin system
  return cacheAPI;
};
