// core/plugins/aggregate/GroupPlugin.js
// Suporte completo a:
// - pipeline ($match, $lookup, $project, $populate)
// - group + groupBy
// - having, sort, limit
// - facets, bucket, custom accumulators
// - chaves compostas, cache, métricas prontas

module.exports = ({ app } = {}) => {
  if (!app) {
    throw new Error("GroupPlugin: app é obrigatório");
  }

  if (app.pluginsNames && typeof app.pluginsNames === "object") {
    app.pluginsNames.GroupPlugin = true;
  }

  // --------------------------------------------------
  // Utils internas
  // --------------------------------------------------
  const getNested = (obj, path) => {
    if (!obj || typeof obj !== "object") return undefined;
    return path
      .split(".")
      .reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
  };

  const setNested = (obj, path, value) => {
    if (!obj || typeof obj !== "object") return;
    const keys = path.split(".");
    const last = keys.pop();
    const parent = keys.reduce((o, k) => {
      if (!o[k] || typeof o[k] !== "object") o[k] = {};
      return o[k];
    }, obj);
    parent[last] = value;
  };

  const resolveExpression = (doc, expr) => {
    if (typeof expr === "string" && expr.startsWith("$")) {
      return getNested(doc, expr.slice(1));
    }
    // Suporte futuro a operadores aninhados ($multiply, etc.)
    return expr;
  };

  const normalizeGroupKey = (key) => {
    if (key == null) return "__null__";
    if (typeof key === "object") {
      // Chave composta: { year: 2025, month: 12 } → "year:2025|month:12"
      return Object.entries(key)
        .map(([k, v]) => `${k}:${String(v)}`)
        .sort()
        .join("|");
    }
    return String(key);
  };

  const denormalizeGroupKey = (strKey) => {
    if (strKey === "__null__") return null;
    if (strKey.includes("|") && strKey.includes(":")) {
      const obj = {};
      strKey.split("|").forEach((part) => {
        const [k, v] = part.split(":");
        const num = Number(v);
        obj[k] = !isNaN(num) && v === String(num) ? num : v;
      });
      return obj;
    }
    const num = Number(strKey);
    return !isNaN(num) && strKey === String(num) ? num : strKey;
  };

  // --------------------------------------------------
  // Pipeline stages
  // --------------------------------------------------
  const applyPipeline = async (docs, pipeline = [], { user, dbname }) => {
    let current = docs;

    for (const stage of pipeline) {
      if (stage.$match) {
        current = current.filter((doc) => app.matches?.(doc, stage.$match));
      } else if (stage.$lookup && app.lookup) {
        current = await app.lookup({ docs: current, lookups: [stage.$lookup] });
      } else if (stage.$populate && app.populate) {
        current = await app.populate({
          docs: current,
          populates: [stage.$populate],
        });
      } else if (stage.$project) {
        const projected = [];
        for (const doc of current) {
          const newDoc = {};
          for (const [field, include] of Object.entries(stage.$project)) {
            if (include) {
              newDoc[field] = getNested(doc, field);
            }
          }
          projected.push(newDoc);
        }
        current = projected;
      }
      // Adicione mais stages conforme necessário
    }

    return current;
  };

  // --------------------------------------------------
  // Acumuladores
  // --------------------------------------------------
  const builtInAccumulators = {
    $sum: (acc, val) =>
      (typeof acc !== "number" ? 0 : acc) + (typeof val === "number" ? val : 0),
    $avg: (acc, val) => {
      const sum = (acc?.sum || 0) + (typeof val === "number" ? val : 0);
      const count = (acc?.count || 0) + (typeof val === "number" ? 1 : 0);
      return { sum, count };
    },
    $min: (acc, val) => (acc === undefined ? val : val < acc ? val : acc),
    $max: (acc, val) => (acc === undefined ? val : val > acc ? val : acc),
    $push: (acc, val) => {
      (acc || (acc = [])).push(val);
      return acc;
    },
    $addToSet: (acc, val) => {
      (acc || (acc = [])).includes(val) || acc.push(val);
      return acc;
    },
    $first: (acc, val) => (acc !== undefined ? acc : val),
    $last: (acc, val) => val,
  };

  const applyAccumulator = (
    accName,
    accState,
    value,
    customAccumulators = {}
  ) => {
    if (accName === "$custom") {
      const { init, accumulate, finalize } = accState || {};
      if (!init || !accumulate || !finalize) return accState;
      return accumulate(accState, value);
    }
    const fn = builtInAccumulators[accName] || customAccumulators[accName];
    return fn ? fn(accState, value) : accState;
  };

  // --------------------------------------------------
  // group principal
  // --------------------------------------------------
  const group = async (options = {}) => {
    const {
      user,
      dbname,
      collname,
      docs,
      pipeline = [],
      groups = [],
      facets,
      bucket,
      having,
      sort,
      limit,
      cache = true,
    } = options;

    // --- Suporte a cache (uso do CachePlugin) ---
    let cacheKey;
    if (cache && app.getCacheKey && app.getFromCache && app.setCache) {
      cacheKey = app.getCacheKey("group", options);
      const cached = await app.getFromCache(cacheKey);
      if (cached) return cached;
    }

    // --- Carregar documentos iniciais ---
    let documents = docs;
    if (!Array.isArray(documents)) {
      if (!collname || !dbname || !user) {
        throw new Error(
          "docs deve ser um array ou (user, dbname, collname) informados"
        );
      }
      documents = await app.getCollData({ user, dbname, collname });
      documents = Array.isArray(documents) ? documents : [];
    }

    // --- Suporte a $facet ---
    if (facets && typeof facets === "object") {
      const result = {};
      for (const [name, facetPipeline] of Object.entries(facets)) {
        result[name] = await group({
          user,
          dbname,
          collname,
          docs: documents,
          groups: facetPipeline,
          cache: false, // evita loop de cache
        });
      }
      if (cacheKey) await app.setCache(cacheKey, result);
      return result;
    }

    // --- Suporte a $bucket ---
    if (bucket) {
      const {
        groupBy,
        boundaries,
        default: def = "other",
        output = {},
      } = bucket;
      const groups = boundaries.map((b, i) => {
        const min = boundaries[i];
        const max = boundaries[i + 1];
        return {
          _id: max === undefined ? `${min}+` : `${min}-${max}`,
          [groupBy]: { $gte: min, ...(max !== undefined ? { $lt: max } : {}) },
        };
      });
      // Implementação simplificada – você pode expandir com $match interno
      const result = {};
      const data = documents;
      for (const value of data.map((d) => getNested(d, groupBy.slice(1)))) {
        let bucketId = def;
        for (let i = 0; i < boundaries.length - 1; i++) {
          if (value >= boundaries[i] && value < boundaries[i + 1]) {
            bucketId = `${boundaries[i]}-${boundaries[i + 1]}`;
            break;
          }
        }
        if (value >= boundaries[boundaries.length - 1]) {
          bucketId = `${boundaries[boundaries.length - 1]}+`;
        }
        if (!result[bucketId]) result[bucketId] = { count: 0 };
        result[bucketId].count++;
      }
      const bucketResult = Object.entries(result).map(([k, v]) => ({
        _id: k,
        ...v,
      }));
      if (cacheKey) await app.setCache(cacheKey, bucketResult);
      return bucketResult;
    }

    // --- Aplicar pipeline antes do group ---
    let processedDocs = await applyPipeline(documents, pipeline, {
      user,
      dbname,
    });

    // --- Executar agrupamento ---
    const result = [];
    for (const stage of groups) {
      const { _id: groupKeyDef, ...accumulations } = stage;
      const groupMap = new Map();

      for (const doc of processedDocs) {
        let groupKey;
        if (groupKeyDef == null) {
          groupKey = null;
        } else if (
          typeof groupKeyDef === "string" &&
          groupKeyDef.startsWith("$")
        ) {
          groupKey = getNested(doc, groupKeyDef.slice(1));
        } else if (typeof groupKeyDef === "object") {
          // Extrair valores para chave composta
          const keyObj = {};
          for (const [k, expr] of Object.entries(groupKeyDef)) {
            keyObj[k] = resolveExpression(doc, expr);
          }
          groupKey = keyObj;
        } else {
          groupKey = groupKeyDef;
        }

        const normKey = normalizeGroupKey(groupKey);
        if (!groupMap.has(normKey)) {
          const initAcc = { _id: groupKey };
          for (const [field, opDef] of Object.entries(accumulations)) {
            const accName = Object.keys(opDef)[0];
            initAcc[field] =
              accName === "$avg" ? { sum: 0, count: 0 } : undefined;
          }
          groupMap.set(normKey, initAcc);
        }

        const acc = groupMap.get(normKey);
        for (const [field, opDef] of Object.entries(accumulations)) {
          const accName = Object.keys(opDef)[0];
          const expr = opDef[accName];
          const value = resolveExpression(doc, expr);
          acc[field] = applyAccumulator(accName, acc[field], value);
        }
      }

      // Finalizar acumuladores
      for (const acc of groupMap.values()) {
        for (const [field, opDef] of Object.entries(accumulations)) {
          const accName = Object.keys(opDef)[0];
          if (accName === "$avg") {
            const { sum, count } = acc[field];
            acc[field] = count > 0 ? sum / count : 0;
          }
        }
        result.push(acc);
      }
    }

    // --- having (pós-filtro) ---
    if (having && app.matches) {
      const filtered = result.filter((group) => app.matches(group, having));
      result.length = 0;
      result.push(...filtered);
    }

    // --- sort ---
    if (sort && typeof sort === "object") {
      result.sort((a, b) => {
        for (const [field, dir] of Object.entries(sort)) {
          const aVal = getNested(a, field);
          const bVal = getNested(b, field);
          if (aVal < bVal) return dir === -1 ? 1 : -1;
          if (aVal > bVal) return dir === -1 ? -1 : 1;
        }
        return 0;
      });
    }

    // --- limit ---
    if (limit && Number.isInteger(limit) && limit > 0) {
      result.length = Math.min(result.length, limit);
    }

    if (cacheKey) await app.setCache(cacheKey, result);
    return result;
  };

 // --------------------------------------------------
// groupBy: agrupamento simples (corrigido)
// --------------------------------------------------
const groupBy = async ({ user, dbname, collname, docs, by, asArray = false } = {}) => {
  if (!by) {
    throw new Error("groupBy: campo 'by' é obrigatório");
  }

  let documents = docs;
  if (!Array.isArray(documents)) {
    if (!collname || !dbname || !user) {
      throw new Error("docs deve ser um array ou (user, dbname, collname) devem ser informados");
    }
    const rawData = await app.getCollData({ user, dbname, collname });
    documents = Array.isArray(rawData) ? rawData : [];
  }

  if (!Array.isArray(documents)) {
    return asArray ? [] : {};
  }

  const groups = {};
  for (const doc of documents) {
    const key = getNested(doc, by);
    const strKey = key == null ? "__null__" : String(key);
    if (!groups[strKey]) {
      groups[strKey] = [];
    }
    groups[strKey].push(doc); // ✅ empurra o documento completo
  }

  if (asArray) {
    return Object.entries(groups).map(([strKey, items]) => {
      const originalKey = strKey === "__null__"
        ? null
        : (() => {
            const num = Number(strKey);
            return !isNaN(num) && strKey === String(num) ? num : strKey;
          })();
      return { _id: originalKey, items };
    });
  }

  const result = {};
  for (const [strKey, items] of Object.entries(groups)) {
    const originalKey = strKey === "__null__"
      ? null
      : (() => {
          const num = Number(strKey);
          return !isNaN(num) && strKey === String(num) ? num : strKey;
        })();
    result[originalKey] = items;
  }
  return result;
};

  // --------------------------------------------------
  // Métricas prontas (wrappers)
  // --------------------------------------------------
  const countBy = async (options) => {
    const { by, ...rest } = options;
    const result = await group({
      ...rest,
      groups: [{ _id: `$${by}`, count: { $sum: 1 } }],
    });
    const obj = {};
    for (const r of result) obj[r._id] = r.count;
    return obj;
  };

  const sumBy = async ({ by, of, ...rest }) => {
    const result = await group({
      ...rest,
      groups: [{ _id: `$${by}`, total: { $sum: `$${of}` } }],
    });
    const obj = {};
    for (const r of result) obj[r._id] = r.total;
    return obj;
  };

  const uniqueBy = async ({ by, field, ...rest }) => {
    const result = await group({
      ...rest,
      groups: [{ _id: `$${by}`, values: { $addToSet: `$${field}` } }],
    });
    const obj = {};
    for (const r of result) obj[r._id] = r.values;
    return obj;
  };

  // --------------------------------------------------
  // Registro
  // --------------------------------------------------

  return { group, groupBy, countBy, sumBy, uniqueBy };
};
