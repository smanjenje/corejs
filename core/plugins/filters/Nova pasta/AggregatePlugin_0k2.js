// core/plugins/aggregate/AggregatePlugin.js
// Pipeline de agregação que delega $group para GroupPlugin

module.exports = ({ app } = {}) => {
  if (!app) throw new Error("AggregatePlugin: app obrigatório");

  /**
   * Executa um pipeline de agregação.
   * @param {Object} params
   * @param {string} params.user
   * @param {string} params.dbname
   * @param {string} params.collname
   * @param {Array} params.pipeline - lista de estágios
   * @returns {Promise<Array>} documentos após pipeline
   */
  const aggregate = async ({ user, dbname, collname, pipeline = [] }) => {
    if (!user || !dbname || !collname) {
      throw new Error("aggregate requer user, dbname e collname");
    }
    if (!Array.isArray(pipeline)) {
      throw new Error("pipeline deve ser um array");
    }

    // Carrega documentos iniciais
    let docs = (await app.getCollData({ user, dbname, collname })) ?? [];
    if (!Array.isArray(docs)) docs = [];

    // Executa cada estágio
    for (const stage of pipeline) {
      const operator = Object.keys(stage)[0];
      const args = stage[operator];

      switch (operator) {
        case "$match":
          if (typeof app.findMany !== "function") {
            throw new Error("Estágio $match requer FilterPlugin");
          }
          docs = await app.findMany({
            user,
            dbname,
            collname,
            queries: [args],
            docs,
          });
          break;

        case "$lookup":
          if (typeof app.lookup !== "function") {
            throw new Error("Estágio $lookup requer LookupPlugin");
          }
          docs = await app.lookup({ docs, ...args });
          break;

        case "$sort":
          if (typeof app.sort !== "function") {
            throw new Error("Estágio $sort requer OrdenationPlugin");
          }
          docs = await app.sort({ docs, orderBy: args });
          break;

        case "$project":
          if (typeof app.project !== "function") {
            throw new Error("Estágio $project requer FieldsProjectPlugin");
          }
          docs = await app.project({ docs, fields: args });
          break;

        case "$limit":
          const limit = parseInt(args);
          if (!isNaN(limit) && limit >= 0) {
            docs = docs.slice(0, limit);
          }
          break;

        case "$skip":
          const skip = parseInt(args);
          if (!isNaN(skip) && skip >= 0) {
            docs = docs.slice(skip);
          }
          break;

        case "$group":
          if (typeof app.group !== "function") {
            throw new Error("Estágio $group requer GroupPlugin");
          }
          // ✅ CORREÇÃO AQUI: extrai _id e passa só os acumuladores
          const { _id, ...accumulators } = args;
          docs = await app.group({ docs, by: _id, accumulators });
          break;

        default:
          throw new Error(`Estágio não suportado: ${operator}`);
      }
    }

    return docs;
  };

  return { aggregate };
};
