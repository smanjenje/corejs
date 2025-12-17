// core/plugins/group/GroupPlugin.js
module.exports = ({ app } = {}) => {
  if (!app) throw new Error("GroupPlugin: app obrigatório");

  const group = async ({ docs, by, accumulators = {} }) => {
    // ✅ Aceita APENAS docs, by, accumulators (não usa user/db/coll se docs for fornecido)
    if (docs === undefined) {
      throw new Error("GroupPlugin requer 'docs' no pipeline de agregação");
    }
    if (!Array.isArray(docs)) docs = [];
    if (by === undefined) throw new Error("group requer 'by'");

    const groups = new Map();

    for (const doc of docs) {
      // Resolve _id do grupo
      let groupId = by;
      if (typeof by === "string" && by.startsWith("$")) {
        const field = by.slice(1);
        groupId = doc[field];
      } else if (typeof by === "object") {
        groupId = {};
        for (const [k, v] of Object.entries(by)) {
          groupId[k] =
            typeof v === "string" && v.startsWith("$") ? doc[v.slice(1)] : v;
        }
      }

      const key = JSON.stringify(groupId);
      if (!groups.has(key)) {
        groups.set(key, { _id: groupId });
      }
      const g = groups.get(key);

      // Aplica acumuladores
      for (const [field, expr] of Object.entries(accumulators)) {
        if (typeof expr === "object" && expr !== null) {
          const op = Object.keys(expr)[0];
          const val =
            typeof expr[op] === "string" && expr[op].startsWith("$")
              ? doc[expr[op].slice(1)]
              : expr[op];

          if (op === "$sum") {
            g[field] = (g[field] || 0) + (typeof val === "number" ? val : 0);
          } else if (op === "$push") {
            g[field] = g[field] || [];
            g[field].push(val);
          } else if (op === "$first") {
            if (g[field] === undefined) g[field] = val;
          }
          // Adicione outros operadores conforme necessário
        }
      }
    }

    return Array.from(groups.values());
  };

  return { group };
};
