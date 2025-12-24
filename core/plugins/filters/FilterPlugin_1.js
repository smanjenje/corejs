// core/plugins/filters/FilterPlugin.js
// Plugin de filtragem robusto com suporte a operadores, índices e lógica booleana

module.exports = ({ app } = {}) => {
  if (!app) throw new Error("FilterPlugin: app é obrigatório");

  // --------------------------------------------------
  // Utils
  // --------------------------------------------------
  // Renomeado para consistência
  const getNested = (obj, path) =>
    path.split(".").reduce((o, k) => (o ? o[k] : undefined), obj);

  const isPrimitive = (v) =>
    v === null || ["string", "number", "boolean"].includes(typeof v);

  // --------------------------------------------------
  // Operadores
  // --------------------------------------------------
  const operators = {
    $eq: (v, c) => v === c,
    $ne: (v, c) => v !== c,
    $gt: (v, c) => v > c,
    $gte: (v, c) => v >= c,
    $lt: (v, c) => v < c,
    $lte: (v, c) => v <= c,
    // Melhoria sugerida: se 'v' for um array, checa se 'c' está contido em algum item de 'v'.
    $in: (v, c) => Array.isArray(c) && c.includes(v),
    $nin: (v, c) => Array.isArray(c) && !c.includes(v),
    // Operadores Array Adicionais para maior robustez
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

  // --------------------------------------------------
  // Motor de correspondência
  // --------------------------------------------------
  const matches = (doc, criteria) => {
    if (!criteria || typeof criteria !== "object" || Array.isArray(criteria))
      return false;

    // Lógica Booleana
    if (criteria.$or) return criteria.$or.some((c) => matches(doc, c));
    if (criteria.$and) return criteria.$and.every((c) => matches(doc, c));
    if (criteria.$not) return !matches(doc, criteria.$not);

    for (const [field, cond] of Object.entries(criteria)) {
      const val = getNested(doc, field);

      let currentCond = cond;
      let matchedOperator = false;

      // 1. Igualdade direta (tratada como $eq implícito para primitivos)
      if (isPrimitive(cond)) {
        currentCond = { $eq: cond };
      }

      // 2. Operadores/Subdocumento
      if (typeof currentCond === "object" && currentCond !== null) {
        // Tenta aplicar todos os operadores na condição
        for (const [opName, opFn] of Object.entries(operators)) {
          if (opName in currentCond) {
            matchedOperator = true;
            const ok = opFn(val, currentCond[opName], currentCond.$options);
            if (!ok) return false; // Falha em um operador
          }
        }

        // 3. Fallback para Subdocumento (se a condição for um objeto, mas não tiver operadores)
        // Isso permite filtros aninhados como { 'endereco.cidade': { $eq: 'SP' } } ou { 'endereco': { rua: 'X' } }
        if (!matchedOperator && !isPrimitive(val)) {
          if (!matches(val, currentCond)) return false;
        }
      }
      // Se não for um objeto, já foi tratado como $eq, se for objeto, a lógica acima cuidou.
    }
    return true;
  };

  // --------------------------------------------------
  // Extração de filtros indexáveis
  // --------------------------------------------------
  const extractIndexableFilters = (criteria) => {
    if (!criteria || typeof criteria !== "object" || Array.isArray(criteria)) {
      return { indexable: {}, rest: criteria };
    }

    if (criteria.$or || criteria.$and || criteria.$not) {
      // Filtros booleanos não podem ser facilmente indexados.
      return { indexable: {}, rest: criteria };
    }

    const indexable = {};
    const rest = {};

    for (const [field, value] of Object.entries(criteria)) {
      if (isPrimitive(value)) {
        indexable[field] = value; // Ex: { status: 'ativo' }
      } else if (
        value &&
        typeof value === "object" &&
        ("$eq" in value || "$in" in value)
      ) {
        // Suporta $eq e $in para indexação
        if ("$eq" in value) indexable[field] = value.$eq;
        else rest[field] = value; // $in não é ideal para indexação O(1), mas é tratado como o restante
      } else {
        rest[field] = value; // Todos os outros operadores e subdocumentos
      }
    }

    return { indexable, rest };
  };

  // --------------------------------------------------
  // findMany: busca com suporte a índices e deduplicação
  // --------------------------------------------------
  const findMany = async ({ user, dbname, collname, docs, queries }) => {
    const criteriaList = Array.isArray(queries) ? queries : [queries];
    if (criteriaList.length === 0) {
      return docs ?? (await app.getCollData({ user, dbname, collname })) ?? [];
    }

    const sourceDocs =
      Array.isArray(docs) && docs.length > 0
        ? docs
        : await app.getCollData({ user, dbname, collname });

    if (!Array.isArray(sourceDocs) || sourceDocs.length === 0) return [];

    // Tenta usar índices se não houver docs pré-carregados (para I/O otimizado)
    const useIndex = !Array.isArray(docs) || docs.length === 0;
    const indexMap = useIndex
      ? await app.getCollDocsMap?.({ user, dbname, collname })
      : null;

    const results = [];
    const seen = new Set();

    for (const criteria of criteriaList) {
      const { indexable, rest } = extractIndexableFilters(criteria);
      let candidates = sourceDocs;

      // Otimização por índice (restrição a $eq em campos únicos)
      if (useIndex && Object.keys(indexable).length > 0 && indexMap) {
        let indicesSet = null;
        let validIndex = true;

        for (const [field, value] of Object.entries(indexable)) {
          if (!indexMap[field]) {
            validIndex = false;
            break;
          }
          const strValue = String(value);
          const list = indexMap[field][strValue] || [];
          const set = new Set(list);

          // Intersecção dos índices para múltiplos filtros indexáveis (AND implícito)
          indicesSet = indicesSet
            ? new Set([...indicesSet].filter((i) => set.has(i)))
            : set;

          if (indicesSet.size === 0) {
            validIndex = false;
            break; // Otimização: se a interseção for zero, para a busca
          }
        }

        if (validIndex && indicesSet && indicesSet.size > 0) {
          // Seleciona apenas os documentos correspondentes aos IDs de índice
          candidates = [...indicesSet]
            .map((i) => sourceDocs[i])
            .filter((d) => d != null);
        }
      }

      // Monta critério final, juntando indexable e rest (o que foi tratado pelo índice, mas precisa ser checado)
      const finalCriteria =
        Object.keys(rest).length > 0 ? { ...indexable, ...rest } : criteria;

      // Filtra candidatos (checa o 'rest' e garante que a correspondência é correta)
      for (const doc of candidates) {
        if (matches(doc, finalCriteria)) {
          const id = doc._id;
          // Deduplicação
          if (id !== undefined && !seen.has(id)) {
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
    return res[0] || null;
  };

  return { matches, findMany, findOne, operators };
};
