// core/plugins/filters/FilterPlugin.js
// Plugin de filtragem com matches, findMany e findOne
// Usa apenas métodos expostos pelo app (ex: getCollData, listDocs)

module.exports = ({ app } = {}) => {
  if (!app) throw new Error("FilterPlugin: app obrigatório");
  if (app.pluginsNames && typeof app.pluginsNames === "object") {
    app.pluginsNames.FilterPlugin = true;
  }

  const getNestedValue = (obj, path) =>
    path.split(".").reduce((o, k) => (o ? o[k] : undefined), obj);

  const matches = (doc, criteria) => {
    if (!criteria || typeof criteria !== "object") return false;

    if (criteria.$or) {
      if (!Array.isArray(criteria.$or)) throw new Error("$or deve ser array");
      return criteria.$or.some((sub) => matches(doc, sub));
    }

    if (criteria.$and) {
      if (!Array.isArray(criteria.$and)) throw new Error("$and deve ser array");
      return criteria.$and.every((sub) => matches(doc, sub));
    }

    if (criteria.$not) return !matches(doc, criteria.$not);

    for (const [field, cond] of Object.entries(criteria)) {
      const val = getNestedValue(doc, field);

      if (typeof cond === "function") {
        if (!cond(val)) return false;
        continue;
      }
      if (cond === null || typeof cond !== "object") {
        if (val !== cond) return false;
        continue;
      }

      // Verifica se `cond` é um objeto de operadores
      const isOperatorObj =
        "$eq" in cond ||
        "$ne" in cond ||
        "$gt" in cond ||
        "$gte" in cond ||
        "$lt" in cond ||
        "$lte" in cond ||
        "$in" in cond ||
        "$nin" in cond ||
        "contains" in cond ||
        "$startsWith" in cond ||
        "$endsWith" in cond ||
        "$containsAny" in cond ||
        "$containsAll" in cond ||
        "$between" in cond ||
        "$regex" in cond;

      if (isOperatorObj) {
        // Processa operadores
        if ("$eq" in cond && val !== cond.$eq) return false;
        if ("$ne" in cond && val === cond.$ne) return false;
        if ("$gt" in cond && !(val > cond.$gt)) return false;
        if ("$gte" in cond && !(val >= cond.$gte)) return false;
        if ("$lt" in cond && !(val < cond.$lt)) return false;
        if ("$lte" in cond && !(val <= cond.$lte)) return false;
        if (
          "contains" in cond &&
          (typeof val !== "string" || !val.includes(cond.contains))
        )
          return false;
        if (
          "$in" in cond &&
          (!Array.isArray(cond.$in) || !cond.$in.includes(val))
        )
          return false;
        if (
          "$nin" in cond &&
          Array.isArray(cond.$nin) &&
          cond.$nin.includes(val)
        )
          return false;
        if (
          "$startsWith" in cond &&
          (typeof val !== "string" || !val.startsWith(cond.$startsWith))
        )
          return false;
        if (
          "$endsWith" in cond &&
          (typeof val !== "string" || !val.endsWith(cond.$endsWith))
        )
          return false;
        if (
          "$containsAny" in cond &&
          (typeof val !== "string" ||
            !Array.isArray(cond.$containsAny) ||
            !cond.$containsAny.some((s) => val.includes(s)))
        )
          return false;
        if (
          "$containsAll" in cond &&
          (typeof val !== "string" ||
            !Array.isArray(cond.$containsAll) ||
            !cond.$containsAll.every((s) => val.includes(s)))
        )
          return false;
        if ("$between" in cond) {
          const [min, max] = cond.$between || [];
          if (min === undefined || max === undefined) return false;
          const v = val instanceof Date ? val.getTime() : val;
          const a = min instanceof Date ? min.getTime() : min;
          const b = max instanceof Date ? max.getTime() : max;
          if (!(v >= a && v <= b)) return false;
        }
        if ("$regex" in cond) {
          if (typeof val !== "string") return false;
          const re =
            cond.$regex instanceof RegExp
              ? cond.$regex
              : new RegExp(cond.$regex, cond.$options || undefined);
          if (!re.test(val)) return false;
        }
        // Já processado — não recursiona
        continue;
      }

      // Caso recursivo: cond é um sub-objeto (não operador)
      if (!matches(val, cond)) return false;
    }

    return true;
  };

  const findMany = async ({ user, dbname, collname, queries }) => {
    if (!app.getCollData) {
      throw new Error("findMany: app.getCollData não disponível");
    }

    const docs = await app.getCollData({ user, dbname, collname });
    if (!Array.isArray(docs)) return [];

    const criteriaList = Array.isArray(queries) ? queries : [queries];

    return docs.filter((doc) =>
      criteriaList.some((crit) => matches(doc, crit))
    );
  };

  const findOne = async ({ user, dbname, collname, queries }) => {
    const results = await findMany({ user, dbname, collname, queries });
    return results.length > 0 ? results[0] : null;
  };

  return { matches, findMany, findOne };
};

