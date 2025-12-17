// core/plugins/filters/LookupPlugin.js
// $lookup com suporte completo a caminhos aninhados

module.exports = ({ app } = {}) => {
  if (!app) throw new Error("LookupPlugin: app obrigatório");

  if (app.pluginsNames && typeof app.pluginsNames === "object") {
    app.pluginsNames.LookupPlugin = true;
  }

  // ---------- Helper: get nested values ----------
  const getNestedValues = (obj, path) => {
    if (
      obj == null ||
      typeof obj !== "object" ||
      typeof path !== "string" ||
      !path
    )
      return [];
    const keys = path.split(".");
    let current = obj;
    let i = 0;

    for (; i < keys.length - 1; i++) {
      const key = keys[i];
      if (Array.isArray(current)) {
        const values = [];
        for (const item of current) {
          values.push(...getNestedValues(item, keys.slice(i).join(".")));
        }
        return values;
      }
      if (current == null || typeof current !== "object") return [];
      current = current[key];
    }

    const lastKey = keys[keys.length - 1];
    if (Array.isArray(current)) {
      return current.filter((v) => v != null);
    }
    if (current == null || typeof current !== "object") {
      return current != null ? [current] : [];
    }
    const value = current[lastKey];
    if (Array.isArray(value)) {
      return value.filter((v) => v != null);
    }
    return value != null ? [value] : [];
  };

  // ---------- Helper: set nested value ----------
  const setNestedValue = (obj, path, value) => {
    if (typeof path !== "string" || !path) {
      throw new Error("setNestedValue: 'path' deve ser string não vazia");
    }
    const keys = path.split(".");
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (
        current[k] == null ||
        typeof current[k] !== "object" ||
        Array.isArray(current[k])
      ) {
        current[k] = {};
      }
      current = current[k];
    }
    current[keys[keys.length - 1]] = value;
  };

  // ---------- Lookup principal ----------
  const lookup = async ({
    docs,
    collname,
    from,
    localField,
    foreignField,
    as,
    user,
    dbname,
  }) => {
    // Validação de entrada
    if (!from || !localField || !foreignField || !as) {
      throw new Error(
        "lookup requer 'from', 'localField', 'foreignField' e 'as'"
      );
    }
    if (!user || !dbname) {
      throw new Error("lookup requer 'user' e 'dbname'");
    }

    // Carrega docs da coleção local se necessário
    if (!docs || !Array.isArray(docs)) {
      if (!collname) {
        throw new Error(
          "lookup requer 'docs' (array) ou 'collname' para carregar documentos"
        );
      }
      docs = (await app.getCollData({ user, dbname, collname })) ?? [];
      if (!Array.isArray(docs)) {
        throw new Error(`lookup: coleção '${collname}' não retornou um array`);
      }
    }

    // Carrega coleção estrangeira
    let foreignDocs = [];
    try {
      foreignDocs = await app.getCollData({ user, dbname, collname: from });
      if (!Array.isArray(foreignDocs)) foreignDocs = [];
    } catch (err) {
      console.warn(
        `[LookupPlugin] Erro ao carregar coleção '${from}':`,
        err.message
      );
    }

    // Mapa: valor do foreignField → documentos
    const foreignMap = new Map();
    for (const doc of foreignDocs) {
      const values = getNestedValues(doc, foreignField);
      for (const key of values) {
        if (key == null) continue;
        if (!foreignMap.has(key)) foreignMap.set(key, []);
        foreignMap.get(key).push(doc);
      }
    }

    // Aplica lookup
    return docs.map((doc) => {
      const localValues = getNestedValues(doc, localField);
      const matches = new Set();

      for (const val of localValues) {
        const found = foreignMap.get(val);
        if (found) {
          for (const f of found) matches.add(f);
        }
      }

      // Deep clone + injeção aninhada
      const resultDoc = JSON.parse(JSON.stringify(doc));
      setNestedValue(resultDoc, as, Array.from(matches));
      return resultDoc;
    });
  };

  return { lookup };
};
