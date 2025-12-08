// core/plugins/DocsIndexPlugin.js
// Índice de documentos baseado em valores puros, sem prefixos.

module.exports = ({ app } = {}) => {
  if (!app) throw new Error("DocsIndexPlugin: app obrigatório");

  if (app.pluginsNames && typeof app.pluginsNames === "object") {
    app.pluginsNames.DocsIndexPlugin = true;
  }

  // ============================================================
  // Helpers
  // ============================================================

  // Converte valores para chave simples de string
  const valueKey = (v) => {
    if (v === null) return "null";
    if (v === undefined) return "undefined";

    if (v instanceof Date) return v.toISOString();

    if (typeof v === "object") {
      try {
        return JSON.stringify(v);
      } catch {
        return String(v);
      }
    }

    return String(v);
  };

  const normalizeArray = (item) => (Array.isArray(item) ? item : [item]);

  // Caminhamento recursivo
  const walkDoc = (node, cb, path = "") => {
    if (node === null || node === undefined) {
      cb(path, node);
      return;
    }

    if (typeof node !== "object" || node instanceof Date) {
      cb(path, node);
      return;
    }

    if (Array.isArray(node)) {
      // mantém o mesmo path
      for (const item of node) walkDoc(item, cb, path);
      return;
    }

    // objeto
    for (const key of Object.keys(node)) {
      const next = path ? `${path}.${key}` : key;
      walkDoc(node[key], cb, next);
    }
  };

  // ============================================================
  // Estrutura do índice
  //
  // map = {
  //   professores: {
  //     nome: {
  //        "Severino": [0, 3]
  //     },
  //     idade: {
  //        "20": [0],
  //        "30": [1]
  //     }
  //   }
  // }
  // ============================================================

  const addIndexEntry = (docsMap, coll, field, key, idx) => {
    const collMap = (docsMap[coll] ??= {});
    const fieldMap = (collMap[field] ??= {});
    const arr = (fieldMap[key] ??= []);

    if (!arr.includes(idx)) arr.push(idx);
  };

  const removeIndexEntry = (docsMap, coll, field, key, idx) => {
    const fieldMap = docsMap[coll]?.[field];
    if (!fieldMap) return;

    const arr = fieldMap[key];
    if (!arr) return;

    const filtered = arr.filter((i) => i !== idx);

    if (filtered.length) {
      fieldMap[key] = filtered;
      return;
    }

    delete fieldMap[key];
    if (!Object.keys(fieldMap).length) delete docsMap[coll][field];
    if (!Object.keys(docsMap[coll]).length) delete docsMap[coll];
  };

  // ============================================================
  // Indexar documento inteiro
  // ============================================================

  const indexDocument = (map, coll, doc, idx) => {
    walkDoc(doc, (field, val) => {
      // Arrays: cada valor é indexado separadamente
      for (const v of normalizeArray(val)) {
        const key = valueKey(v);
        addIndexEntry(map, coll, field, key, idx);
      }
    });
  };

  // ============================================================
  // Remover documento inteiro do índice
  // ============================================================

  const unindexDocument = (map, coll, doc, idx) => {
    walkDoc(doc, (field, val) => {
      for (const v of normalizeArray(val)) {
        const key = valueKey(v);
        removeIndexEntry(map, coll, field, key, idx);
      }
    });
  };

  // ============================================================
  // FS Helpers
  // ============================================================

  const getFile = async ({ user, dbname }) => {
    if (!app.getFullPath)
      throw new Error("FSPlugin: getFullPath não disponível");
    return app.getFullPath(user, dbname, "docsMapIndex.json");
  };

  const readMap = async (ctx) => {
    const file = await getFile(ctx);
    const data = await app.readJSON(file, {});
    return data || {};
  };

  const writeMap = async (ctx, map) => {
    const file = await getFile(ctx);
    return app.writeJSON(file, map);
  };

  // ============================================================
  // Get docs de uma collection
  // ============================================================

  const getDocs = async ({ user, dbname, collname }) => {
    if (app.getCollData) {
      const d = await app.getCollData({ user, dbname, collname });
      return Array.isArray(d) ? d : [];
    }

    if (app.readColl) {
      const r = await app.readColl({ user, dbname, collname });
      return Array.isArray(r?.data) ? r.data : [];
    }

    return [];
  };

  // ============================================================
  // Reconstruir índice de uma collection (formato novo)
  // ============================================================

  const buildDocsIndexs = async ({ user, dbname, collname }) => {
    const map = await readMap({ user, dbname });
    const docs = await getDocs({ user, dbname, collname });
    const collInMap = Object.keys(map);

  

    docs.forEach((doc, idx) => {
      try {
        indexDocument(map, collname, doc, idx);
      } catch (err) {
        console.error(
          `[buildDocsIndexs] erro ao indexar doc _id=${doc?._id}`,
          err
        );
      }
    });

    return map;
  };

  // ============================================================
  // Descobrir collections disponíveis
  // ============================================================

  const resolveCollections = async ({ user, dbname }) => {
    if (app.listColls) {
      const r = await app.listColls({ user, dbname });
      if (Array.isArray(r)) return r;
      if (Array.isArray(r?.collections)) return r.collections;
    }

    if (app.getDB) {
      const r = await app.getDB({ user, dbname });
      const c = r?.collections;
      if (Array.isArray(c)) return c.map((x) => x.collname);
      if (typeof c === "object") return Object.keys(c);
    }

    if (app.getDBMeta) {
      const m = await app.getDBMeta({ user, dbname });
      return (m?.collections || []).map((x) => x.collname);
    }

    return [];
  };

  // ============================================================
  // REBUILD COMPLETO — formato final com valores puros
  // ============================================================

  const rebuildIndex = async ({ user, dbname, collname }) => {
    const collections = collname
      ? [collname]
      : await resolveCollections({ user, dbname });

    const masterMap = {};

    for (const col of collections) {
      const subMap = await buildDocsIndexs({ user, dbname, collname: col });
      masterMap[col] = subMap[col]; // incorpora direto
    }

    await writeMap({ user, dbname }, masterMap);
    return masterMap;
  };

  // ============================================================
  // Query por índice
  // ============================================================

  const queryByIndex = async ({ user, dbname, collname, field, value }) => {
    const map = await readMap({ user, dbname });
    const col = map[collname] || {};
    const fieldMap = col[field] || {};

    const keys = normalizeArray(value).map(valueKey);
    const result = new Set();

    for (const k of keys) {
      const arr = fieldMap[k];
      if (Array.isArray(arr)) arr.forEach((idx) => result.add(idx));
    }

    return [...result];
  };

  const queryDocs = async ({ user, dbname, collname, indices }) => {
    const docs = await getDocs({ user, dbname, collname });
    return normalizeArray(indices)
      .map((i) => docs[i])
      .filter(Boolean);
  };
  /**
   * Retorna o mapa de documentos (índice invertido) para uma coleção específica
   * @param {Object} params
   * @param {string} params.user
   * @param {string} params.dbname
   * @param {string} params.collname
   * @returns {Promise<Object>} mapa de campos → valores → [índices]
   */
  const getCollDocsMap = async ({ user, dbname, collname } = {}) => {
    if (!user) throw new Error("user não especificado");
    if (!dbname) throw new Error("dbname não especificado");
    if (!collname) throw new Error("collname não especificado");

    const fullMap = await readMap({ user, dbname });
    return fullMap[collname] || {};
  };

  // ============================================================
  // API Pública
  // ============================================================

  return {
    readDocsMap: readMap,
    writeDocsMap: writeMap,

    indexDocument,
    unindexDocument,

    rebuildIndex,
    buildDocsIndexs,

    queryByIndex,
    queryDocs,
    getCollDocsMap,
  };
};
