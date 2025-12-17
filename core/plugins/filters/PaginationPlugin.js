// core/plugins/filters/PaginationPlugin.js

module.exports = ({ app } = {}) => {
  if (!app) throw new Error("PaginationPlugin: app é obrigatório");

  /**
   * Pagina um array de documentos.
   * * @param {Object} args
   * @param {Array} args.docs - O array de documentos vindo de um findMany ou Aggregate.
   * @param {number} [args.page=1] - O número da página atual.
   * @param {number} [args.limit=10] - Quantidade de itens por página.
   * @returns {Object} { status: true, data: Array, pagination: Object }
   */
  const paginate = async ({
    user,
    dbname,
    collname,
    docs,
    page = 1,
    limit = 10,
  } = {}) => {
    // Garante que docs seja um array

    let data = docs;
    if (!Array.isArray(data)) {
      if (!collname) {
        throw new Error(
          "docs deve ser um array ou collname deve ser informado"
        );
      }
      const rawData = await app.getCollData({ user, dbname, collname });
      data = Array.isArray(rawData) ? rawData : [];
    }

    // Converte para números inteiros para evitar erros de string
    const currentPage = Math.max(1, parseInt(page) || 1);
    const pageSize = Math.max(1, parseInt(limit) || 10);

    const totalDocs = data.length;
    const totalPages = Math.ceil(totalDocs / pageSize);

    // Calcula o índice de início e fim
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;

    // Fatiamento dos dados (O coração da paginação)
    const paginatedItems = data.slice(startIndex, endIndex);

    return {
      status: true,
      data: paginatedItems,
      pagination: {
        totalDocs,
        totalPages,
        currentPage,
        pageSize,
        hasNextPage: currentPage < totalPages,
        hasPrevPage: currentPage > 1,
        nextPage: currentPage < totalPages ? currentPage + 1 : null,
        prevPage: currentPage > 1 ? currentPage - 1 : null,
      },
    };
  };

  return { paginate };
};
