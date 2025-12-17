// core/plugins/group/GroupPlugin.js
module.exports = ({ app } = {}) => {
  if (!app) throw new Error("GroupPlugin: app obrigatório");

  const getValue = (doc, expr) => {
    if (typeof expr !== "string" || !expr.startsWith("$")) return expr;
    return expr.slice(1).split(".").reduce((o, k) => (o != null ? o[k] : undefined), doc);
  };

  const group = async ({ user, dbname, collname, docs, by, accumulators = {} }) => {
    if (by === undefined) throw new Error("group requer 'by'");

    let inputDocs = docs;
    if (inputDocs === undefined) {
      if (!user || !dbname || !collname) {
        throw new Error("group requer user, dbname, collname quando 'docs' não é fornecido");
      }
      inputDocs = (await app.getCollData({ user, dbname, collname })) ?? [];
      if (!Array.isArray(inputDocs)) inputDocs = [];
    }

    const groups = new Map();

    for (const doc of inputDocs) {
      // Resolve _id do grupo
      let groupId;
      if (by === null) {
        groupId = null;
      } else if (typeof by === "string" && by.startsWith("$")) {
        groupId = getValue(doc, by);
      } else if (typeof by === "object") {
        groupId = {};
        for (const [k, v] of Object.entries(by)) {
          groupId[k] = getValue(doc, v);
        }
      } else {
        groupId = by;
      }

      const key = JSON.stringify(groupId);
      if (!groups.has(key)) {
        // Inicializa acumuladores
        const state = { _id: groupId };
        for (const [field, expr] of Object.entries(accumulators)) {
          if (typeof expr === "object" && expr !== null) {
            const op = Object.keys(expr)[0];
            if (op === "$sum") state[field] = 0;
            else if (op === "$avg") state[field] = { sum: 0, count: 0 };
            else if (["$min", "$max", "$first"].includes(op)) state[field] = null;
            else if (op === "$last") state[field] = null;
            else if (op === "$push" || op === "$addToSet") state[field] = [];
            else state[field] = null;
          } else {
            state[field] = expr;
          }
        }
        groups.set(key, state);
      }

      // Atualiza
      const g = groups.get(key);
      for (const [field, expr] of Object.entries(accumulators)) {
        if (typeof expr === "object" && expr !== null) {
          const op = Object.keys(expr)[0];
          const val = getValue(doc, expr[op]);

          if (op === "$sum" && typeof val === "number") {
            g[field] += val;
          } else if (op === "$avg" && typeof val === "number") {
            g[field].sum += val;
            g[field].count += 1;
          } else if (op === "$min" && (g[field] === null || (val != null && val < g[field]))) {
            g[field] = val;
          } else if (op === "$max" && (g[field] === null || (val != null && val > g[field]))) {
            g[field] = val;
          } else if (op === "$first" && g[field] === null) {
            g[field] = val;
          } else if (op === "$last") {
            g[field] = val;
          } else if (op === "$push") {
            g[field].push(val);
          } else if (op === "$addToSet") {
            if (!g[field].includes(val)) g[field].push(val);
          }
        }
      }
    }

    // Finaliza
    return Array.from(groups.values()).map(g => {
      const result = { _id: g._id };
      for (const [k, v] of Object.entries(g)) {
        if (k === "_id") continue;
        if (v && typeof v === "object" && v.sum !== undefined && v.count !== undefined) {
          result[k] = v.count > 0 ? v.sum / v.count : null;
        } else {
          result[k] = v;
        }
      }
      return result;
    });
  };

  return { group };
};