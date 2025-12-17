// core/plugins/lookup/LookupPlugin.js
// Plugin para "join" entre coleções (lookup simples + recursivo)
// Compatível com CoreJS

module.exports = ({ app } = {}) => {
  if (!app) throw new Error("LookupPlugin: app obrigatório");

  // ==================================================
  // Helpers
  // ==================================================

  // Obtém valor aninhado (ex: "cliente.id")
  const getNestedValue = (obj, path) =>
    path.split(".").reduce((o, k) => (o != null ? o[k] : undefined), obj);

  // Define valor aninhado (ex: set "cliente.nome")
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

  // ==================================================
  // LOOKUP SIMPLES (documento → documento)
  // ==================================================

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
    if (!from || !localField || !foreignField || !as) {
      throw new Error(
        "lookup requer 'from', 'localField', 'foreignField' e 'as'"
      );
    }

    if (!docs) {
      if (!user || !dbname || !collname) {
        throw new Error("lookup requer 'docs' ou 'user', 'dbname', 'collname'");
      }
      docs = (await app.getCollData({ user, dbname, collname })) ?? [];
    }

    const foreignDocs =
      (await app.getCollData({ user, dbname, collname: from })) ?? [];

    // Cria mapa foreignField -> doc
    const foreignMap = new Map();
    for (const doc of foreignDocs) {
      if (doc[foreignField] != null) foreignMap.set(doc[foreignField], doc);
    }

    return docs.map((doc) => {
      const localValue = getNestedValue(doc, localField);
      const populated =
        localValue != null ? foreignMap.get(localValue) || null : null;
      return { ...doc, [as]: populated };
    });
  };

  // ==================================================
  // LOOKUP RECURSIVO (seguro, suporta arrays aninhados)
  // ==================================================

  const lookupRecursive = async ({ user, dbname, collname, docs, lookups }) => {
    if (!Array.isArray(lookups) || lookups.length === 0) {
      throw new Error("lookupRecursive requer array 'lookups'");
    }

    if (!docs) {
      if (!user || !dbname || !collname) {
        throw new Error(
          "lookupRecursive requer 'docs' ou 'user', 'dbname', 'collname'"
        );
      }
      docs = (await app.getCollData({ user, dbname, collname })) ?? [];
    }

    let currentDocs = docs;

    for (const op of lookups) {
      const { from, localField, foreignField, as } = op;

      const foreignDocs =
        (await app.getCollData({ user, dbname, collname: from })) ?? [];
      const foreignMap = new Map();
      for (const doc of foreignDocs) {
        if (doc[foreignField] != null) foreignMap.set(doc[foreignField], doc);
      }

      const walk = (obj, pathParts = localField.split("."), idx = 0) => {
        if (Array.isArray(obj))
          return obj.map((item) => walk(item, pathParts, idx));

        if (obj && typeof obj === "object") {
          const key = pathParts[idx];

          if (idx === pathParts.length - 1) {
            // Último nível: aplica lookup
            if (obj[key] !== undefined) {
              obj[as] = foreignMap.get(obj[key]) || null;
            }
          } else if (Array.isArray(obj[key])) {
            // Se o próximo nível é array, percorre cada elemento
            obj[key] = obj[key].map((el) => walk(el, pathParts, idx + 1));
          } else if (obj[key] && typeof obj[key] === "object") {
            // Continua descendo
            walk(obj[key], pathParts, idx + 1);
          }

          // Continua percorrendo outras chaves do objeto
          for (const k in obj) {
            if (k !== key) obj[k] = walk(obj[k], pathParts, idx);
          }

          return obj;
        }

        return obj;
      };

      currentDocs = walk(currentDocs);
    }

    return currentDocs;
  };

  return {
    lookup,
    lookupRecursive,
  };
};
