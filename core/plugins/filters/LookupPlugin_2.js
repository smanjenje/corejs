// core/plugins/lookup/LookupPlugin.js
// Plugin para "join" entre coleções (lookup)

module.exports = ({ app } = {}) => {
  if (!app) throw new Error("LookupPlugin: app obrigatório");

  /**
   * Realiza um lookup (join) entre coleções.
   * @param {Object} params
   * @param {string} [params.user]
   * @param {string} [params.dbname]
   * @param {string} params.collname - coleção principal (se docs não fornecido)
   * @param {Array} [params.docs] - documentos da coleção principal
   * @param {string} params.from - coleção estrangeira (ex: "disciplinas")
   * @param {string} params.localField - campo na coleção principal (ex: "_id")
   * @param {string} params.foreignField - campo na coleção estrangeira (ex: "professorId")
   * @param {string} params.as - nome do novo campo no resultado (ex: "disciplinas")
   * @returns {Promise<Array>} documentos com os dados "joinados"
   */
  const lookup = async ({
    user,
    dbname,
    collname,
    docs,
    from,
    localField,
    foreignField,
    as,
  }) => {
    // Validação de parâmetros obrigatórios
    if (!from || !localField || !foreignField || !as) {
      throw new Error(
        "lookup requer 'from', 'localField', 'foreignField' e 'as'"
      );
    }

    let mainDocs;

    if (docs !== undefined) {
      mainDocs = Array.isArray(docs) ? docs : [];
    } else {
      if (!user || !dbname || !collname) {
        throw new Error(
          "lookup requer user, dbname, collname quando 'docs' não é fornecido"
        );
      }
      mainDocs = (await app.getCollData({ user, dbname, collname })) ?? [];
      if (!Array.isArray(mainDocs)) mainDocs = [];
    }

    if (mainDocs.length === 0) {
      return [];
    }

    // Carrega todos os documentos da coleção estrangeira
    if (!user || !dbname) {
      throw new Error(
        "lookup requer user e dbname para acessar coleção 'from'"
      );
    }
    const foreignDocs =
      (await app.getCollData({ user, dbname, collname: from })) ?? [];
    if (!Array.isArray(foreignDocs)) {
      throw new Error(`Coleção '${from}' deve retornar um array`);
    }

    // Cria um mapa de índices para lookup O(1)
    const foreignMap = new Map();
    for (const doc of foreignDocs) {
      const key = doc[foreignField];
      if (key != null) {
        // ignora null/undefined
        if (!foreignMap.has(key)) {
          foreignMap.set(key, []);
        }
        foreignMap.get(key).push(doc);
      }
    }

    // Helper: obter valor aninhado (suporte a "a.b.c")
    const getNestedValue = (obj, path) => {
      return path
        .split(".")
        .reduce((o, k) => (o != null ? o[k] : undefined), obj);
    };

    // Aplica o lookup
    return mainDocs.map((doc) => {
      const localValue = getNestedValue(doc, localField);
      const matches =
        localValue != null ? foreignMap.get(localValue) || [] : [];
      return { ...doc, [as]: matches };
    });
  };

  return { lookup };
};
