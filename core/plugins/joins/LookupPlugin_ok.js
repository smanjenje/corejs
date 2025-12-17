// core/plugins/joins/LookupPlugin.js
// Inspirado no $lookup do MongoDB, com suporte a campos aninhados

module.exports = ({ app } = {}) => {
  if (!app) {
    throw new Error("LookupPlugin: app é obrigatório");
  }

  if (app.pluginsNames && typeof app.pluginsNames === "object") {
    app.pluginsNames.LookupPlugin = true;
  }

  // --------------------------------------------------
  // Utils para campos aninhados (reutiliza do PopulatePlugin)
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

  const setNested = (obj, path, value) => {
    if (!obj || typeof obj !== "object") return;
    const keys = path.split(".");
    const lastKey = keys.pop();
    const parent = keys.reduce((o, key) => {
      if (!o[key] || typeof o[key] !== "object") o[key] = {};
      return o[key];
    }, obj);
    parent[lastKey] = value;
  };

  /**
   * Realiza um "join" entre coleções com base em campos arbitrários.
   *
   * @param {Object} options
   * @param {string} options.user
   * @param {string} options.dbname
   * @param {string} [options.collname] - necessário se docs não fornecido
   * @param {Array} [options.docs]
   * @param {Array<{
   *   localField: string,      // campo na coleção original (ex: "userId")
   *   foreignField: string,    // campo na coleção alvo (ex: "_id")
   *   from: string,            // coleção alvo (ex: "Users")
   *   as: string,              // nome do campo de saída (ex: "user")
   *   select?: string[]        // campos a retornar
   * }>} [options.lookups]
   * @returns {Promise<Array>}
   */
  const lookup = async ({ user, dbname, collname, docs, lookups } = {}) => {
    let documents = docs;
    if (!Array.isArray(documents)) {
      if (!collname) {
        throw new Error(
          "docs deve ser um array ou collname deve ser informado"
        );
      }
      const rawData = await app.getCollData({ user, dbname, collname });
      documents = Array.isArray(rawData) ? rawData : [];
    }

    if (!Array.isArray(lookups) || lookups.length === 0) {
      return documents;
    }

    // Valida dependência do FilterPlugin
    if (typeof app.findMany !== "function") {
      throw new Error("LookupPlugin requer FilterPlugin (método findMany)");
    }

    for (const lk of lookups) {
      const {
        localField,
        foreignField = "_id",
        from: targetColl,
        as: outputField,
        select = [],
      } = lk;

      if (!localField || !targetColl || !outputField) continue;

      // Coleta todos os valores únicos de localField
      const localValues = [
        ...new Set(
          documents
            .map((doc) => getNested(doc, localField))
            .filter((v) => v != null)
        ),
      ];

      if (localValues.length === 0) {
        for (const doc of documents) setNested(doc, outputField, []);
        continue;
      }

      // ✅ Usa findMany para buscar documentos com foreignField em localValues
      const relatedDocs = await app.findMany({
        user,
        dbname,
        collname: targetColl,
        queries: [{ [foreignField]: { $in: localValues } }],
      });

      // Cria mapa: valor do foreignField → lista de docs (para 1:N)
      const map = new Map();
      for (const doc of relatedDocs) {
        const key = getNested(doc, foreignField);
        if (key == null) continue;

        if (!map.has(key)) map.set(key, []);

        if (Array.isArray(select) && select.length > 0) {
          const projected = {};
          for (const field of select) {
            projected[field] = getNested(doc, field);
          }
          map.get(key).push(projected);
        } else {
          map.get(key).push({ ...doc });
        }
      }

      // Atribui resultado (array) no campo de saída
      for (const doc of documents) {
        const localVal = getNested(doc, localField);
        const result = localVal != null ? map.get(localVal) || [] : [];
        setNested(doc, outputField, result);
      }
    }

    return documents;
  };

  return { lookup };
};
