// core/plugins/joins/PopulatePlugin.js
// Suporta: path, as, targetColl, targetId (opcional), select

module.exports = ({ app } = {}) => {
  if (!app) {
    throw new Error("PopulatePlugin: app é obrigatório");
  }

  if (app.pluginsNames && typeof app.pluginsNames === "object") {
    app.pluginsNames.PopulatePlugin = true;
  }

  /**
   * Popula campos de referência com suporte a targetId personalizado.
   *
   * @param {Object} options
   * @param {string} options.user
   * @param {string} options.dbname
   * @param {string} [options.collname] - necessário se docs não fornecido
   * @param {Array} [options.docs]
   * @param {Array<{
   *   path: string,
   *   as?: string,
   *   targetColl: string,
   *   targetId?: string,
   *   select?: string[]
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
      let finalSelect = null; // null = sem projeção
      if (Array.isArray(select) && select.length > 0) {
        if (as === undefined && !select.includes("_id")) {
          finalSelect = ["_id", ...select];
        } else {
          finalSelect = select;
        }
      }

      const refValues = [
        ...new Set(documents.map((doc) => doc[path]).filter((v) => v != null)),
      ];

      if (refValues.length === 0) continue;

      const targetDocs = await app.getCollData({
        user,
        dbname,
        collname: targetColl,
      });
      if (!Array.isArray(targetDocs) || targetDocs.length === 0) {
        for (const doc of documents) {
          if (doc[path] != null) doc[targetField] = null;
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

      for (const doc of documents) {
        const ref = doc[path];
        if (ref != null) {
          doc[targetField] = targetMap.get(ref) || null;
        }
      }
    }

    return documents;
  };



  return { populate };
};
