// core/plugins/DocPlugin.js
// Plugin para operações CRUD em documentos (insert/update/delete/get/list)
// Usa apenas métodos expostos pelo app (CollPlugin, CollMapIndexPlugin, DocsIndexPlugin, UtilsPlugin, etc.)
// Não usa app.runFunc internamente. Registra hooks via app.addHooks quando disponível.

module.exports = ({ app } = {}) => {
  if (!app) throw new Error("DocPlugin: app obrigatório");
  if (app.pluginsNames && typeof app.pluginsNames === "object") {
    app.pluginsNames.DocPlugin = true;
  }

  // registra hooks para manter índice atualizado (se addHooks disponível)
  try {
    if (typeof app.addHooks === "function") {
      app.addHooks([
        {
          tipo: "after",
          fnName: "insertDoc",
          callback: { fn: "rebuildIndex" },
        },
        {
          tipo: "after",
          fnName: "updateDoc",
          callback: { fn: "rebuildIndex" },
        },
        {
          tipo: "after",
          fnName: "deleteDoc",
          callback: { fn: "rebuildIndex" },
        },
      ]);
    }
  } catch (e) {
    // não bloquear inicialização caso addHooks não exista
  }

  const ensureParams = (p = {}, fields = []) => {
    for (const f of fields) {
      if (p[f] === undefined || p[f] === null) {
        throw new Error(`Parâmetro obrigatório faltando: ${f}`);
      }
    }
  };

  const normalizeArray = (v) => (Array.isArray(v) ? v : [v]);

  return {
    /**
     * INSERT
     * - aceita doc único ou array de docs
     * - usa app.prepareDocs se disponível (para validação/auto-values)
     * - retorna documento inserido (ou array) com estrutura { status,msg,doc|docs }
     */
    insertDoc: async ({ user, dbname, collname, doc } = {}) => {
      try {
        ensureParams({ user, dbname, collname, doc }, [
          "user",
          "dbname",
          "collname",
          "doc",
        ]);

        const docs = normalizeArray(doc).filter(
          (d) => d && typeof d === "object"
        );
        if (!docs.length)
          return {
            status: false,
            error: "Nenhum documento válido para inserir",
          };

        // obtém dados atuais
        if (typeof app.getCollData !== "function") {
          return {
            status: false,
            error: "Função app.getCollData não disponível",
          };
        }
        // const data = Array.isArray(
        //   await app.getCollData({ user, dbname, collname })
        // )
        //   ? await app.getCollData({ user, dbname, collname })
        //   : [];
        const rawData = await app.getCollData({ user, dbname, collname });
        const data = Array.isArray(rawData) ? rawData : [];

        // preparação/validação dos documentos antes de inserir
        let preparedDocs = docs;
        if (typeof app.prepareDocs === "function") {
          const res = await app.prepareDocs({
            user,
            dbname,
            collname,
            documents: docs,
            operation: "create",
          });
          // admitimos que prepareDocs retorne array ou { documents: [...] } ou { status:false, error }
          if (res && res.status === false)
            return { status: false, error: res.error || res.msg };
          if (Array.isArray(res)) preparedDocs = res;
          else if (res && Array.isArray(res.documents))
            preparedDocs = res.documents;
        } else {
          // se não houver prepareDocs, podemos aplicar sanitize se disponível
          if (typeof app.sanitizeObject === "function") {
            preparedDocs = preparedDocs.map((d) => app.sanitizeObject(d));
          }
        }

        // adiciona documentos ao array e salva
        data.push(...preparedDocs);
        if (typeof app.saveCollData !== "function") {
          return {
            status: false,
            error: "Função app.saveCollData não disponível",
          };
        }
        await app.saveCollData({ user, dbname, collname, data });

        return {
          status: true,
          docs: Array.isArray(doc) ? preparedDocs : preparedDocs[0],
        };
      } catch (err) {
        return { status: false, error: err.message || String(err) };
      }
    },

    /**
     * UPDATE DOC(S) usando findMany
     * - queries: array de query objects ou single query (findMany must be present)
     * - updates: object or array of patch objects
     * - retorna { status, updated:[], errors:[] }
     */
    updateDoc: async ({ user, dbname, collname, queries, updates } = {}) => {
      try {
        ensureParams({ user, dbname, collname, queries, updates }, [
          "user",
          "dbname",
          "collname",
          "queries",
          "updates",
        ]);

        if (typeof app.findMany !== "function") {
          return { status: false, error: "Função app.findMany não disponível" };
        }
        if (
          typeof app.getCollData !== "function" ||
          typeof app.saveCollData !== "function"
        ) {
          return {
            status: false,
            error: "Funções de leitura/escrita de collection não disponíveis",
          };
        }
        if (typeof app.setNestedValue !== "function") {
          return {
            status: false,
            error: "Função app.setNestedValue não disponível",
          };
        }

        const rawData = await app.getCollData({ user, dbname, collname });
        const data = Array.isArray(rawData) ? rawData : [];
        const matches = await app.findMany({ user, dbname, collname, queries });
        if (!matches || matches.length === 0)
          return { status: true, updated: [], errors: [] };

        const updateArray = normalizeArray(updates);
        const toUpdate = matches.map((doc) => {
          const copy = { ...doc };
          for (const upd of updateArray) {
            for (const [path, value] of Object.entries(upd)) {
              app.setNestedValue(copy, path, value);
            }
          }
          return copy;
        });

        // prepara docs se função existir
        let preparedDocs = toUpdate;
        if (typeof app.prepareDocs === "function") {
          const res = await app.prepareDocs({
            user,
            dbname,
            collname,
            documents: toUpdate,
            operation: "update",
          });
          if (res && res.status === false)
            return { status: false, error: res.error || res.msg };
          if (Array.isArray(res)) preparedDocs = res;
          else if (res && Array.isArray(res.documents))
            preparedDocs = res.documents;
        }

        // substitui no array original
        for (const doc of preparedDocs) {
          const idx = data.findIndex((d) => String(d._id) === String(doc._id));
          if (idx !== -1) data[idx] = doc;
        }

        await app.saveCollData({ user, dbname, collname, data });

        return { status: true, updated: preparedDocs, errors: [] };
      } catch (err) {
        return { status: false, error: err.message || String(err) };
      }
    },

    /**
     * DELETE DOC(S) usando findMany
     * - queries required
     * - retorna { status, deleted: [ids], missing: [] }
     */
    deleteDoc: async ({ user, dbname, collname, queries } = {}) => {
      try {
        ensureParams({ user, dbname, collname, queries }, [
          "user",
          "dbname",
          "collname",
          "queries",
        ]);

        if (typeof app.findMany !== "function") {
          return { status: false, error: "Função app.findMany não disponível" };
        }
        if (
          typeof app.getCollData !== "function" ||
          typeof app.saveCollData !== "function"
        ) {
          return {
            status: false,
            error: "Funções de leitura/escrita de collection não disponíveis",
          };
        }

        const rawData = await app.getCollData({ user, dbname, collname });
        const data = Array.isArray(rawData) ? rawData : [];
        const matches = await app.findMany({ user, dbname, collname, queries });

        if (!matches || matches.length === 0)
          return { status: true, deleted: [], missing: [] };

        const idsToDelete = matches.map((d) => d._id);
        const remaining = data.filter((d) => !idsToDelete.includes(d._id));

        await app.saveCollData({ user, dbname, collname, data: remaining });

        return { status: true, deleted: idsToDelete, missing: [] };
      } catch (err) {
        return { status: false, error: err.message || String(err) };
      }
    },

    /**
     * GET DOC using findMany (returns first match or null)
     */
    getDoc: async ({ user, dbname, collname, queries } = {}) => {
      try {
        ensureParams({ user, dbname, collname, queries }, [
          "user",
          "dbname",
          "collname",
          "queries",
        ]);
        if (typeof app.findMany !== "function") {
          throw new Error("Função app.findMany não disponível");
        }
        let matches = await app.findMany({ user, dbname, collname, queries });

        return matches && matches.length ? matches[0] : null;
      } catch (err) {
        return { status: false, error: err.message || String(err) };
      }
    },
    /**
     * GET DOC using findMany (returns first match or null)
     */
    getDocs: async ({ user, dbname, collname, queries } = {}) => {
      try {
        ensureParams({ user, dbname, collname, queries }, [
          "user",
          "dbname",
          "collname",
          "queries",
        ]);
        if (typeof app.findMany !== "function") {
          throw new Error("Função app.findMany não disponível");
        }
        let matches = await app.findMany({ user, dbname, collname, queries });

        return matches && matches.length ? matches[0] : null;
      } catch (err) {
        return { status: false, error: err.message || String(err) };
      }
    },

    /**
     * LIST DOCS (retorna todos)
     */
    listDocs: async ({ user, dbname, collname } = {}) => {
      try {
        ensureParams({ user, dbname, collname }, [
          "user",
          "dbname",
          "collname",
        ]);
        if (typeof app.getCollData !== "function") {
          return {
            status: false,
            error: "Função app.getCollData não disponível",
          };
        }
        const rawData = await app.getCollData({ user, dbname, collname });
        const data = Array.isArray(rawData) ? rawData : [];
        return data;
      } catch (err) {
        return { status: false, error: err.message || String(err) };
      }
    },
  };
};
