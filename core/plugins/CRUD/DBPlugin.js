// core/plugins/test/DBPlugin.js
// Plugin de gerenciamento de DBs (lista, criar, meta, obter, deletar)
// Não usa 'path' — usa apenas métodos expostos pelo FSPlugin (app.getFullPath, app.getUserFolder, app.getDBFolder, app.listFolder, app.pathExists, app.readJSON, app.writeJSON, app.removeFolder, app.readColl, app.addCollection, etc.)

module.exports = ({ app, options } = {}) => {
  app.pluginsNames.DBPlugin = true;
  const ensureUserAndDB = (user, dbname) => {
    if (!user) throw new Error("Usuário não especificado.");
    if (!dbname) throw new Error("Nome do banco não especificado.");
  };

  app.cacheKeyDB = (user, dbname) => `${user}/${dbname}/db/full`;
  app.cacheKeyFullDB = (user, dbname) => `${user}/${dbname}/db/AllData`;

  const cacheGet = (key) =>
    app.cache && typeof app.cache.get === "function"
      ? app.cache.get(key)
      : null;
  const cacheSet = (key, val, ttl) =>
    app.cache && typeof app.cache.set === "function"
      ? app.cache.set(key, val, ttl)
      : null;
  const cacheDel = (key) =>
    app.cache && typeof app.cache.del === "function"
      ? app.cache.del(key)
      : null;

  return {
    listDBs: async ({ user } = {}) => {
      try {
        if (!user) return { status: false, error: "Usuário não especificado." };

        const key = `${user}/dbs`;
        const cached = cacheGet(key);
        if (cached) return cached;

        // getUserFolder cria/retorna a pasta do usuário (caminho absoluto)
        const userFolder = await app.getUserFolder(user);
        const entries = await app.listFolder(userFolder);

        const dbs = [];
        for (const entry of entries) {
          // usa getFullPath com user + entry para compor caminho seguro
          const dbPath = app.getFullPath(user, entry);
          if (await app.pathExists(dbPath)) dbs.push(entry);
        }

        const result = { total: dbs.length, dbs };
        cacheSet(key, result);
        return result;
      } catch (err) {
        return { status: false, error: err.message || String(err) };
      }
    },

    createDB: async ({ user, dbname } = {}) => {
      try {
        ensureUserAndDB(user, dbname);

        const keyMeta = `${user}/${dbname}/meta`;
        const keyList = `${user}/dbs`;

        // garante pasta do DB (pode criar)
        await app.getDBFolder({ user, dbname });

        const metaFile = app.getFullPath(user, dbname, "db.json");

        if (await app.pathExists(metaFile)) {
          return {
            status: false,
            error: {
              msg: `DB '${dbname}' já existe para o usuário '${user}'.`,
            },
          };
        }

        const dbMeta = { dbname, collections: [], createdAt: Date.now() };
        await app.writeJSON(metaFile, dbMeta);

        // Cria índices base
        await app.writeJSON(
          app.getFullPath(user, dbname, "docsMapIndex.json"),
          {}
        );
        await app.writeJSON(
          app.getFullPath(user, dbname, "collMapIndex.json"),
          {}
        );

        cacheDel(keyMeta);
        cacheDel(keyList);

        return { status: true, msg: `DB '${dbname}' criado com sucesso.` };
      } catch (err) {
        return { status: false, error: err.message || String(err) };
      }
    },

    getDBMeta: async ({ user, dbname } = {}) => {
      try {
        ensureUserAndDB(user, dbname);

        const key = `${user}/${dbname}/meta`;
        const cached = cacheGet(key);
        if (cached) return cached;

        const metaFile = app.getFullPath(user, dbname, "db.json");
        const dbMeta = await app.readJSON(metaFile);
        if (!dbMeta || Object.keys(dbMeta).length === 0) {
          return { status: false, error: `DB '${dbname}' não existe.` };
        }

        cacheSet(key, dbMeta);
        // 🔒 clone defensivo
        const dbMetas = app.clone(dbMeta);
        return dbMetas;
      } catch (err) {
        return { status: false, error: err.message || String(err) };
      }
    },

    updateDBMeta: async ({ user, dbname, dbMeta } = {}) => {
      try {
        ensureUserAndDB(user, dbname);
        if (!dbMeta || typeof dbMeta !== "object") {
          return { status: false, error: "dbMeta inválido para atualização." };
        }

        const key = `${user}/${dbname}/meta`;
        const metaFile = app.getFullPath(user, dbname, "db.json");

        dbMeta.updatedAt = Date.now();
        await app.writeJSON(metaFile, dbMeta);

        cacheDel(key);
        return { status: true, msg: "Metadados atualizados com sucesso." };
      } catch (err) {
        return { status: false, error: err.message || String(err) };
      }
    },

    getDB: async ({ user, dbname } = {}) => {
      try {
        ensureUserAndDB(user, dbname);

        const key = app.cacheKeyDB(user, dbname);
        const cachedDB = cacheGet(key);
        if (cachedDB) return { cache: true, ...cachedDB };

        const dbMeta = await app.getDBMeta({ user, dbname });
        if (!dbMeta || dbMeta.status === false) {
          return {
            status: false,
            error:
              dbMeta && dbMeta.error
                ? dbMeta.error
                : `DB '${dbname}' não encontrado.`,
          };
        }

        const collections = {};
        for (const coll of dbMeta.collections || []) {
          const collKey = `${user}/${dbname}/coll/${coll.collname}/data`;
          let data = cacheGet(collKey);
          if (!data) {
            const readData = await app.readColl({
              user,
              dbname,
              collname: coll.collname,
            });
            data = readData?.data || [];
            cacheSet(collKey, data);
          }
          collections[coll.collname] = { meta: coll, documents: data };
        }

        let result = { dbname, collections };
        result = app.clone(result);

        cacheSet(key, result);
        return { cache: false, ...result };
      } catch (err) {
        return { status: false, error: err.message || String(err) };
      }
    },

    getFullDB: async ({ user, dbname, ttl } = {}) => {
      try {
        ensureUserAndDB(user, dbname);

        const key = app.cacheKeyFullDB(user, dbname);
        const cachedDB = cacheGet(key);
        if (cachedDB) return { cache: true, ...cachedDB };

        const collMap = await app.readJSON(
          app.getFullPath(user, dbname, "collMapIndex.json"),
          {}
        );
        const docsMap = await app.readJSON(
          app.getFullPath(user, dbname, "docsMapIndex.json"),
          {}
        );

        const db = await app.getDB({ user, dbname });
        if (db && db.cache !== undefined) delete db.cache;

        let result = { db, collMap, docsMap };
        result = app.clone(result);

        cacheSet(key, result, ttl || { val: 1, tipo: "minuto" });

        return { cache: false, ...result };
      } catch (err) {
        return { status: false, error: err.message || String(err) };
      }
    },

    deleteDB: async ({ user, dbname } = {}) => {
      try {
        ensureUserAndDB(user, dbname);

        const dbFolder = await app.getDBFolder({ user, dbname });
        if (!(await app.pathExists(dbFolder))) {
          return { status: false, error: `DB '${dbname}' não existe.` };
        }

        await app.removeFolder(dbFolder);

        cacheDel(`${user}/${dbname}/meta`);
        cacheDel(`${user}/dbs`);
        cacheDel(app.cacheKeyDB(user, dbname));

        return { status: true, msg: `DB '${dbname}' deletado com sucesso.` };
      } catch (err) {
        return { status: false, error: err.message || String(err) };
      }
    },
  };
};
