// core/plugins/aggregate/GroupPlugin.js
// Suporta:
// - group: agregação avançada (estilo MongoDB $group)
// - groupBy: agrupamento simples (estilo Lodash)

module.exports = ({ app } = {}) => {
  if (!app) {
    throw new Error("GroupPlugin: app é obrigatório");
  }

  if (app.pluginsNames && typeof app.pluginsNames === "object") {
    app.pluginsNames.GroupPlugin = true;
  }

  // --------------------------------------------------
  // Utils compartilhadas
  // --------------------------------------------------
  const getNested = (obj, path) => {
    if (!obj || typeof obj !== "object") return undefined;
    return path
      .split(".")
      .reduce(
        (o, key) => (o && o[key] !== undefined ? o[key] : undefined),
        obj
      );
  };

  const resolveExpression = (doc, expr) => {
    if (typeof expr === "string" && expr.startsWith("$")) {
      const path = expr.slice(1);
      return getNested(doc, path);
    }
    return expr;
  };

  // --------------------------------------------------
  // group: agregação avançada
  // --------------------------------------------------
  const accumulators = {
    $sum: (acc, val) => {
      if (typeof acc !== "number") acc = 0;
      return typeof val === "number" ? acc + val : acc;
    },
    $avg: (acc, val, count) => {
      return {
        sum: (acc?.sum || 0) + (typeof val === "number" ? val : 0),
        count: (acc?.count || 0) + (typeof val === "number" ? 1 : 0),
      };
    },
    $min: (acc, val) => (acc === undefined ? val : val < acc ? val : acc),
    $max: (acc, val) => (acc === undefined ? val : val > acc ? val : acc),
    $push: (acc, val) => {
      if (!Array.isArray(acc)) acc = [];
      acc.push(val);
      return acc;
    },
    $addToSet: (acc, val) => {
      if (!Array.isArray(acc)) acc = [];
      if (!acc.includes(val)) acc.push(val);
      return acc;
    },
    $first: (acc, val) => (acc !== undefined ? acc : val),
    $last: (acc, val) => val,
  };

  const group = async ({ user, dbname, collname, docs, groups } = {}) => {
    let documents = docs;
    if (!Array.isArray(documents)) {
      if (!collname || !dbname || !user) {
        throw new Error(
          "docs deve ser um array ou (user, dbname, collname) devem ser informados"
        );
      }
      const rawData = await app.getCollData({ user, dbname, collname });
      documents = Array.isArray(rawData) ? rawData : [];
    }

    if (!Array.isArray(groups) || groups.length === 0) {
      return documents;
    }

    const result = [];

    for (const stage of groups) {
      const { _id: groupKeyDef, ...accumulations } = stage;
      const groupMap = new Map();

      for (const doc of documents) {
        let groupKey;
        if (groupKeyDef == null) {
          groupKey = null;
        } else if (
          typeof groupKeyDef === "string" &&
          groupKeyDef.startsWith("$")
        ) {
          groupKey = getNested(doc, groupKeyDef.slice(1));
        } else if (typeof groupKeyDef === "object") {
          groupKey = JSON.stringify(
            Object.fromEntries(
              Object.entries(groupKeyDef).map(([k, v]) => [
                k,
                typeof v === "string" && v.startsWith("$")
                  ? getNested(doc, v.slice(1))
                  : v,
              ])
            )
          );
        } else {
          groupKey = groupKeyDef;
        }

        if (!groupMap.has(groupKey)) {
          const initAcc = { _id: groupKey };
          for (const opDef of Object.values(accumulations)) {
            const accName = Object.keys(opDef)[0];
            initAcc[
              Object.keys(accumulations).find((k) => accumulations[k] === opDef)
            ] = accName === "$avg" ? { sum: 0, count: 0 } : undefined;
          }
          groupMap.set(groupKey, initAcc);
        }

        const acc = groupMap.get(groupKey);
        for (const [fieldName, opDef] of Object.entries(accumulations)) {
          const accName = Object.keys(opDef)[0];
          const expr = opDef[accName];
          const value = resolveExpression(doc, expr);
          if (accumulators[accName]) {
            acc[fieldName] =
              accName === "$avg"
                ? accumulators[accName](acc[fieldName], value)
                : accumulators[accName](acc[fieldName], value);
          }
        }
      }

      for (const acc of groupMap.values()) {
        for (const [fieldName, opDef] of Object.entries(accumulations)) {
          const accName = Object.keys(opDef)[0];
          if (accName === "$avg") {
            const { sum, count } = acc[fieldName];
            acc[fieldName] = count > 0 ? sum / count : 0;
          }
        }
        result.push(acc);
      }
    }

    return result;
  };

  // --------------------------------------------------
  // groupBy: agrupamento simples
  // --------------------------------------------------
  const groupBy = async ({
    user,
    dbname,
    collname,
    docs,
    by,
    asArray = false,
  } = {}) => {
    if (!by) {
      throw new Error("groupBy: campo 'by' é obrigatório");
    }

    let documents = docs;
    if (!Array.isArray(documents)) {
      if (!collname || !dbname || !user) {
        throw new Error(
          "docs deve ser um array ou (user, dbname, collname) devem ser informados"
        );
      }
      const rawData = await app.getCollData({ user, dbname, collname });
      documents = Array.isArray(rawData) ? rawData : [];
    }

    if (!Array.isArray(documents)) return asArray ? [] : {};

    const groups = new Map();
    for (const doc of documents) {
      const key = getNested(doc, by);
      const groupKey = key == null ? "__null__" : String(key);
      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey).push(doc);
    }

    if (asArray) {
      return Array.from(groups.entries()).map(([strKey, items]) => {
        const originalKey =
          strKey === "__null__"
            ? null
            : (() => {
                const num = Number(strKey);
                return !isNaN(num) && strKey === String(num) ? num : strKey;
              })();
        return { _id: originalKey, items };
      });
    }

    const result = {};
    for (const [strKey, items] of groups) {
      const originalKey =
        strKey === "__null__"
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
  // Registro no app
  // --------------------------------------------------

  return { group, groupBy };
};
