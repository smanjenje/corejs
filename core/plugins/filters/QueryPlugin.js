// core/plugins/query/QueryPlugin.js
// Orquestrador: combina filtragem, ordenação, projeção e paginação

module.exports = ({ app } = {}) => {
  if (!app) throw new Error("QueryPlugin: app obrigatório");

  /**
   * Executa uma consulta completa com filtros opcionais.
   * @param {Object} params
   * @param {string} params.user
   * @param {string} params.dbname
   * @param {string} params.collname
   * @param {Array|Object} [params.queries] - critérios para findMany
   * @param {Object} [params.orderBy] - ex: { _id: "desc" }
   * @param {string[]} [params.fields] - ex: ["_id", "nome"]
   * @param {number} [params.page=1]
   * @param {number} [params.limit=10]
   * @returns {Promise<Object>} { docs, meta } (se paginação ativada) ou { docs }
   */
  const query = async ({
    user,
    dbname,
    collname,
    queries,
    orderBy,
    fields,
    page,
    limit,
  }) => {
    // Validação obrigatória
    if (!user || !dbname || !collname) {
      throw new Error("query requer user, dbname e collname");
    }

    // 1. FILTRAGEM
    let docs;
    if (queries) {
      if (typeof app.findMany !== "function") {
        throw new Error("QueryPlugin requer FilterPlugin");
      }
      docs = await app.findMany({ user, dbname, collname, queries });
    } else {
      // Sem filtro → carrega todos
      docs = (await app.getCollData({ user, dbname, collname })) ?? [];
      if (!Array.isArray(docs)) docs = [];
    }

    // 2. ORDENAÇÃO (opcional)
    if (orderBy) {
      if (typeof app.sort !== "function") {
        throw new Error("QueryPlugin requer OrdenationPlugin");
      }
      docs = await app.sort({ docs, orderBy });
    }

    // 3. PROJEÇÃO (opcional)
    if (fields) {
      if (typeof app.project !== "function") {
        throw new Error("QueryPlugin requer FieldsProjectPlugin");
      }
      docs = await app.project({ docs, fields });
    }

    // 4. PAGINAÇÃO (opcional)
    if (page !== undefined || limit !== undefined) {
      if (typeof app.paginate !== "function") {
        throw new Error("QueryPlugin requer PaginationPlugin");
      }
      return await app.paginate({ docs, page, limit });
    }

    return { docs };
  };

  return { query };
};
