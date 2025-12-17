// core/plugins/populate/PopulatePlugin.js
// Resolve referências entre coleções (estilo Mongoose.populate)
// Suporta: { docs: [...] } OU { collname: "..." }

module.exports = ({ app } = {}) => {
  if (!app) throw new Error("PopulatePlugin: app obrigatório");

  if (app.pluginsNames && typeof app.pluginsNames === "object") {
    app.pluginsNames.PopulatePlugin = true;
  }

  /**
   * Popula campos de referência com dados reais de outras coleções.
   * @param {Object} params
   * @param {Array} [params.docs] - documentos a serem populados (opcional se usar collname)
   * @param {string} [params.collname] - coleção de origem (se docs não for fornecido)
   * @param {string} params.path - campo com ID de referência (ex: "clienteId")
   * @param {string} params.model - coleção alvo (ex: "clientes")
   * @param {string[]} [params.select] - campos a retornar (ex: ["nome", "email"])
   * @param {string} [params.as] - nome do novo campo (padrão: path sem "Id")
   * @param {string} params.user - obrigatório para acesso à coleção
   * @param {string} params.dbname - obrigatório para acesso à coleção
   * @returns {Promise<Array>} documentos com campos populados
   */
  const populate = async ({
    docs,
    collname,
    path,
    model,
    select,
    as,
    user,
    dbname,
  }) => {
    if (!path || !model) {
      throw new Error("populate requer 'path' e 'model'");
    }
    if (!user || !dbname) {
      throw new Error("populate requer 'user' e 'dbname'");
    }

    // Carrega docs da coleção se necessário
    if (!docs || !Array.isArray(docs)) {
      if (!collname) {
        throw new Error(
          "populate requer 'docs' como array ou 'collname' para buscar dados"
        );
      }
      docs = await app.getCollData({ user, dbname, collname });
      if (!Array.isArray(docs)) {
        throw new Error(
          `populate: coleção '${collname}' não retornou array de documentos`
        );
      }
    }

    // Nome do novo campo (ex: "clienteId" → "cliente")
    const asField = as || path.replace(/Id$/, "");

    // Extrai IDs únicos do campo de referência
    const ids = [
      ...new Set(
        docs.map((doc) => doc[path]).filter((id) => id != null && id !== "")
      ),
    ];

    if (ids.length === 0) {
      return docs.map((doc) => ({ ...doc, [asField]: null }));
    }

    // Busca documentos alvo
    let targetDocs = [];
    try {
      targetDocs = await app.getCollData({ user, dbname, collname: model });
      if (!Array.isArray(targetDocs)) targetDocs = [];
    } catch (err) {
      console.warn(
        `[PopulatePlugin] Erro ao carregar coleção '${model}':`,
        err.message
      );
      return docs.map((doc) => ({ ...doc, [asField]: null }));
    }

    // Cria mapa de _id → documento
    const idMap = new Map();
    for (const doc of targetDocs) {
      if (doc._id != null) {
        idMap.set(doc._id, doc);
      }
    }

    // Aplica população
    return docs.map((doc) => {
      const refId = doc[path];
      const targetDoc = refId != null ? idMap.get(refId) : undefined;
      const populatedDoc = { ...doc };

      if (targetDoc) {
        if (select && Array.isArray(select)) {
          const projected = {};
          for (const field of select) {
            if (field in targetDoc) {
              projected[field] = targetDoc[field];
            }
          }
          populatedDoc[asField] = projected;
        } else {
          populatedDoc[asField] = targetDoc;
        }
      } else {
        populatedDoc[asField] = null;
      }

      return populatedDoc;
    });
  };

  /**
   * Popula múltiplos campos em sequência
   * @param {Object} params
   * @param {Array} params.paths - ex: [{ path: "clienteId", model: "clientes" }]
   */
  const populateMany = async ({ docs, paths, user, dbname }) => {
    let result = [...docs];
    for (const config of paths) {
      result = await populate({ docs: result, user, dbname, ...config });
    }
    return result;
  };

  return {
    populate,
    populateMany,
  };
};
