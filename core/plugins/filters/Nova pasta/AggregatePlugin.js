// core/plugins/aggregate/AggregatePlugin.js
// Pipeline de agregação com suporte a operadores avançados

module.exports = ({ app } = {}) => {
  if (!app) throw new Error("AggregatePlugin: app obrigatório");

  // Registro do plugin
  if (app.pluginsNames && typeof app.pluginsNames === "object") {
    app.pluginsNames.AggregatePlugin = true;
  }

  // --------------------------------------------------
  // Helper: $unwind (comportamento compatível com MongoDB)
  // --------------------------------------------------
  const unwindDocs = (docs, fieldExpr) => {
    let fieldPath;
    let includeArrayIndex = null;

    if (typeof fieldExpr === "string") {
      fieldPath = fieldExpr;
    } else if (fieldExpr && typeof fieldExpr === "object") {
      fieldPath = fieldExpr.path;
      includeArrayIndex = fieldExpr.includeArrayIndex || null;
    } else {
      throw new Error(
        "$unwind requer uma string ou { path: '...', includeArrayIndex: '...' }"
      );
    }

    if (
      !fieldPath ||
      typeof fieldPath !== "string" ||
      !fieldPath.startsWith("$")
    ) {
      throw new Error("$unwind: caminho deve ser uma string começando com '$'");
    }

    const result = [];
    const path = fieldPath.slice(1);
    const keys = path.split(".");

    for (const doc of docs) {
      let parent = doc;
      let lastKey = keys[0];

      // Navega até o penúltimo nível
      if (keys.length > 1) {
        for (let i = 0; i < keys.length - 1; i++) {
          const key = keys[i];
          if (parent == null || parent[key] == null) {
            parent = null;
            break;
          }
          parent = parent[key];
        }
        if (parent === null) {
          result.push(JSON.parse(JSON.stringify(doc)));
          continue;
        }
        lastKey = keys[keys.length - 1];
      }

      const arrayValue = parent[lastKey];

      // Regras do MongoDB:
      if (arrayValue == null) {
        // null, undefined ou campo ausente → ignora o documento
        continue;
      }
      if (!Array.isArray(arrayValue)) {
        // Não é array → mantém documento intacto
        result.push(JSON.parse(JSON.stringify(doc)));
        continue;
      }
      if (arrayValue.length === 0) {
        // Array vazio → ignora
        continue;
      }

      // Cria um documento por elemento do array
      for (let i = 0; i < arrayValue.length; i++) {
        const newDoc = JSON.parse(JSON.stringify(doc));
        let current = newDoc;

        for (let j = 0; j < keys.length - 1; j++) {
          const k = keys[j];
          if (current[k] == null || typeof current[k] !== "object") {
            current[k] = {};
          }
          current = current[k];
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

  // --------------------------------------------------
  // Motor de agregação
  // --------------------------------------------------
  const aggregate = async ({ user, dbname, collname, pipeline = [] }) => {
    if (!user || !dbname || !collname) {
      throw new Error("aggregate requer 'user', 'dbname' e 'collname'");
    }
    if (!Array.isArray(pipeline)) {
      throw new Error("pipeline deve ser um array de estágios");
    }

    // Carrega documentos iniciais
    let docs = (await app.getCollData({ user, dbname, collname })) ?? [];
    if (!Array.isArray(docs)) docs = [];

    // Executa cada estágio
    for (const stage of pipeline) {
      if (!stage || typeof stage !== "object" || Array.isArray(stage)) {
        throw new Error("Estágio de pipeline inválido");
      }

      const operators = Object.keys(stage);
      if (operators.length === 0) continue; // ignora {}

      const operator = operators[0];
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
          docs =
            typeof app.sort === "function"
              ? await app.sort({ docs, orderBy: args })
              : docs;
          break;

        case "$project":
          docs =
            typeof app.project === "function"
              ? await app.project({ docs, fields: args })
              : docs;
          break;

        case "$limit":
          {
            const limit = parseInt(args, 10);
            if (!isNaN(limit)) {
              docs = limit > 0 ? docs.slice(0, limit) : [];
            }
          }
          break;

        case "$skip":
          {
            const skip = parseInt(args, 10);
            if (!isNaN(skip) && skip > 0) {
              docs = docs.slice(skip);
            }
          }
          break;

        case "$group":
          if (args && typeof args === "object") {
            const { _id, ...accumulators } = args;
            docs =
              typeof app.group === "function"
                ? await app.group({ docs, by: _id, accumulators })
                : docs;
          }
          break;

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
