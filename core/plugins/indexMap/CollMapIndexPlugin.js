// core/plugins/CollMapIndexPlugin.js
// Plugin para gerenciar o collMapIndex.json usando somente APIs do FSPlugin.

module.exports = ({ app, options } = {}) => {
  // marca opcional
  if (app.pluginsNames && typeof app.pluginsNames === "object") {
    app.pluginsNames.CollMapIndexPlugin = true;
  }

  // -------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------
  const ensure = {
    user(u) {
      if (!u) throw new Error("user não especificado");
    },
    dbname(d) {
      if (!d) throw new Error("dbname não especificado");
    },
    collname(c) {
      if (!c) throw new Error("collname não especificado");
    },
  };

  const getFile = async ({ user, dbname }) => {
    ensure.user(user);
    ensure.dbname(dbname);

    if (typeof app.getFullPath !== "function") {
      throw new Error("FSPlugin não disponível: getFullPath não encontrada");
    }

    return app.getFullPath(user, dbname, "collMapIndex.json");
  };

  const readMap = async (ctx) => {
    try {
      const file = await getFile(ctx);
      const data = await app.readJSON(file, {});
      return data || {};
    } catch (err) {
      console.error("readCollMap: erro ao ler arquivo:", err);
      return {};
    }
  };

  const writeMap = async ({ user, dbname, collMap }) => {
    if (!collMap || typeof collMap !== "object") {
      throw new Error("writeCollMap: collMap inválido");
    }
    const file = await getFile({ user, dbname });
    await app.writeJSON(file, collMap);
    return true;
  };

  // -------------------------------------------------------------
  // Plugin API
  // -------------------------------------------------------------
  return {
    // -----------------------------------------------------------
    // Cria ou reconstrói o índice a partir do DBMeta
    // -----------------------------------------------------------
    async buildCollMapIndex({ user, dbname } = {}) {
      ensure.user(user);
      ensure.dbname(dbname);

      if (typeof app.getDBMeta !== "function") {
        throw new Error("buildCollMapIndex: getDBMeta não disponível");
      }

      const dbMeta = await app.getDBMeta({ user, dbname });
      if (!dbMeta || dbMeta.status === false) {
        throw new Error(
          `buildCollMapIndex: falha ao ler DBMeta: ${
            dbMeta?.error ?? "desconhecido"
          }`
        );
      }

      const collMap = {};
      const colls = dbMeta.collections || [];

      colls.forEach((c, idx) => {
        if (c?.collname) collMap[c.collname] = idx;
      });

      // se o app fornecer writeCollMap, usa ele; senão salva direto
      if (typeof app.writeCollMap === "function") {
        await app.writeCollMap({ user, dbname, collMap });
      } else {
        await writeMap({ user, dbname, collMap });
      }

      return collMap;
    },

    // -----------------------------------------------------------
    async readCollMap({ user, dbname } = {}) {
      return readMap({ user, dbname });
    },

    // -----------------------------------------------------------
    async writeCollMap({ user, dbname, collMap } = {}) {
      return writeMap({ user, dbname, collMap });
    },

    // -----------------------------------------------------------
    // Adiciona coleção preservando a ordem: newIndex = max + 1
    // -----------------------------------------------------------
    async addCollection({ user, dbname, collname } = {}) {
      ensure.collname(collname);

      const collMap = await readMap({ user, dbname });

      const idxs = Object.values(collMap)
        .map(Number)
        .filter((v) => !Number.isNaN(v));

      const next = idxs.length ? Math.max(...idxs) + 1 : 0;

      collMap[collname] = next;

      await writeMap({ user, dbname, collMap });

      return next;
    },

    // -----------------------------------------------------------
    // Remove coleção e normaliza para 0..N
    // -----------------------------------------------------------
    async removeCollection({ user, dbname, collname } = {}) {
      ensure.collname(collname);

      const collMap = await readMap({ user, dbname });
      delete collMap[collname];

      // normalização eficiente
      const normalized = Object.entries(collMap)
        .sort((a, b) => Number(a[1]) - Number(b[1]))
        .reduce((acc, [name], i) => {
          acc[name] = i;
          return acc;
        }, {});

      await writeMap({ user, dbname, collMap: normalized });

      return true;
    },

    // -----------------------------------------------------------
    // Retorna índice ou null
    // -----------------------------------------------------------
    async getCollIndex({ user, dbname, collname } = {}) {
      ensure.collname(collname);

      const collMap = await readMap({ user, dbname });

      const idx = collMap[collname];
      return idx === undefined ? null : Number(idx);
    },
  };
};
