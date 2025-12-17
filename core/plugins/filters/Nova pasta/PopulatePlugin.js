// Resolve referências entre coleções (estilo Mongoose.populate)
// Suporta:
//  - populate simples (campo direto)
//  - populate em arrays (itens.produtoId)
//  - { docs: [...] } OU { collname: "..." }

module.exports = ({ app } = {}) => {
  if (!app) throw new Error("PopulatePlugin: app obrigatório");

  if (app.pluginsNames && typeof app.pluginsNames === "object") {
    app.pluginsNames.PopulatePlugin = true;
  }

  // --------------------------------------------------
  // POPULATE SIMPLES (clienteId → cliente)
  // --------------------------------------------------
  const populate = async ({
    docs,
    collname,
    path,
    model,
    select,
    as,
    user,
    dbname,
    cache, // ✅ cache opcional (Map<model, docs[]>)
  }) => {
    if (!path || !model) {
      throw new Error("populate requer 'path' e 'model'");
    }
    if (!user || !dbname) {
      throw new Error("populate requer 'user' e 'dbname'");
    }

    if (!docs || !Array.isArray(docs)) {
      if (!collname) {
        throw new Error("populate requer 'docs' como array ou 'collname'");
      }
      docs = await app.getCollData({ user, dbname, collname });
    }

    const asField = as || path.replace(/Id$/, "");

    const ids = [
      ...new Set(docs.map((d) => d[path]).filter((v) => v != null && v !== "")),
    ];

    if (!ids.length) {
      return docs.map((d) => ({ ...d, [asField]: null }));
    }

    // ✅ Usa o cache se fornecido; fallback apenas para compatibilidade (opcional)
    let targets = cache?.get(model);
    if (!targets) {
      // Em teoria, isso não deve acontecer se populateMany for usado corretamente
      targets = await app.getCollData({ user, dbname, collname: model });
    }

    const map = new Map(targets.map((t) => [t._id, t]));

    return docs.map((doc) => {
      const refId = doc[path];
      const target = map.get(refId);

      if (!target) {
        return { ...doc, [asField]: null };
      }

      if (select?.length) {
        const projected = {};
        select.forEach((f) => f in target && (projected[f] = target[f]));
        return { ...doc, [asField]: projected };
      }

      return { ...doc, [asField]: target };
    });
  };

  // --------------------------------------------------
  // POPULATE ARRAY (itens.produtoId → itens[].produto)
  // --------------------------------------------------
  const populateArray = async ({
    docs,
    collname,
    arrayPath, // "itens"
    refField, // "produtoId"
    model, // "produtos"
    as = "ref",
    select,
    user,
    dbname,
    cache, // ✅ cache opcional
  }) => {
    if (!arrayPath || !refField || !model) {
      throw new Error("populateArray requer arrayPath, refField e model");
    }
    if (!user || !dbname) {
      throw new Error("populateArray requer user e dbname");
    }

    if (!docs || !Array.isArray(docs)) {
      if (!collname) {
        throw new Error("populateArray requer 'docs' ou 'collname'");
      }
      docs = await app.getCollData({ user, dbname, collname });
    }

    const ids = [
      ...new Set(
        docs.flatMap((d) =>
          (d[arrayPath] || []).map((i) => i[refField]).filter(Boolean)
        )
      ),
    ];

    if (!ids.length) return docs;

    // ✅ Usa o cache
    let targets = cache?.get(model);
    if (!targets) {
      targets = await app.getCollData({ user, dbname, collname: model });
    }

    const map = new Map(targets.map((t) => [t._id, t]));

    return docs.map((doc) => ({
      ...doc,
      [arrayPath]: (doc[arrayPath] || []).map((item) => {
        const target = map.get(item[refField]);

        if (!target) {
          return { ...item, [as]: null };
        }

        if (select?.length) {
          const projected = {};
          select.forEach((f) => f in target && (projected[f] = target[f]));
          return { ...item, [as]: projected };
        }

        return { ...item, [as]: target };
      }),
    }));
  };

  // --------------------------------------------------
  // POPULATE MANY (pipeline sequencial com cache único)
  // --------------------------------------------------
  const populateMany = async ({ docs, paths, user, dbname }) => {
    if (!Array.isArray(paths) || paths.length === 0) {
      return docs || [];
    }

    // 1. Coleta todos os modelos únicos necessários
    const modelsNeeded = [
      ...new Set(paths.map((p) => p.model).filter(Boolean)),
    ];

    // 2. Carrega todas as coleções alvo em paralelo
    const cache = new Map();
    if (modelsNeeded.length > 0) {
      const loadPromises = modelsNeeded.map((model) =>
        app
          .getCollData({ user, dbname, collname: model })
          .then((docs) => [model, docs])
      );
      const loaded = await Promise.all(loadPromises);
      for (const [model, docs] of loaded) {
        cache.set(model, docs);
      }
    }

    // 3. Aplica cada populate usando o cache
    let result = Array.isArray(docs) ? [...docs] : [];
    for (const cfg of paths) {
      if (cfg.arrayPath) {
        result = await populateArray({
          docs: result,
          user,
          dbname,
          cache,
          ...cfg,
        });
      } else {
        result = await populate({ docs: result, user, dbname, cache, ...cfg });
      }
    }
    return result;
  };

  return {
    populate,
    populateArray,
    populateMany,
  };
};
