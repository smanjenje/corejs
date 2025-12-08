// core/plugins/filters/FilterPlugin.js
// Plugin de filtragem com suporte a índice invertido e operadores avançados

module.exports = ({ app } = {}) => {
  if (!app) throw new Error("FilterPlugin: app obrigatório");

  // --------------------------------------------------
  // matches: motor completo de filtragem
  // --------------------------------------------------
  const getNestedValue = (obj, path) =>
    path.split(".").reduce((o, k) => (o ? o[k] : undefined), obj);

  const matches = (doc, criteria) => {
    if (!criteria || typeof criteria !== "object") return false;

    if (criteria.$or) {
      if (!Array.isArray(criteria.$or)) throw new Error("$or deve ser array");
      return criteria.$or.some((sub) => matches(doc, sub));
    }

    if (criteria.$and) {
      if (!Array.isArray(criteria.$and)) throw new Error("$and deve ser array");
      return criteria.$and.every((sub) => matches(doc, sub));
    }

    if (criteria.$not) return !matches(doc, criteria.$not);

    for (const [field, cond] of Object.entries(criteria)) {
      const val = getNestedValue(doc, field);

      if (typeof cond === "function") {
        if (!cond(val)) return false;
        continue;
      }

      if (cond === null || typeof cond !== "object") {
        if (val !== cond) return false;
        continue;
      }

      const isOp = (op) => op in cond;
      const isOperatorObj =
        isOp("$eq") ||
        isOp("$ne") ||
        isOp("$gt") ||
        isOp("$gte") ||
        isOp("$lt") ||
        isOp("$lte") ||
        isOp("$in") ||
        isOp("$nin") ||
        isOp("contains") ||
        isOp("$startsWith") ||
        isOp("$endsWith") ||
        isOp("$containsAny") ||
        isOp("$containsAll") ||
        isOp("$between") ||
        isOp("$regex");

      if (isOperatorObj) {
        if (isOp("$eq") && val !== cond.$eq) return false;
        if (isOp("$ne") && val === cond.$ne) return false;
        if (isOp("$gt") && !(val > cond.$gt)) return false;
        if (isOp("$gte") && !(val >= cond.$gte)) return false;
        if (isOp("$lt") && !(val < cond.$lt)) return false;
        if (isOp("$lte") && !(val <= cond.$lte)) return false;
        if (
          isOp("contains") &&
          (typeof val !== "string" || !val.includes(cond.contains))
        )
          return false;
        if (
          isOp("$in") &&
          (!Array.isArray(cond.$in) || !cond.$in.includes(val))
        )
          return false;
        if (isOp("$nin") && Array.isArray(cond.$nin) && cond.$nin.includes(val))
          return false;
        if (
          isOp("$startsWith") &&
          (typeof val !== "string" || !val.startsWith(cond.$startsWith))
        )
          return false;
        if (
          isOp("$endsWith") &&
          (typeof val !== "string" || !val.endsWith(cond.$endsWith))
        )
          return false;
        if (
          isOp("$containsAny") &&
          (typeof val !== "string" ||
            !Array.isArray(cond.$containsAny) ||
            !cond.$containsAny.some((s) => val.includes(s)))
        )
          return false;
        if (
          isOp("$containsAll") &&
          (typeof val !== "string" ||
            !Array.isArray(cond.$containsAll) ||
            !cond.$containsAll.every((s) => val.includes(s)))
        )
          return false;
        if (isOp("$between")) {
          const [min, max] = cond.$between || [];
          if (min == null || max == null) return false;
          const v = val instanceof Date ? val.getTime() : val;
          const a = min instanceof Date ? min.getTime() : min;
          const b = max instanceof Date ? max.getTime() : max;
          if (!(v >= a && v <= b)) return false;
        }
        if (isOp("$regex")) {
          if (typeof val !== "string") return false;
          const re =
            cond.$regex instanceof RegExp
              ? cond.$regex
              : new RegExp(cond.$regex, cond.$options || "");
          if (!re.test(val)) return false;
        }
        continue;
      }

      // Recursão para subdocumentos
      if (!matches(val, cond)) return false;
    }

    return true;
  };

  // --------------------------------------------------
  // Helpers
  // --------------------------------------------------
  // const getDocsByIndices = async ({ user, dbname, collname, indices }) => {
  //   if (!indices?.length) return [];
  //   const allDocs = await app.getCollData({ user, dbname, collname });
  //   if (!Array.isArray(allDocs)) return [];
  //   return indices.map((i) => allDocs[i]).filter((d) => d != null);
  // };

  /**
   * Busca documentos de uma coleção com base em seus índices (posições no array).
   * @param {Object} params
   * @param {string} params.user
   * @param {string} params.dbname
   * @param {string} params.collname
   * @param {number[]} params.indices - Array de índices (ex: [0, 1, 2])
   * @returns {Promise<Array>} Array de documentos correspondentes
   */
  const getDocsByIndices = async ({ user, dbname, collname, indices }) => {
    if (!app?.getCollData) {
      throw new Error("getDocsByIndices: app.getCollData não disponível");
    }

    if (!Array.isArray(indices) || indices.length === 0) {
      return [];
    }

    // Remove duplicatas e ordena (opcional, mas limpo)
    const uniqueIndices = [...new Set(indices)];

    // Carrega todos os documentos da coleção
    const allDocs = await app.getCollData({ user, dbname, collname });
    if (!Array.isArray(allDocs)) {
      return [];
    }

    // Mapeia os índices para os documentos reais
    return uniqueIndices
      .map((idx) => {
        if (typeof idx !== "number" || idx < 0 || idx >= allDocs.length) {
          return null;
        }
        return allDocs[idx];
      })
      .filter((doc) => doc != null); // Remove índices inválidos
  };

  // Extrai apenas filtros de igualdade direta com valores primitivos
  const extractIndexableFilters = (criteria) => {
    if (!criteria || typeof criteria !== "object") {
      return { indexable: {}, rest: criteria };
    }

    // Desistir se houver operadores lógicos (não indexáveis)
    if (criteria.$or || criteria.$and || criteria.$not) {
      return { indexable: {}, rest: criteria };
    }

    const indexable = {};
    const rest = {};

    for (const [field, value] of Object.entries(criteria)) {
      // Só aceita valores primitivos (string, number, boolean, null)
      if (
        value === null ||
        ["string", "number", "boolean"].includes(typeof value)
      ) {
        indexable[field] = value;
      } else {
        // Tudo o resto (objetos, arrays, operadores) vai para "rest"
        rest[field] = value;
      }
    }

    return { indexable, rest };
  };

  // --------------------------------------------------
  // findMany otimizado com índice
  // --------------------------------------------------
  // const findMany = async ({ user, dbname, collname, docs, queries }) => {
  //   if (docs !== undefined) {
  //     candidateDocs = Array.isArray(docs) ? docs : [];
  //   } else {
  //     // Só carrega da coleção se não houver docs
  //     const allDocs = await app.getCollData({ user, dbname, collname });
  //     candidateDocs = Array.isArray(allDocs) ? allDocs : [];
  //   }

  //   const criteriaList = Array.isArray(queries) ? queries : [queries];
  //   const indexMap = await app.getCollDocsMap({ user, dbname, collname });

  //   const results = [];

  //   for (const criteria of criteriaList) {
  //     const { indexable, rest } = extractIndexableFilters(criteria);

  //     let candidateIndices = null;

  //     // Usa o índice apenas se houver filtros indexáveis
  //     if (Object.keys(indexable).length > 0) {
  //       candidateIndices = null;

  //       for (const [field, value] of Object.entries(indexable)) {
  //         const key = String(value);
  //         const indicesForField = indexMap[field]?.[key] || [];

  //         if (indicesForField.length === 0) {
  //           candidateIndices = new Set();
  //           break;
  //         }

  //         const currentSet = new Set(indicesForField);
  //         if (candidateIndices === null) {
  //           candidateIndices = currentSet;
  //         } else {
  //           candidateIndices = new Set(
  //             [...candidateIndices].filter((i) => currentSet.has(i))
  //           );
  //           if (candidateIndices.size === 0) break;
  //         }
  //       }

  //       if (candidateIndices?.size === 0) {
  //         continue; // nenhum doc atende aos filtros indexáveis
  //       }
  //     }

  //     // Carrega documentos candidatos
  //     let candidateDocs;
  //     if (candidateIndices && candidateIndices.size > 0) {
  //       candidateDocs = await getDocsByIndices({
  //         user,
  //         dbname,
  //         collname,
  //         indices: [...candidateIndices],
  //       });
  //     } else {
  //       // Fallback: carrega todos os documentos
  //       const allDocs = await app.getCollData({ user, dbname, collname });
  //       candidateDocs = Array.isArray(allDocs) ? allDocs : [];
  //     }

  //     // Aplica o critério completo com matches
  //     const finalCriteria =
  //       Object.keys(rest).length > 0 ? { ...indexable, ...rest } : criteria;

  //     for (const doc of candidateDocs) {
  //       if (matches(doc, finalCriteria)) {
  //         results.push(doc);
  //       }
  //     }
  //   }

  //   return results;
  // };

  const findMany = async ({ user, dbname, collname, docs, queries }) => {
    // Validação de queries
    const criteriaList = Array.isArray(queries) ? queries : [queries];
    if (criteriaList.length === 0) {
      return docs ?? (await app.getCollData({ user, dbname, collname })) ?? [];
    }

    // Caso 1: documentos fornecidos → filtragem simples com matches
    if (docs !== undefined) {
      const inputDocs = Array.isArray(docs) ? docs : [];
      return inputDocs.filter((doc) =>
        criteriaList.some((crit) => matches(doc, crit))
      );
    }

    // Caso 2: documentos NÃO fornecidos → usar índice + coleção completa
    const allDocs = await app.getCollData({ user, dbname, collname });
    const docsArray = Array.isArray(allDocs) ? allDocs : [];

    // Se não há documentos, retorna vazio
    if (docsArray.length === 0) return [];

    // Carrega índice
    const indexMap = await app.getCollDocsMap({ user, dbname, collname });

    const results = [];
    for (const criteria of criteriaList) {
      const { indexable, rest } = extractIndexableFilters(criteria);
      let candidateIndices = null;

      // Usa índice apenas se houver filtros indexáveis
      if (Object.keys(indexable).length > 0) {
        candidateIndices = null;
        for (const [field, value] of Object.entries(indexable)) {
          const key = String(value);
          const indicesForField = indexMap[field]?.[key] || [];
          if (indicesForField.length === 0) {
            candidateIndices = new Set();
            break;
          }
          const currentSet = new Set(indicesForField);
          if (candidateIndices === null) {
            candidateIndices = currentSet;
          } else {
            candidateIndices = new Set(
              [...candidateIndices].filter((i) => currentSet.has(i))
            );
            if (candidateIndices.size === 0) break;
          }
        }
        if (candidateIndices?.size === 0) continue;
      }

      // Obtém documentos candidatos
      let candidateDocs;
      if (candidateIndices && candidateIndices.size > 0) {
        // Usa índice para obter só os necessários
        candidateDocs = await getDocsByIndices({
          user,
          dbname,
          collname,
          indices: [...candidateIndices],
        });
      } else {
        // Sem índice útil → usa todos
        candidateDocs = docsArray;
      }

      // Aplica critério completo
      const finalCriteria =
        Object.keys(rest).length > 0 ? { ...indexable, ...rest } : criteria;

      for (const doc of candidateDocs) {
        if (matches(doc, finalCriteria)) {
          results.push(doc);
        }
      }
    }

    return results;
  };

  // --------------------------------------------------
  // findOne
  // --------------------------------------------------
  const findOne = async ({ user, dbname, collname, queries }) => {
    const results = await findMany({ user, dbname, collname, queries });
    return results.length > 0 ? results[0] : null;
  };

  return { matches, findMany, findOne, getDocsByIndices };
};
