// core/plugins/lookup/LookupPlugin.js
// Plugin para "join" entre coleções (lookup simples + recursivo)

module.exports = ({ app } = {}) => {
  if (!app) throw new Error("LookupPlugin: app obrigatório");

  // ========== Helper: obter valor aninhado ==========
  const getNestedValue = (obj, path) => {
    return path
      .split(".")
      .reduce((o, k) => (o != null ? o[k] : undefined), obj);
  };

  // ========== Helper: definir valor aninhado ==========
  const setNestedValue = (obj, path, value) => {
    const keys = path.split(".");
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (current[key] == null || typeof current[key] !== "object") {
        current[key] = {};
      }
      current = current[key];
    }
    current[keys[keys.length - 1]] = value;
  };

  // ========== Lookup simples (existente) ==========
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
    // (mesma lógica que você já tem)
    if (!from || !localField || !foreignField || !as) {
      throw new Error(
        "lookup requer 'from', 'localField', 'foreignField' e 'as'"
      );
    }

    if (docs === undefined) {
      if (!user || !dbname || !collname) {
        throw new Error(
          "lookup requer user, dbname, collname quando 'docs' não é fornecido"
        );
      }
    }

    const mainDocs =
      docs ?? (await app.getCollData({ user, dbname, collname })) ?? [];

    if (mainDocs.length === 0) return [];

    if (!user || !dbname) {
      throw new Error("lookup requer user e dbname");
    }
    const foreignDocs =
      (await app.getCollData({ user, dbname, collname: from })) ?? [];
    if (!Array.isArray(foreignDocs)) {
      throw new Error(`Coleção '${from}' deve retornar um array`);
    }

    const foreignMap = new Map();
    for (const doc of foreignDocs) {
      const key = doc[foreignField];
      if (key != null) {
        if (!foreignMap.has(key)) foreignMap.set(key, []);
        foreignMap.get(key).push(doc);
      }
    }

    return mainDocs.map((doc) => {
      const localValue = getNestedValue(doc, localField);
      const matches =
        localValue != null ? foreignMap.get(localValue) || [] : [];
      return { ...doc, [as]: matches };
    });
  };

  // ========== 🔁 Lookup recursivo ==========
  const lookupRecursive = async ({ user, dbname, collname, docs, lookups }) => {
    if (!Array.isArray(lookups) || lookups.length === 0) {
      throw new Error("lookupRecursive requer array 'lookups'");
    }

    // Começa com os documentos principais
    let currentDocs = docs;
    if (currentDocs === undefined) {
      if (!user || !dbname || !collname) {
        throw new Error(
          "lookupRecursive requer user, dbname, collname quando 'docs' não é fornecido"
        );
      }
      currentDocs = (await app.getCollData({ user, dbname, collname })) ?? [];
      if (!Array.isArray(currentDocs)) currentDocs = [];
    }

    // Aplica cada lookup em sequência
    for (const op of lookups) {
      const { from, localField, foreignField, as } = op;
      if (!from || !localField || !foreignField || !as) {
        throw new Error(
          "Cada lookup requer 'from', 'localField', 'foreignField', 'as'"
        );
      }

      // Carrega coleção estrangeira
      const foreignDocs =
        (await app.getCollData({ user, dbname, collname: from })) ?? [];
      if (!Array.isArray(foreignDocs)) {
        throw new Error(`Coleção '${from}' deve retornar um array`);
      }

      // Cria mapa para O(1)
      const foreignMap = new Map();
      for (const doc of foreignDocs) {
        const key = doc[foreignField];
        if (key != null) {
          if (!foreignMap.has(key)) foreignMap.set(key, []);
          foreignMap.get(key).push(doc);
        }
      }

      // Aplica lookup recursivamente em todos os documentos relevantes
      const walkAndPopulate = (obj) => {
        if (Array.isArray(obj)) {
          return obj.map((item) => walkAndPopulate(item));
        }
        if (obj !== null && typeof obj === "object") {
          const localValue = getNestedValue(obj, localField);
          const matches =
            localValue != null ? foreignMap.get(localValue) || [] : [];
          const newObj = { ...obj };
          setNestedValue(newObj, as, matches);
          return newObj;
        }
        return obj;
      };

      // Aplica no nível raiz (ou em qualquer profundidade, se localField for aninhado)
      currentDocs = walkAndPopulate(currentDocs);
    }

    return currentDocs;
  };

  return {
    lookup,
    lookupRecursive,
  };
};
