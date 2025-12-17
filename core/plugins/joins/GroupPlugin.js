// core/plugins/aggregate/GroupPlugin.js
// Plugin de agrupamento puro — sem pipeline, sem sort/limit/having

module.exports = ({ app } = {}) => {
  if (!app) {
    throw new Error("GroupPlugin: app é obrigatório");
  }

  if (app.pluginsNames && typeof app.pluginsNames === "object") {
    app.pluginsNames.GroupPlugin = true;
  }

  // --------------------------------------------------
  // Utilitário para acesso a campos aninhados
  // --------------------------------------------------
  const getNested = (obj, path) => {
    if (!obj || typeof obj !== "object") return undefined;
    return path
      .split(".")
      .reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
  };

  // --------------------------------------------------
  // group: agregação com acumuladores
  // --------------------------------------------------
  const group = async ({ user, dbname, collname, docs, groups = [] }) => {
    let documents = docs;
    if (!Array.isArray(documents)) {
      if (!collname || !dbname || !user) {
        throw new Error(
          "docs ou (user, dbname, collname) devem ser fornecidos"
        );
      }
      const rawData = await app.getCollData({ user, dbname, collname });
      documents = Array.isArray(rawData) ? rawData : [];
    }

    if (!Array.isArray(groups) || groups.length === 0) {
      return documents;
    }

    const result = [];

    const accumulators = {
      $sum: (acc, val) =>
        (typeof acc !== "number" ? 0 : acc) +
        (typeof val === "number" ? val : 0),
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

    for (const stage of groups) {
      const { _id: groupKeyDef, ...accumulations } = stage;
      const groupMap = new Map();

      for (const doc of documents) {
        // Resolve a chave de agrupamento
        let groupKey;
        if (groupKeyDef == null) {
          groupKey = null;
        } else if (
          typeof groupKeyDef === "string" &&
          groupKeyDef.startsWith("$")
        ) {
          groupKey = getNested(doc, groupKeyDef.slice(1));
        } else if (typeof groupKeyDef === "object") {
          // Chave composta: { year: "$createdAt.year" }
          const keyObj = {};
          for (const [k, expr] of Object.entries(groupKeyDef)) {
            keyObj[k] =
              typeof expr === "string" && expr.startsWith("$")
                ? getNested(doc, expr.slice(1))
                : expr;
          }
          groupKey = keyObj;
        } else {
          groupKey = groupKeyDef;
        }

        // Normaliza chave para uso em Map (evita problemas com objetos)
        const keyStr =
          groupKey === null
            ? "__null__"
            : typeof groupKey === "object"
            ? JSON.stringify(groupKey)
            : String(groupKey);

        if (!groupMap.has(keyStr)) {
          const initAcc = { _id: groupKey };
          for (const [field] of Object.entries(accumulations)) {
            initAcc[field] = undefined;
          }
          groupMap.set(keyStr, initAcc);
        }

        const acc = groupMap.get(keyStr);
        for (const [field, opDef] of Object.entries(accumulations)) {
          const accName = Object.keys(opDef)[0];
          const expr = opDef[accName];
          let value;
          if (typeof expr === "string" && expr.startsWith("$")) {
            value = getNested(doc, expr.slice(1));
          } else {
            value = expr;
          }

          if (accName === "$avg") {
            acc[field] = accumulators.$avg(acc[field], value);
          } else if (accumulators[accName]) {
            acc[field] = accumulators[accName](acc[field], value);
          }
        }
      }

      // Finalização dos acumuladores
      for (const acc of groupMap.values()) {
        for (const [field, opDef] of Object.entries(accumulations)) {
          const accName = Object.keys(opDef)[0];
          if (accName === "$avg") {
            const { sum, count } = acc[field] || {};
            acc[field] = count > 0 ? sum / count : 0;
          }
        }
        result.push(acc);
      }
    }

    return result;
  };

  // --------------------------------------------------
  // groupBy: agrupamento simples (documentos completos)
  // --------------------------------------------------
  const groupBy = async ({
    user,
    dbname,
    collname,
    docs,
    by,
    asArray = false,
  }) => {
    if (!by) {
      throw new Error("groupBy: campo 'by' é obrigatório");
    }

    let documents = docs;
    if (!Array.isArray(documents)) {
      if (!collname || !dbname || !user) {
        throw new Error(
          "docs ou (user, dbname, collname) devem ser fornecidos"
        );
      }
      const rawData = await app.getCollData({ user, dbname, collname });
      documents = Array.isArray(rawData) ? rawData : [];
    }

    const groups = {};
    for (const doc of documents) {
      const key = getNested(doc, by);
      const strKey = key == null ? "__null__" : String(key);
      if (!groups[strKey]) groups[strKey] = [];
      groups[strKey].push(doc);
    }

    if (asArray) {
      return Object.entries(groups).map(([strKey, items]) => {
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
    for (const [strKey, items] of Object.entries(groups)) {
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
  // Wrappers úteis
  // --------------------------------------------------
  const countBy = async (opts) => {
    const { by, ...rest } = opts;
    const result = await group({
      ...rest,
      groups: [{ _id: `$${by}`, count: { $sum: 1 } }],
    });
    const out = {};
    for (const r of result) out[r._id] = r.count;
    return out;
  };

  const sumBy = async ({ by, of, ...rest }) => {
    const result = await group({
      ...rest,
      groups: [{ _id: `$${by}`, total: { $sum: `$${of}` } }],
    });
    const out = {};
    for (const r of result) out[r._id] = r.total;
    return out;
  };

  const uniqueBy = async ({ by, field, ...rest }) => {
    const result = await group({
      ...rest,
      groups: [{ _id: `$${by}`, values: { $addToSet: `$${field}` } }],
    });
    const out = {};
    for (const r of result) out[r._id] = r.values;
    return out;
  };

  // --------------------------------------------------
  // bucket: agrupamento por faixas
  // --------------------------------------------------
  const bucket = async ({
    user,
    dbname,
    collname,
    docs,
    groupBy,
    boundaries,
    default: def = "other",
  }) => {
    let documents = docs;
    if (!Array.isArray(documents)) {
      if (!collname || !dbname || !user) {
        throw new Error(
          "docs ou (user, dbname, collname) devem ser fornecidos"
        );
      }
      const rawData = await app.getCollData({ user, dbname, collname });
      documents = Array.isArray(rawData) ? rawData : [];
    }

    if (!Array.isArray(boundaries) || boundaries.length < 2) {
      throw new Error(
        "bucket: 'boundaries' deve ser um array com pelo menos 2 valores"
      );
    }

    const buckets = {};
    const fieldPath = groupBy.startsWith("$") ? groupBy.slice(1) : groupBy;

    for (const doc of documents) {
      const value = getNested(doc, fieldPath);
      if (typeof value !== "number") continue;

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

      if (!buckets[bucketId]) buckets[bucketId] = 0;
      buckets[bucketId]++;
    }

    return Object.entries(buckets).map(([id, count]) => ({ _id: id, count }));
  };

  // --------------------------------------------------
  // Registro
  // --------------------------------------------------

  return { group, groupBy, countBy, sumBy, uniqueBy, bucket };
};
