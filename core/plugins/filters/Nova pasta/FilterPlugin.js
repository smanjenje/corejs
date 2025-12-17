// core/plugins/filters/FilterPlugin.js
// Plugin de filtragem refatorado
// Melhorias:
// - Deduplicação de resultados
// - $eq indexável
// - Suporte melhor a arrays
// - Operadores organizados em mapa extensível
// - Micro-otimizações e padronização

module.exports = ({ app } = {}) => {
  if (!app) throw new Error("FilterPlugin: app obrigatório");

  // --------------------------------------------------
  // Utils
  // --------------------------------------------------
  const getNestedValue = (obj, path) =>
    path.split(".").reduce((o, k) => (o ? o[k] : undefined), obj);

  const isPrimitive = (v) =>
    v === null || ["string", "number", "boolean"].includes(typeof v);

  // --------------------------------------------------
  // Operators map (extensível)
  // --------------------------------------------------
  const operators = {
    $eq: (v, c) => v === c,
    $ne: (v, c) => v !== c,
    $gt: (v, c) => v > c,
    $gte: (v, c) => v >= c,
    $lt: (v, c) => v < c,
    $lte: (v, c) => v <= c,
    contains: (v, c) => typeof v === "string" && v.includes(c),
    $startsWith: (v, c) => typeof v === "string" && v.startsWith(c),
    $endsWith: (v, c) => typeof v === "string" && v.endsWith(c),
    $in: (v, c) => Array.isArray(c) && c.includes(v),
    $nin: (v, c) => Array.isArray(c) && !c.includes(v),
    $containsAny: (v, c) =>
      typeof v === "string" && Array.isArray(c) && c.some((s) => v.includes(s)),
    $containsAll: (v, c) =>
      typeof v === "string" &&
      Array.isArray(c) &&
      c.every((s) => v.includes(s)),
    $between: (v, c) => {
      if (!Array.isArray(c)) return false;
      const [min, max] = c;
      const val = v instanceof Date ? v.getTime() : v;
      const a = min instanceof Date ? min.getTime() : min;
      const b = max instanceof Date ? max.getTime() : max;
      return val >= a && val <= b;
    },
    $regex: (v, c, opts) => {
      if (typeof v !== "string") return false;
      const re = c instanceof RegExp ? c : new RegExp(c, opts || "");
      return re.test(v);
    },
  };

  // --------------------------------------------------
  // matches engine
  // --------------------------------------------------
  const matches = (doc, criteria) => {
    if (!criteria || typeof criteria !== "object") return false;

    if (criteria.$or) return criteria.$or.some((c) => matches(doc, c));
    if (criteria.$and) return criteria.$and.every((c) => matches(doc, c));
    if (criteria.$not) return !matches(doc, criteria.$not);

    for (const [field, cond] of Object.entries(criteria)) {
      const val = getNestedValue(doc, field);

      if (typeof cond === "function") {
        if (!cond(val)) return false;
        continue;
      }

      // igualdade direta
      if (isPrimitive(cond)) {
        if (Array.isArray(val)) {
          if (!val.includes(cond)) return false;
        } else if (val !== cond) return false;
        continue;
      }

      // operadores
      for (const [op, fn] of Object.entries(operators)) {
        if (op in cond) {
          const ok = fn(val, cond[op], cond.$options);
          if (!ok) return false;
        }
      }

      // subdocumento
      if (typeof cond === "object" && !matches(val, cond)) return false;
    }
    return true;
  };

  // --------------------------------------------------
  // Index helpers
  // --------------------------------------------------
  const extractIndexableFilters = (criteria) => {
    if (!criteria || typeof criteria !== "object") {
      return { indexable: {}, rest: criteria };
    }

    if (criteria.$or || criteria.$and || criteria.$not) {
      return { indexable: {}, rest: criteria };
    }

    const indexable = {};
    const rest = {};

    for (const [field, value] of Object.entries(criteria)) {
      if (isPrimitive(value)) {
        indexable[field] = value;
      } else if (value && typeof value === "object" && "$eq" in value) {
        indexable[field] = value.$eq;
      } else {
        rest[field] = value;
      }
    }

    return { indexable, rest };
  };

  const getDocsByIndices = async ({ user, dbname, collname, indices }) => {
    if (!Array.isArray(indices) || indices.length === 0) return [];
    const docs = await app.getCollData({ user, dbname, collname });
    const uniq = [...new Set(indices)];
    return uniq
      .map((i) => docs[i])
      .filter((d) => d !== undefined && d !== null);
  };

  // --------------------------------------------------
  // findMany
  // --------------------------------------------------
  const findMany = async ({ user, dbname, collname, docs, queries }) => {
    const criteriaList = Array.isArray(queries) ? queries : [queries];
    if (criteriaList.length === 0) {
      return docs ?? (await app.getCollData({ user, dbname, collname })) ?? [];
    }

    const sourceDocs =
      docs !== undefined
        ? Array.isArray(docs)
          ? docs
          : []
        : await app.getCollData({ user, dbname, collname });

    if (!Array.isArray(sourceDocs) || sourceDocs.length === 0) return [];

    const indexMap = docs
      ? null
      : await app.getCollDocsMap({ user, dbname, collname });

    const results = [];
    const seen = new Set();

    for (const criteria of criteriaList) {
      const { indexable, rest } = extractIndexableFilters(criteria);
      let candidates = sourceDocs;

      if (!docs && Object.keys(indexable).length > 0) {
        let indicesSet = null;
        for (const [field, value] of Object.entries(indexable)) {
          const list = indexMap?.[field]?.[String(value)] || [];
          const set = new Set(list);
          indicesSet = indicesSet
            ? new Set([...indicesSet].filter((i) => set.has(i)))
            : set;
          if (indicesSet.size === 0) break;
        }
        if (indicesSet && indicesSet.size > 0) {
          candidates = await getDocsByIndices({
            user,
            dbname,
            collname,
            indices: [...indicesSet],
          });
        }
      }

      const finalCriteria =
        Object.keys(rest).length > 0 ? { ...indexable, ...rest } : criteria;

      for (const doc of candidates) {
        if (matches(doc, finalCriteria)) {
          const id = doc._id ?? doc;
          if (!seen.has(id)) {
            seen.add(id);
            results.push(doc);
          }
        }
      }
    }

    return results;
  };

  // --------------------------------------------------
  // findOne
  // --------------------------------------------------
  const findOne = async (params) => {
    const res = await findMany(params);
    return res.length ? res[0] : null;
  };

  return {
    matches,
    findMany,
    findOne,
    getDocsByIndices,
    operators, // exposto para extensão
  };
};
