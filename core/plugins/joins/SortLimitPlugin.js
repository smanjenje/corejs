// core/plugins/transform/SortLimitPlugin.js

module.exports = ({ app } = {}) => {
  if (!app) throw new Error("SortLimitPlugin: app é obrigatório");

  if (app.pluginsNames && typeof app.pluginsNames === "object") {
    app.pluginsNames.SortLimitPlugin = true;
  }

  // --------------------------------------------------
  // $sort: ordena documentos
  // --------------------------------------------------
  /**
   * Ordena uma lista de documentos.
   * @param {Object} options
   * @param {Array} options.docs
   * @param {Object} options.sortSpec - ex: { name: 1, "user.age": -1 }
   * @returns {Array}
   */
  const sort = ({ docs = [], sortSpec = {} } = {}) => {
    if (!Array.isArray(docs) || Object.keys(sortSpec).length === 0) {
      return docs.map(app.clone);
    }

    return [...docs]
      .map(app.clone) // garante imutabilidade
      .sort((a, b) => {
        for (const [path, direction] of Object.entries(sortSpec)) {
          const aVal = app.getNestedField(a, path);
          const bVal = app.getNestedField(b, path);

          // Trata null/undefined como menor
          if (aVal == null && bVal == null) continue;
          if (aVal == null) return -1;
          if (bVal == null) return 1;

          let comparison = 0;
          if (typeof aVal === "string" && typeof bVal === "string") {
            comparison = aVal.localeCompare(bVal);
          } else if (aVal < bVal) {
            comparison = -1;
          } else if (aVal > bVal) {
            comparison = 1;
          }

          if (comparison !== 0) {
            return direction === -1 ? -comparison : comparison;
          }
        }
        return 0;
      });
  };

  // --------------------------------------------------
  // $limit: limita número de documentos
  // --------------------------------------------------
  const limit = ({ docs = [], n = 0 } = {}) => {
    if (!Array.isArray(docs) || n <= 0) return [];
    return docs.slice(0, n).map(app.clone);
  };

  // --------------------------------------------------
  // $skip: pula documentos (útil para paginação)
  // --------------------------------------------------
  const skip = ({ docs = [], n = 0 } = {}) => {
    if (!Array.isArray(docs) || n <= 0) return docs.map(app.clone);
    return docs.slice(n).map(app.clone);
  };

  // --------------------------------------------------
  // Registro no app
  // --------------------------------------------------
  return { sort, limit, skip };
};
