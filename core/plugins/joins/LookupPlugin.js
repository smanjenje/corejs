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
  // Utils para campos aninhados
  // --------------------------------------------------

  /**
   * Função auxiliar para acessar campos aninhados usando notação de ponto (ex: "endereco.cidade_id").
   * @param {object} obj - Objeto de dados.
   * @param {string} path - Caminho do campo.
   * @returns {*} O valor do campo ou undefined.
   */
  const getNested = (obj, path) => {
    if (!obj || typeof obj !== "object") return undefined;
    return path
      .split(".")
      .reduce(
        (o, key) => (o && o[key] !== undefined ? o[key] : undefined),
        obj
      );
  };

  /**
   * Função auxiliar para definir um valor em campos aninhados (ex: "endereco.cidade").
   * Cria objetos intermediários se não existirem.
   * @param {object} obj - O objeto onde o valor será definido.
   * @param {string} path - O caminho do campo (ex: "endereco.cidade").
   * @param {*} value - O valor a ser definido.
   */
  const setNested = (obj, path, value) => {
    if (!obj || typeof obj !== "object") return;
    const keys = path.split(".");
    const lastKey = keys.pop();
    const parent = keys.reduce((o, key) => {
      // Cria o objeto se não existir ou se não for um objeto válido
      if (!o[key] || typeof o[key] !== "object" || Array.isArray(o[key]))
        o[key] = {};
      return o[key];
    }, obj);
    parent[lastKey] = value;
  };

  /**
   * Realiza um "join" entre coleções com base em campos arbitrários (similar ao $lookup).
   *
   * @param {Object} options
   * @param {string} options.user
   * @param {string} options.dbname
   * @param {string} [options.collname] - necessário se docs não for fornecido
   * @param {Array} [options.docs] - array de documentos (opcional, se já carregados)
   * @param {Array<{
   * localField: string,      // campo na coleção original (ex: "userId")
   * foreignField: string,    // campo na coleção alvo (ex: "_id")
   * from: string,            // coleção alvo (ex: "Users")
   * as: string,              // nome do campo de saída (ex: "user")
   * select?: string[]        // campos a retornar (projeção)
   * }>} [options.lookups] - Array de configurações de lookup
   * @returns {Promise<Array>} Retorna os documentos com os dados de lookup anexados.
   */
  const lookup = async ({ user, dbname, collname, docs, lookups } = {}) => {
    let documents = docs;
    if (!Array.isArray(documents)) {
      if (!collname) {
        throw new Error(
          "docs deve ser um array ou collname deve ser informado"
        );
      }
      // Se não houver docs, carrega a coleção principal
      const rawData = await app.getCollData({ user, dbname, collname });
      documents = Array.isArray(rawData) ? rawData : [];
    }

    if (!Array.isArray(lookups) || lookups.length === 0) {
      return documents;
    }

    // Valida dependência do método de busca eficiente (findMany)
    if (typeof app.findMany !== "function") {
      throw new Error(
        "LookupPlugin requer uma função 'findMany' no objeto app para busca eficiente."
      );
    }

    // 1. Itera sobre cada configuração de lookup
    for (const lk of lookups) {
      const {
        localField,
        foreignField = "_id",
        from: targetColl,
        as: outputField,
        select = [],
      } = lk;

      if (!localField || !targetColl || !outputField) continue;

      // 2. OTIMIZAÇÃO DE I/O: Coleta todos os valores únicos de localField
      //    Isto permite usar uma única consulta $in na coleção alvo.
      const localValues = [
        ...new Set(
          documents
            .map((doc) => getNested(doc, localField))
            .filter((v) => v != null) // Filtra nulos e indefinidos
        ),
      ];

      if (localValues.length === 0) {
        // Se não houver valores para buscar, define o campo de saída como array vazio
        for (const doc of documents) setNested(doc, outputField, []);
        continue;
      }

      // 3. Busca eficiente na coleção alvo (usando $in)
      const relatedDocs = await app.findMany({
        user,
        dbname,
        collname: targetColl,
        // OTIMIZAÇÃO: Filtra apenas pelos IDs/Valores que realmente existem na coleção principal
        queries: [{ [foreignField]: { $in: localValues } }],
      });

      // 4. OTIMIZAÇÃO DE BUSCA/ATRIBUIÇÃO: Cria mapa (Hash Map) para busca O(1)
      //    Chave: Valor do foreignField, Valor: Array de documentos correspondentes (1:N)
      const map = new Map();
      for (const doc of relatedDocs) {
        const key = getNested(doc, foreignField);
        if (key == null) continue;

        if (!map.has(key)) map.set(key, []);

        // Aplica projeção (select) se definida
        if (Array.isArray(select) && select.length > 0) {
          const projected = {};
          for (const field of select) {
            projected[field] = getNested(doc, field);
          }
          map.get(key).push(projected);
        } else {
          // Se não houver select, retorna o documento completo (como cópia)
          map.get(key).push({ ...doc });
        }
      }

      // 5. Atribui resultado no campo de saída (O(1) lookup por documento local)
      for (const doc of documents) {
        const localVal = getNested(doc, localField);
        // Garante que o resultado seja sempre um array (padrão $lookup para 1:N)
        const result = localVal != null ? map.get(localVal) || [] : [];
        setNested(doc, outputField, result);
      }
    }

    return documents;
  };

  return { lookup };
};
