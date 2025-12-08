// core/plugins/aggregate/AggregatePlugin.js
module.exports = ({ app } = {}) => {
  if (!app) throw new Error("AggregatePlugin: app obrigatório");

  // ========== Helper: $unwind ==========
  const unwindDocs = (docs, fieldExpr) => {
    let fieldPath;
    let includeArrayIndex = null;

    if (typeof fieldExpr === "string") {
      fieldPath = fieldExpr;
    } else if (typeof fieldExpr === "object" && fieldExpr !== null) {
      fieldPath = fieldExpr.path;
      includeArrayIndex = fieldExpr.includeArrayIndex || null;
    } else {
      throw new Error("$unwind requer uma string ou objeto com 'path'");
    }

    if (typeof fieldPath !== "string" || !fieldPath.startsWith("$")) {
      throw new Error("$unwind: caminho deve começar com $");
    }

    // console.log("📥 Documentos recebidos no $unwind:", docs);
    // console.log("🔍 Campo a desaninhar:", fieldPath);

    const result = [];
    const path = fieldPath.slice(1);
    const keys = path.split(".");

    for (const doc of docs) {
      // Obtém o valor do campo alvo
      let parent = doc;
      let lastKey = keys[0];

      if (keys.length > 1) {
        for (let i = 0; i < keys.length - 1; i++) {
          if (parent[keys[i]] == null) {
            parent = null;
            break;
          }
          parent = parent[keys[i]];
        }
        lastKey = keys[keys.length - 1];
      }

      const arrayValue = parent?.[lastKey];

      // Comportamento do MongoDB
      if (arrayValue == null) continue; // campo ausente ou null → ignora
      if (!Array.isArray(arrayValue)) {
        result.push(JSON.parse(JSON.stringify(doc))); // mantém documento intacto
        continue;
      }
      if (arrayValue.length === 0) continue; // array vazio → ignora

      // Gera um documento por elemento
      for (let i = 0; i < arrayValue.length; i++) {
        const newDoc = JSON.parse(JSON.stringify(doc)); // deep clone
        let current = newDoc;
        for (let j = 0; j < keys.length - 1; j++) {
          current = current[keys[j]];
        }
        current[lastKey] = arrayValue[i];

        if (includeArrayIndex) {
          newDoc[includeArrayIndex] = i;
        }

        result.push(newDoc);
      }
    }

    return result;
  };

  // ========== Aggregate ==========
  const aggregate = async ({ user, dbname, collname, pipeline = [] }) => {
    if (!user || !dbname || !collname) {
      throw new Error("aggregate requer user, dbname e collname");
    }
    if (!Array.isArray(pipeline)) {
      throw new Error("pipeline deve ser um array");
    }

    let docs = (await app.getCollData({ user, dbname, collname })) ?? [];
    if (!Array.isArray(docs)) docs = [];

    for (const stage of pipeline) {
      const operator = Object.keys(stage)[0];
      const args = stage[operator];

      switch (operator) {
        case "$match":
          docs = await app.findMany({
            user,
            dbname,
            collname,
            queries: [args],
            docs,
          });
          break;
        case "$lookup":
          docs = await app.lookup({ docs, ...args });
          break;
        case "$sort":
          docs = await app.sort({ docs, orderBy: args });
          break;
        case "$project":
          docs = await app.project({ docs, fields: args });
          break;
        case "$limit":
          const limit = parseInt(args);
          if (!isNaN(limit) && limit >= 0) docs = docs.slice(0, limit);
          break;
        case "$skip":
          const skip = parseInt(args);
          if (!isNaN(skip) && skip >= 0) docs = docs.slice(skip);
          break;
        case "$group":
          const { _id, ...accumulators } = args;
          docs = await app.group({ docs, by: _id, accumulators });
          break;
        // === ✅ $unwind ===
        case "$unwind":
          docs = unwindDocs(docs, args);
          break;
        default:
          throw new Error(`Estágio não suportado: ${operator}`);
      }
    }

    return docs;
  };

  return { aggregate };
};
