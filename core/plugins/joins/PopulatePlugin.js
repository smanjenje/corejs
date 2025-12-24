// core/plugins/joins/PopulatePlugin.js
module.exports = ({ app } = {}) => {
  if (!app) throw new Error("PopulatePlugin: app é obrigatório");

  if (app.pluginsNames && typeof app.pluginsNames === "object") {
    app.pluginsNames.PopulatePlugin = true;
  }

  /**
   * Popula campos de referência com suporte a targetId personalizado e campos aninhados.
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
      if (!collname)
        throw new Error(
          "docs deve ser um array ou collname deve ser informado"
        );
      const rawData = await app.getCollData({ user, dbname, collname });
      documents = Array.isArray(rawData) ? rawData.map(app.clone) : [];
    }

    if (!Array.isArray(populates) || populates.length === 0) return documents;

    for (const pop of populates) {
      const { path, as, targetColl, targetId = "_id", select = [] } = pop;
      if (!path || !targetColl) continue;

      const targetField = as || path;

      // Final select inclui _id por padrão se necessário
      let finalSelect = null;
      if (Array.isArray(select) && select.length > 0) {
        finalSelect =
          !as && !select.includes("_id") ? ["_id", ...select] : select;
      }

      // Coleta valores únicos de referência
      const refValues = [
        ...new Set(
          documents
            .map((d) => app.getNestedField(d, path))
            .filter((v) => v != null)
        ),
      ];
      if (refValues.length === 0) continue;

      // Busca todos os documentos da coleção alvo
      const targetDocs = await app.getCollData({
        user,
        dbname,
        collname: targetColl,
      });
      if (!Array.isArray(targetDocs)) {
        documents.forEach((d) => app.setNestedValue(d, targetField, null));
        continue;
      }

      // Cria mapa de referência para lookup O(1)
      const targetMap = new Map();
      const refValueSet = new Set(refValues);

      for (const doc of targetDocs) {
        const idValue = doc[targetId];
        if (idValue != null && refValueSet.has(idValue)) {
          const cloned = app.clone(doc);
          const projected =
            Array.isArray(finalSelect) && finalSelect.length > 0
              ? app.pick(cloned, finalSelect)
              : cloned;
          targetMap.set(idValue, projected);
        }
      }

      // Atribui valor populado no campo aninhado
      for (const doc of documents) {
        const ref = app.getNestedField(doc, path);
        if (ref != null) {
          const populatedValue = targetMap.get(ref) || null;
          app.setNestedValue(doc, targetField, populatedValue);
        }
      }
    }

    return documents;
  };

  return { populate };
};
