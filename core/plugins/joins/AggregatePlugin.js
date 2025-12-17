// core/plugins/aggregate/AggregatePlugin.js
// Orquestrador de pipeline que reutiliza 100% dos plugins existentes
// ✅ Repassa user/dbname para stages que acessam o banco

module.exports = ({ app } = {}) => {
  if (!app) {
    throw new Error("AggregatePlugin: app é obrigatório");
  }

  if (app.pluginsNames && typeof app.pluginsNames === "object") {
    app.pluginsNames.AggregatePlugin = true;
  }

  /**
   * Executa um pipeline de agregação completo.
   * @param {Object} options
   * @param {string} options.user
   * @param {string} options.dbname
   * @param {string} options.collname
   * @param {Array} [options.docs]
   * @param {Array} options.pipeline - [{ $match: ... }, { $group: ... }, ...]
   * @returns {Promise<Array>}
   */
  const aggregate = async ({ user, dbname, collname, docs, pipeline = [] }) => {
    let currentDocs = docs;

    // Carrega documentos da coleção se necessário
    if (!Array.isArray(currentDocs)) {
      if (!collname || !dbname || !user) {
        throw new Error(
          "docs ou (user, dbname, collname) devem ser fornecidos"
        );
      }
      currentDocs = await app.getCollData({ user, dbname, collname });
      currentDocs = Array.isArray(currentDocs) ? currentDocs : [];
    }

    // Processa cada stage do pipeline
    for (const stage of pipeline) {
      // $match → FilterPlugin (só memória)
      if (stage.$match && typeof app.matches === "function") {
        currentDocs = currentDocs.filter((doc) =>
          app.matches(doc, stage.$match)
        );
      }
      // $lookup → LookupPlugin (acessa banco)
      else if (stage.$lookup && typeof app.lookup === "function") {
        currentDocs = await app.lookup({
          user, // ✅ repassado
          dbname, // ✅ repassado
          docs: currentDocs,
          lookups: [stage.$lookup],
        });
      }
      // $populate → PopulatePlugin (acessa banco)
      else if (stage.$populate && typeof app.populate === "function") {
        currentDocs = await app.populate({
          user, // ✅ repassado
          dbname, // ✅ repassado
          docs: currentDocs,
          populates: [stage.$populate],
        });
      }
      // $project → ProjectPlugin (só memória)
      else if (stage.$project && typeof app.project === "function") {
        currentDocs = app.project({ docs: currentDocs, spec: stage.$project });
      }
      // $unwind → UnwindPlugin (só memória)
      else if (stage.$unwind && typeof app.unwind === "function") {
        const unwindOpts =
          typeof stage.$unwind === "string"
            ? { path: stage.$unwind }
            : { ...stage.$unwind };
        currentDocs = app.unwind({ docs: currentDocs, ...unwindOpts });
      }
      // $group → GroupPlugin (só memória, pois docs já carregados)
      else if (stage.$group && typeof app.group === "function") {
        currentDocs = await app.group({
          docs: currentDocs,
          groups: [stage.$group],
        });
      }
      // $sort → SortLimitPlugin (só memória)
      else if (stage.$sort && typeof app.sort === "function") {
        currentDocs = app.sort({ docs: currentDocs, sortSpec: stage.$sort });
      }
      // $limit → SortLimitPlugin (só memória)
      else if (stage.$limit && typeof app.limit === "function") {
        const n = Number(stage.$limit);
        currentDocs = app.limit({ docs: currentDocs, n });
      }
      // $skip → SortLimitPlugin (só memória)
      else if (stage.$skip && typeof app.skip === "function") {
        const n = Number(stage.$skip);
        currentDocs = app.skip({ docs: currentDocs, n });
      }
      // Stage não suportado
      else {
        const stageName =
          stage && typeof stage === "object"
            ? Object.keys(stage)[0]
            : String(stage);
        console.warn(`[AggregatePlugin] Stage não suportado: ${stageName}`);
      }
    }

    return currentDocs;
  };

  /**
   * Executa múltiplos pipelines em sequência.
   */
  const aggregateMany = async (pipelines = []) => {
    const results = [];
    for (const pipe of pipelines) {
      results.push(await aggregate(pipe));
    }
    return results;
  };

  
  return { aggregate, aggregateMany };
};
