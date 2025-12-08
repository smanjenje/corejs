Perfeito! Vamos simplificar ao máximo: **um único método** que:

1. **Reconstrói o índice de todas as coleções do banco**
2. **Salva automaticamente no disco**
3. **Retorna o índice completo** (para uso imediato, se necessário)

Vamos chamá-lo de **`rebuildIndex`** (o nome mais semântico) e **remover `buildDocsIndexs` da API pública**.

---

### ✅ `core/plugins/DocsIndexPlugin.js` — versão final com **um único método**

```js
// core/plugins/DocsIndexPlugin.js
// Índice invertido completo — um único método para reconstruir tudo.

module.exports = ({ app } = {}) => {
  if (!app) throw new Error("DocsIndexPlugin: app obrigatório");

  // ========== Helpers ==========
  const valueKey = (v) => {
    if (v === null) return "null";
    if (v === undefined) return "undefined";
    if (v instanceof Date) return v.toISOString();
    if (typeof v === "object") {
      try { return JSON.stringify(v); } catch { return String(v); }
    }
    return String(v);
  };

  const normalizeArray = (item) => (Array.isArray(item) ? item : [item]);

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
      for (const item of node) walkDoc(item, cb, path);
      return;
    }
    for (const key of Object.keys(node)) {
      const next = path ? `${path}.${key}` : key;
      walkDoc(node[key], cb, next);
    }
  };

  const addIndexEntry = (map, coll, field, key, idx) => {
    const collMap = (map[coll] ??= {});
    const fieldMap = (collMap[field] ??= {});
    const arr = (fieldMap[key] ??= []);
    if (!arr.includes(idx)) arr.push(idx);
  };

  // ========== Acesso a dados ==========
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

  const resolveCollections = async ({ user, dbname }) => {
    if (app.listColls) {
      const r = await app.listColls({ user, dbname });
      if (Array.isArray(r)) return r;
      if (Array.isArray(r?.collections)) return r.collections;
    }
    if (app.getDB) {
      const db = await app.getDB({ user, dbname });
      const c = db?.collections;
      if (Array.isArray(c)) return c.map(x => x.collname);
      if (typeof c === "object") return Object.keys(c);
    }
    if (app.getDBMeta) {
      const m = await app.getDBMeta({ user, dbname });
      return (m?.collections || []).map(x => x.collname);
    }
    return [];
  };

  // ========== FS ==========
  const getFile = async ({ user, dbname }) => {
    if (!app.getFullPath) throw new Error("getFullPath não disponível");
    return app.getFullPath(user, dbname, "docsMapIndex.json");
  };

  const readMap = async ({ user, dbname }) => {
    const file = await getFile({ user, dbname });
    return (await app.readJSON(file, {})) || {};
  };

  const writeMap = async ({ user, dbname }, map) => {
    const file = await getFile({ user, dbname });
    return app.writeJSON(file, map);
  };

  // ============================================================
  // ✅ ÚNICO MÉTODO PÚBLICO: reconstrói e salva o índice completo
  // ============================================================
  const rebuildIndex = async ({ user, dbname }) => {
    if (!user || !dbname) {
      throw new Error("rebuildIndex requer 'user' e 'dbname'");
    }

    // 1. Descobre todas as coleções
    const collections = await resolveCollections({ user, dbname });
    const fullIndex = {};

    // 2. Para cada coleção, constrói seu índice
    for (const collname of collections) {
      const docs = await getDocs({ user, dbname, collname });
      fullIndex[collname] = {}; // inicializa

      docs.forEach((doc, idx) => {
        try {
          walkDoc(doc, (field, val) => {
            for (const v of normalizeArray(val)) {
              const key = valueKey(v);
              addIndexEntry(fullIndex, collname, field, key, idx);
            }
          });
        } catch (err) {
          console.error(`[rebuildIndex] erro no doc _id=${doc?._id}`, err);
        }
      });
    }

    // 3. Salva no disco
    await writeMap({ user, dbname }, fullIndex);

    // 4. Retorna o índice completo (útil para testes ou uso imediato)
    return fullIndex;
  };

  // ============================================================
  // Consultas (não alteradas)
  // ============================================================
  const getCollDocsMap = async ({ user, dbname, collname }) => {
    if (!user || !dbname || !collname) {
      throw new Error("user, dbname e collname são obrigatórios");
    }
    const fullMap = await readMap({ user, dbname });
    return fullMap[collname] || {};
  };

  const queryByIndex = async ({ user, dbname, collname, field, value }) => {
    const map = await readMap({ user, dbname });
    const fieldMap = map[collname]?.[field] || {};
    const keys = normalizeArray(value).map(valueKey);
    const result = new Set();
    for (const k of keys) {
      const arr = fieldMap[k];
      if (Array.isArray(arr)) arr.forEach(i => result.add(i));
    }
    return [...result];
  };

  const queryDocs = async ({ user, dbname, collname, indices }) => {
    const docs = await getDocs({ user, dbname, collname });
    return normalizeArray(indices).map(i => docs[i]).filter(Boolean);
  };

  // ============================================================
  // API Pública: só 1 método de construção!
  // ============================================================
  return {
    // Método único para reconstruir tudo
    rebuildIndex,

    // Métodos de leitura/consulta
    readDocsMap: readMap,
    getCollDocsMap,
    queryByIndex,
    queryDocs,
  };
};
```

---

### ✅ Como usar

#### 1. **Reconstruir todo o índice do banco** (e salvar no disco):

```js
await app.rebuildIndex({ user: "admin", dbname: "meubanco" });
```

#### 2. **Obter o índice de uma coleção** (depois de reconstruído):

```js
const index = await app.getCollDocsMap({ user: "admin", dbname: "meubanco", collname: "professores" });
```

#### 3. **Resultado salvo em `docsMapIndex.json`**:

```json
{
  "professores": { "_id": { "1": [0] }, ... },
  "disciplinas": { "professorId": { "1": [0,1] }, ... }
}
```

→ **Exatamente o formato que você quer!**

---

### ✅ Benefícios dessa abordagem

- ✅ **Um único ponto de entrada** para atualizar o índice
- ✅ **Sem risco de inconsistência** (sempre reconstrói tudo do zero)
- ✅ **Sem métodos redundantes** (`buildDocsIndexs` removido)
- ✅ **Simples, seguro e previsível**

Pronto! Agora você tem **um único método (`rebuildIndex`)** que faz tudo o que precisa. 🚀

