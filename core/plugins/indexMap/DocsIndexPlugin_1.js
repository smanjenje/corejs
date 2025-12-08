// core/plugins/DocsIndexPlugin.js
// DocsIndexPlugin PRO (versão otimizada)
// Indexa documentos por campos, nested + arrays, usando somente FSPlugin + CollPlugin.

module.exports = ({ app } = {}) => {
  if (!app) throw new Error("DocsIndexPlugin: app obrigatório");
  if (app.pluginsNames && typeof app.pluginsNames === "object") {
    app.pluginsNames.DocsIndexPlugin = true;
  }

  // -------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------

  const normalizeArray = (item) => (Array.isArray(item) ? item : [item]);

  // Caminhamento recursivo otimizado
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
      // Arrays indexados na mesma key/path
      for (const item of node) walkDoc(item, cb, path);
      return;
    }

    // Object literal
    for (const key of Object.keys(node)) {
      const next = path ? `${path}.${key}` : key;
      walkDoc(node[key], cb, next);
    }
  };

  // Converte valor para chave
  const valueKey = (v) => {
    if (v === null) return "__null__";
    if (v === undefined) return "__undef__";
    if (v instanceof Date) return `__date:${v.toISOString()}`;

    const t = typeof v;

    if (t === "object") {
      try {
        return `__obj:${JSON.stringify(v)}`;
      } catch {
        return `__obj:${String(v)}`;
      }
    }

    if (t === "number" && Number.isNaN(v)) return "__nan__";
    if (t === "number" && !Number.isFinite(v)) return `__inf:${v}`;

    return `${typeof v}:${String(v)}`;
  };

  // Insert
  const addIndexEntry = (docsMap, coll, field, key, idx) => {
    const collMap = (docsMap[coll] ??= {});
    const fieldMap = (collMap[field] ??= {});
    const arr = (fieldMap[key] ??= []);

    if (!arr.includes(idx)) arr.push(idx);
  };

  // Remove
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

  // Indexação de um documento inteiro
  const indexDocument = (map, coll, doc, idx) => {
    walkDoc(doc, (field, val) => {
      for (const v of normalizeArray(val))
        addIndexEntry(map, coll, field, valueKey(v), idx);
    });
  };

  // Desindexação completa
  const unindexDocument = (map, coll, doc, idx) => {
    walkDoc(doc, (field, val) => {
      for (const v of normalizeArray(val))
        removeIndexEntry(map, coll, field, valueKey(v), idx);
    });
  };

  // -------------------------------------------------------------
  // FS Helpers
  // -------------------------------------------------------------

  const getFile = async ({ user, dbname }) => {
    if (!user) throw new Error("user não especificado");
    if (!dbname) throw new Error("dbname não especificado");

    if (typeof app.getFullPath !== "function") {
      throw new Error("FSPlugin: getFullPath não disponível");
    }
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

  // -------------------------------------------------------------
  // Get docs da coleção (somente APIs oficiais)
  // -------------------------------------------------------------

  const getDocs = async ({ user, dbname, collname }) => {
    // getCollData direto
    if (typeof app.getCollData === "function") {
      const d = await app.getCollData({ user, dbname, collname });
      return Array.isArray(d) ? d : [];
    }

    // fallback: readColl
    if (typeof app.readColl === "function") {
      const r = await app.readColl({ user, dbname, collname });
      const d = r?.data;
      return Array.isArray(d) ? d : [];
    }

    return [];
  };

  /**
 * buildDocsIndexs
 * Reconstrói todo o índice da collection especificada.
 *
 * @param {Object} params
 * @param {String} params.user
 * @param {String} params.dbname
 * @param {String} params.collname
 *
 * @returns {Object} Mapa de índices da collection
 */
const buildDocsIndexs = async ({ user, dbname, collname }) => {
 
  if (!indexDocument) {
    throw new Error("buildDocsIndexs requer indexDocument");
  }

  // Carrega todos os documentos da collection
  const docs = await getDocs({ user, dbname, collname });

  // Estrutura inicial do índice
  const map = {
    [collname]: {}
  };

  // Índice interno da collection
  const colIndex = map[collname];

  // Para cada documento, aplica o indexador padrão
  docs.forEach((doc, pos) => {
    try {
      indexDocument(map, collname, doc, pos);
    } catch (err) {
      console.error(
        `[buildDocsIndexs] Erro ao indexar doc _id=${doc?._id} da collection ${collname}:`,
        err
      );
    }
  });

  return map;
};


  // -------------------------------------------------------------
  // Detecta lista de coleções de forma segura e priorizada
  // -------------------------------------------------------------
  const resolveCollections = async ({ user, dbname }) => {
    // 1) listColls
    if (typeof app.listColls === "function") {
      const r = await app.listColls({ user, dbname });
      if (Array.isArray(r)) return r;
      if (Array.isArray(r?.collections)) return r.collections;
    }

    // 2) getDB
    if (typeof app.getDB === "function") {
      const r = await app.getDB({ user, dbname });
      const c = r?.collections;
      if (Array.isArray(c)) return c.map((x) => x.collname).filter(Boolean);
      if (typeof c === "object") return Object.keys(c);
    }

    // 3) getDBMeta
    if (typeof app.getDBMeta === "function") {
      const m = await app.getDBMeta({ user, dbname });
      const arr = m?.collections || [];
      return arr.map((x) => x.collname).filter(Boolean);
    }

    return [];
  };

  // -------------------------------------------------------------
  // REBUILD COMPLETO
  // -------------------------------------------------------------
  const rebuildIndex = async ({ user, dbname, collname }) => {
    const map = {};
    const collections = collname
      ? [collname]
      : await resolveCollections({ user, dbname });

    for (const col of collections) {
      const docs = await getDocs({ user, dbname, collname: col });
      map[col] = {};
      docs.forEach((doc, i) => indexDocument(map, col, doc, i));
    }

    await writeMap({ user, dbname }, map);
    return map;
  };

  // -------------------------------------------------------------
  // Indexar 1 campo de 1 coleção
  // -------------------------------------------------------------
  const getValuesForField = (doc, path) => {
    const parts = String(path).split(".");
    let nodes = [doc];

    for (const p of parts) {
      const next = [];
      for (const n of nodes) {
        if (!n) continue;
        const v = n[p];
        if (Array.isArray(v)) next.push(...v);
        else next.push(v);
      }
      nodes = next;
    }

    return nodes.filter((v) => v !== undefined);
  };

  const buildIndexForField = async ({ user, dbname, collname, field }) => {
    const map = await readMap({ user, dbname });
    const docs = await getDocs({ user, dbname, collname });

    const collMap = (map[collname] ??= {});
    collMap[field] = {}; // sobrescreve apenas o campo

    docs.forEach((doc, i) => {
      const vals = getValuesForField(doc, field);
      for (const v of vals) addIndexEntry(map, collname, field, valueKey(v), i);
    });

    await writeMap({ user, dbname }, map);
    return collMap;
  };

  // -------------------------------------------------------------
  // QUERY POR ÍNDICE
  // -------------------------------------------------------------
  const queryByIndex = async ({ user, dbname, collname, field, value }) => {
    const map = await readMap({ user, dbname });
    const fieldMap = map[collname]?.[field] || {};
    const arrVals = normalizeArray(value);

    const result = new Set();

    for (const v of arrVals) {
      const arr = fieldMap[valueKey(v)];
      if (Array.isArray(arr)) {
        for (const idx of arr) result.add(idx);
      }
    }

    return [...result];
  };

  // -------------------------------------------------------------
  // Retorna documentos completos dadas posições
  // -------------------------------------------------------------
  const queryDocs = async ({ user, dbname, collname, indices }) => {
    const docs = await getDocs({ user, dbname, collname });
    return normalizeArray(indices)
      .map((i) => docs[i])
      .filter(Boolean);
  };

  // API pública
  return {
    readDocsMap: readMap,
    writeDocsMap: writeMap,
    rebuildIndex,
    buildIndexForField,
    indexDocument,
    unindexDocument,
    queryByIndex,
    queryDocs,
    buildDocsIndexs,
  };
};
