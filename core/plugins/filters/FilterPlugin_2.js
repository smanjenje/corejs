// core/plugins/filters/FilterPlugin.js
// Plugin de filtragem funcional (stateless) - Não retém dados entre execuções

module.exports = ({ app } = {}) => {
  if (!app) throw new Error("FilterPlugin: app é obrigatório");

  const getNested = (obj, path) =>
    path.split(".").reduce((o, k) => (o ? o[k] : undefined), obj);

  const isPrimitive = (v) =>
    v === null || ["string", "number", "boolean"].includes(typeof v);

  const operators = {
    $eq: (v, c) => v === c,
    $ne: (v, c) => v !== c,
    $gt: (v, c) => v > c,
    $gte: (v, c) => v >= c,
    $lt: (v, c) => v < c,
    $lte: (v, c) => v <= c,
    $in: (v, c) => Array.isArray(c) && c.includes(v),
    $nin: (v, c) => Array.isArray(c) && !c.includes(v),
    $all: (v, c) =>
      Array.isArray(v) &&
      Array.isArray(c) &&
      c.every((item) => v.includes(item)),
    $size: (v, c) => Array.isArray(v) && v.length === c,
    $regex: (v, c, opts) => {
      if (typeof v !== "string") return false;
      const re = c instanceof RegExp ? c : new RegExp(c, opts || "");
      return re.test(v);
    },
    $startsWith: (v, c) => typeof v === "string" && v.startsWith(c),
    $endsWith: (v, c) => typeof v === "string" && v.endsWith(c),
    $containsAny: (v, c) =>
      typeof v === "string" && Array.isArray(c) && c.some((s) => v.includes(s)),
    $containsAll: (v, c) =>
      typeof v === "string" &&
      Array.isArray(c) &&
      c.every((s) => v.includes(s)),
    $between: (v, c) => {
      if (!Array.isArray(c) || c.length < 2) return false;
      const [min, max] = c;
      const val = v instanceof Date ? v.getTime() : v;
      const a = min instanceof Date ? min.getTime() : min;
      const b = max instanceof Date ? max.getTime() : max;
      return val >= a && val <= b;
    },
  };

  const matches = (doc, criteria) => {
    if (!criteria || typeof criteria !== "object" || Array.isArray(criteria))
      return false;

    if (criteria.$or) return criteria.$or.some((c) => matches(doc, c));
    if (criteria.$and) return criteria.$and.every((c) => matches(doc, c));
    if (criteria.$not) return !matches(doc, criteria.$not);

    for (const [field, cond] of Object.entries(criteria)) {
      const val = getNested(doc, field);
      let currentCond = cond;
      let matchedOperator = false;

      if (isPrimitive(cond)) {
        currentCond = { $eq: cond };
      }

      if (typeof currentCond === "object" && currentCond !== null) {
        for (const [opName, opFn] of Object.entries(operators)) {
          if (opName in currentCond) {
            matchedOperator = true;
            if (!opFn(val, currentCond[opName], currentCond.$options))
              return false;
          }
        }

        if (!matchedOperator && !isPrimitive(val)) {
          if (!matches(val, currentCond)) return false;
        }
      }
    }
    return true;
  };

  const extractIndexableFilters = (criteria) => {
    if (
      !criteria ||
      typeof criteria !== "object" ||
      Array.isArray(criteria) ||
      criteria.$or ||
      criteria.$and ||
      criteria.$not
    ) {
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

  const findMany = async ({ user, dbname, collname, docs, queries }) => {
    // 1. Garantir que os critérios sejam uma lista limpa nesta execução
    const criteriaList = Array.isArray(queries) ? queries : [queries];

    // 2. Carregamento de dados (Sempre local ao escopo da função)
    let sourceDocs =
      Array.isArray(docs) && docs.length > 0
        ? docs
        : await app.getCollData({ user, dbname, collname });

    if (!Array.isArray(sourceDocs) || sourceDocs.length === 0) return [];

    const useIndex = !Array.isArray(docs) || docs.length === 0;
    const indexMap = useIndex
      ? await app.getCollDocsMap?.({ user, dbname, collname })
      : null;

    const results = [];
    const seen = new Set(); // Limpo a cada execução de findMany

    for (const criteria of criteriaList) {
      const { indexable, rest } = extractIndexableFilters(criteria);
      let candidates = sourceDocs;

      // Otimização por índice
      if (useIndex && Object.keys(indexable).length > 0 && indexMap) {
        let indicesSet = null;

        for (const [field, value] of Object.entries(indexable)) {
          if (!indexMap[field]) {
            indicesSet = new Set(); // Campo não indexado, resulta em vazio se houver interseção
            break;
          }
          const list = indexMap[field][String(value)] || [];
          const currentSet = new Set(list);

          indicesSet = indicesSet
            ? new Set([...indicesSet].filter((i) => currentSet.has(i)))
            : currentSet;

          if (indicesSet.size === 0) break;
        }

        if (indicesSet && indicesSet.size > 0) {
          candidates = [...indicesSet]
            .map((i) => sourceDocs[i])
            .filter((d) => d != null);
        } else if (indicesSet && indicesSet.size === 0) {
          candidates = [];
        }
      }

      const finalCriteria =
        Object.keys(rest).length > 0 ? { ...indexable, ...rest } : criteria;

      for (const doc of candidates) {
        if (matches(doc, finalCriteria)) {
          const id = doc._id;
          if (id !== undefined && !seen.has(id)) {
            seen.add(id);
            results.push(doc);
          }
        }
      }
    }

    // Limpeza explícita para ajudar o GC (Garbage Collector)
    seen.clear();
    return results;
  };

  const findOne = async (params) => {
    const res = await findMany(params);
    return res.length > 0 ? res[0] : null;
  };

  return { matches, findMany, findOne, operators };
};
