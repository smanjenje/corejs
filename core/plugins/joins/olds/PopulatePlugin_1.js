// core/plugins/joins/PopulatePlugin.js
// Suporta: path, as, targetColl, targetId (opcional), select
// ✅ Suporte completo a campos aninhados: path="a.b.id", as="a.b.data"

module.exports = ({ app } = {}) => {
  if (!app) {
    throw new Error("PopulatePlugin: app é obrigatório");
  }

  if (app.pluginsNames && typeof app.pluginsNames === "object") {
    app.pluginsNames.PopulatePlugin = true;
  }

  // --------------------------------------------------
  // Utils para campos aninhados
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
   * Popula campos de referência com suporte a targetId personalizado e campos aninhados.
   *
   * @param {Object} options
   * @param {string} options.user
   * @param {string} options.dbname
   * @param {string} [options.collname] - necessário se docs não fornecido
   * @param {Array} [options.docs]
   * @param {Array<{
   *   path: string,        // ex: "userId" ou "owner.profileId"
   *   as?: string,         // ex: "user" ou "owner.profile"
   *   targetColl: string,
   *   targetId?: string,   // default "_id"
   *   select?: string[]    // campos a retornar da coleção alvo
   * }>} [options.populates]
   * @returns {Promise<Array>}
   */
  const populate = async ({ user, dbname, collname, docs, populates } = {}) => {
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

    if (!Array.isArray(populates) || populates.length === 0) {
      return documents;
    }

    for (const pop of populates) {
      const { path, as, targetColl, targetId = "_id", select = [] } = pop;

      if (!path || !targetColl) continue;

      const targetField = as || path;

      // ✅ Lógica corrigida para finalSelect
      let finalSelect = null;
      if (Array.isArray(select) && select.length > 0) {
        if (as === undefined && !select.includes("_id")) {
          finalSelect = ["_id", ...select];
        } else {
          finalSelect = select;
        }
      }

      // ✅ Coleta valores de path aninhado
      const refValues = [
        ...new Set(
          documents.map((doc) => getNested(doc, path)).filter((v) => v != null)
        ),
      ];

      if (refValues.length === 0) continue;

      const targetDocs = await app.getCollData({
        user,
        dbname,
        collname: targetColl,
      });
      if (!Array.isArray(targetDocs)) {
        for (const doc of documents) {
          setNested(doc, targetField, null);
        }
        continue;
      }

      const targetMap = new Map();
      const refValueSet = new Set(refValues);

      for (const doc of targetDocs) {
        const idValue = doc[targetId];
        if (idValue != null && refValueSet.has(idValue)) {
          if (finalSelect !== null) {
            const projected = {};
            for (const field of finalSelect) {
              projected[field] = doc[field];
            }
            targetMap.set(idValue, projected);
          } else {
            targetMap.set(idValue, { ...doc });
          }
        }
      }

      // ✅ Atribui valor populado em campo aninhado
      for (const doc of documents) {
        const ref = getNested(doc, path);
        if (ref != null) {
          const populatedValue = targetMap.get(ref) || null;
          setNested(doc, targetField, populatedValue);
        }
      }
    }

    return documents;
  };

  return { populate };
};
