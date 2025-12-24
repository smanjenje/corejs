// core/plugins/joins/LookupPlugin.js
module.exports = ({ app } = {}) => {
  if (!app) throw new Error("LookupPlugin: app é obrigatório");
  if (app.pluginsNames && typeof app.pluginsNames === "object") {
    app.pluginsNames.LookupPlugin = true;
  }

  const lookup = async ({ user, dbname, collname, docs, lookups } = {}) => {
    let documents = docs;

    // 1. Carrega docs da coleção local se não vierem
    if (!Array.isArray(documents)) {
      if (!collname)
        throw new Error("docs deve ser um array ou collname informado");
      const rawData = await app.getCollData({ user, dbname, collname });
      documents = Array.isArray(rawData) ? rawData.map(app.clone) : [];
    }

    if (!Array.isArray(lookups) || lookups.length === 0) return documents;

    if (typeof app.findMany !== "function") {
      throw new Error("LookupPlugin requer 'findMany' no app.");
    }

    // 2. Processa cada configuração de lookup
    for (const lk of lookups) {
      const {
        localField,
        foreignField = "_id",
        from: targetColl,
        as: outputField,
        select = [],
      } = lk;
      if (!localField || !targetColl || !outputField) continue;

      // Coleta valores únicos do campo local
      const localValues = [
        ...new Set(
          documents
            .map((d) => app.getNestedField(d, localField))
            .filter((v) => v != null)
        ),
      ];

      if (localValues.length === 0) {
        // Campo de saída como array vazio
        documents.forEach((d) => app.setNestedValue(d, outputField, []));
        continue;
      }

      // Busca eficiente na coleção alvo
      const relatedDocs = await app.findMany({
        user,
        dbname,
        collname: targetColl,
        queries: [{ [foreignField]: { $in: localValues } }],
      });

      // Cria mapa para lookup O(1)
      const map = new Map();
      for (const doc of relatedDocs) {
        const key = app.getNestedField(doc, foreignField);
        if (key == null) continue;
        if (!map.has(key)) map.set(key, []);

        const projected =
          Array.isArray(select) && select.length > 0
            ? app.pick(doc, select)
            : app.clone(doc);

        map.get(key).push(projected);
      }

      // Aplica resultados ao campo de saída
      for (const doc of documents) {
        const localVal = app.getNestedField(doc, localField);
        const result = localVal != null ? map.get(localVal) || [] : [];
        app.setNestedValue(doc, outputField, result);
      }
    }

    return documents;
  };

  return { lookup };
};
