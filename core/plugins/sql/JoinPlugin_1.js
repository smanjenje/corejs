module.exports = ({ app }) => {
  /**
   * Função auxiliar para acessar campos aninhados (ex: "endereco.cidade_id").
   * @param {object} obj - Objeto de dados.
   * @param {string} path - Caminho do campo.
   * @returns {*} O valor do campo ou undefined.
   */
  const getNestedField = (obj, path) => {
    if (!obj || typeof obj !== "object") return undefined;
    return path.split(".").reduce((acc, part) => acc && acc[part], obj);
  };

  /**
   * Função auxiliar para definir um valor em campos aninhados (ex: "endereco.cidade").
   * Cria objetos intermediários se não existirem.
   * @param {object} obj - O objeto onde o valor será definido.
   * @param {string} path - O caminho do campo (ex: "endereco.cidade").
   * @param {*} value - O valor a ser definido.
   */
  const setNestedField = (obj, path, value) => {
    const keys = path.split(".");
    const lastKey = keys.pop();
    let nestedDoc = obj;

    for (let key of keys) {
      if (
        !nestedDoc[key] ||
        typeof nestedDoc[key] !== "object" ||
        Array.isArray(nestedDoc[key])
      ) {
        nestedDoc[key] = {};
      }
      nestedDoc = nestedDoc[key];
    }
    nestedDoc[lastKey] = value;
  };

  /**
   * Realiza um JOIN (Junção) entre a coleção local e coleções de destino,
   * utilizando busca O(1) e suportando 1:1, 1:N e LEFT JOIN.
   *
   * @param {object} args
   * @param {string} args.user - Informações do usuário.
   * @param {string} args.dbname - Nome do banco de dados.
   * @param {string} args.localColl - Nome da coleção principal (local) para a junção.
   * @param {Array<object>} args.joins - Configurações de junção.
   * - targetColl, localField, targetField, as
   * - joinType: "INNER" | "LEFT" (default: "INNER")
   * - isMultiple: boolean (true para 1:N, retorna um array. Default: false para 1:1)
   * @returns {Promise<{status: boolean, data: Array<object>}>}
   */
  const join = async ({ user, dbname, localColl, joins }) => {
    // 1. Recupera dados da coleção local
    let localData = await app.getCollData({
      user,
      dbname,
      collname: localColl,
    });

    // 2. Cria um mapa para armazenar os dados das coleções de destino em cache
    //    O cache agora armazena Mapas de Hash para busca O(1), e não arrays.
    const joinMap = {};

    // 3. Itera sobre os documentos locais
    for (let doc of localData) {
      // 4. Itera sobre as junções definidas
      for (let joinConfig of joins) {
        const {
          localField,
          targetColl,
          targetField,
          joinType = "INNER",
          as,
          isMultiple = false,
        } = joinConfig;

        // 5. Verifica/carrega os dados da coleção de destino no cache
        if (!joinMap[targetColl]) {
          const rawData = await app.getCollData({
            user,
            dbname,
            collname: targetColl,
          });

          // Constrói o Map de hash (chave: targetField, valor: documento(s))
          const mappedData = new Map();
          for (const targetDoc of rawData) {
            const key = getNestedField(targetDoc, targetField);
            if (key !== undefined) {
              if (isMultiple) {
                // Suporte 1:N: armazena um array de documentos para cada chave
                if (!mappedData.has(key)) {
                  mappedData.set(key, []);
                }
                mappedData.get(key).push(targetDoc);
              } else {
                // Suporte 1:1: armazena um único documento
                mappedData.set(key, targetDoc);
              }
            }
          }
          joinMap[targetColl] = mappedData;
        }

        const targetMap = joinMap[targetColl];
        const localValue = getNestedField(doc, localField);
        let finalData = null;

        // 6. Busca O(1) no mapa de hash
        if (localValue !== undefined && targetMap.has(localValue)) {
          finalData = targetMap.get(localValue);
        }

        // 7. Aplica os dados da junção (ou null)

        // Se houver dados OU se for um LEFT JOIN (mesmo que os dados sejam null)
        if (finalData !== null || joinType === "LEFT") {
          setNestedField(doc, as, finalData);
        } else if (joinType === "INNER") {
          // Se for INNER JOIN e não houver correspondência, o campo será null
          setNestedField(doc, as, null);

          // Opcional: Se a intenção for remover o documento local completamente no INNER JOIN sem match
          // Você teria que marcar o documento para remoção e filtrar localData no final.
        }
      }
    }

    // 8. Retorna os dados locais com as junções aplicadas
    return { status: true, data: localData };
  };

  return {
    joinCollections: join,
  };
};
