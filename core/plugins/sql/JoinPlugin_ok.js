module.exports = ({ app }) => {
  /**
   * Realiza um JOIN (Junção) entre a coleção local e coleções de destino
   * baseadas nas configurações fornecidas.
   *
   * @param {object} args
   * @param {string} args.user - Informações do usuário.
   * @param {string} args.dbname - Nome do banco de dados.
   * @param {string} args.localColl - Nome da coleção principal (local) para a junção.
   * @param {Array<object>} args.joins - Configurações de junção.
   * @returns {Promise<{status: boolean, data: Array<object>}>}
   */
  const join = async ({ user, dbname, localColl, joins }) => {
    // 1. Recupera dados da coleção local
    let localData = await app.getCollData({
      user,
      dbname,
      collname: localColl,
    });

    /**
     * Função auxiliar para acessar campos aninhados usando notação de ponto (ex: "endereco.cidade_id").
     * @param {object} obj - Objeto de dados.
     * @param {string} path - Caminho do campo.
     */
    const getNestedField = (obj, path) => {
      if (!obj || typeof obj !== "object") return undefined;
      return path.split(".").reduce((acc, part) => acc && acc[part], obj);
    };

    /**
     * Função auxiliar para verificar se o campo de destino é aninhado.
     * @param {string} field - Nome do campo.
     */
    const isNestedField = (field) => {
      return field.includes(".");
    };

    // 2. Cria um mapa para armazenar os dados das coleções de destino em cache
    //    (Evita múltiplas leituras de banco de dados para a mesma coleção de destino)
    const joinMap = {};

    // 3. Itera sobre os documentos locais
    for (let doc of localData) {
      // 4. Itera sobre as junções definidas para cada documento local
      for (let joinConfig of joins) {
        const { localField, targetColl, targetField, joinType, as } =
          joinConfig;

        // 5. Verifica se os dados da coleção de destino já foram carregados (cache)
        if (!joinMap[targetColl]) {
          // Se não, recupera os dados da coleção de destino
          joinMap[targetColl] = await app.getCollData({
            user,
            dbname,
            collname: targetColl,
          });
        }

        let targetData = joinMap[targetColl]; // Dados carregados da coleção de destino
        let joinedData = [];

        // 6. Obtém o valor local para correspondência, suportando campos aninhados
        const localValue = getNestedField(doc, localField);

        // 7. Realiza o tipo de join (atualmente, somente INNER JOIN)
        if (joinType === "INNER" && localValue !== undefined) {
          // Realiza o filtro (busca)
          joinedData = targetData.filter((targetDoc) => {
            const targetValue = getNestedField(targetDoc, targetField);
            return targetValue === localValue;
          });
        }

        // 8. Adiciona os dados unidos ao documento local no campo especificado por "as"
        if (joinedData.length > 0) {
          // Se o campo "as" for aninhado (ex: "endereco.cidade")
          if (isNestedField(as)) {
            const keys = as.split(".");
            let lastKey = keys.pop(); // O nome do campo final (ex: "cidade")
            let nestedDoc = doc;

            // Cria os objetos aninhados (ex: 'endereco') caso não existam
            for (let key of keys) {
              if (!nestedDoc[key]) nestedDoc[key] = {};
              nestedDoc = nestedDoc[key];
            }
            // Adiciona o dado unido ao campo final
            nestedDoc[lastKey] = joinedData[0];
          } else {
            // Se não for aninhado, coloca diretamente no nível raiz
            doc[as] = joinedData[0];
          }
        } else {
          // Se não houver correspondência, adiciona um valor vazio ou null
          doc[as] = null;
        }
      }
    }

    // 9. Retorna os dados locais com as junções aplicadas
    return { status: true, data: localData };
  };

  return {
    joinCollections: join,
  };
};