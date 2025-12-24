// core/plugins/CollPlugin.js
// Plugin com CRUD para Collections — usa apenas métodos expostos pelo FSPlugin e CachePlugin (via `app`)
// Não usa 'path' nem app.runFunc internamente.
// Corrigido para sempre usar app.getFullPath(user, dbname, filename) ou app.getDBMetaFile/app.getDBFolder quando disponíveis.

module.exports = ({ app } = {}) => {
  if (!app) throw new Error("CollPlugin precisa do objeto app");
  if (app.pluginsNames && typeof app.pluginsNames === "object") {
    app.pluginsNames.CollPlugin = true;
  }

  // ---------- Helpers Internos ----------
  const getDBFolder = ({ user, dbname } = {}) => {
    if (typeof app.getDBFolder !== "function") {
      throw new Error(
        "FSPlugin não disponível: app.getDBFolder não encontrada"
      );
    }
    return app.getDBFolder({ user, dbname });
  };

  const getDBMetaFile = async ({ user, dbname } = {}) => {
    // Preferir API dedicada quando disponível
    if (typeof app.getDBMetaFile === "function") {
      return app.getDBMetaFile({ user, dbname });
    }
    // Caso contrário, construir via getFullPath(user, dbname, filename)
    if (typeof app.getFullPath === "function") {
      return app.getFullPath(user, dbname, "db.json");
    }
    throw new Error(
      "FSPlugin não disponível: nem app.getDBMetaFile nem app.getFullPath encontrados"
    );
  };

  const cacheKeyMeta = (user, dbname, collname) =>
    `${user}/${dbname}/coll/${collname}/meta`;
  const cacheKeyData = (user, dbname, collname) =>
    `${user}/${dbname}/coll/${collname}/data`;
  const cacheKeyList = (user, dbname) => `${user}/${dbname}/collections/list`;

  const cacheGet = (k) =>
    app.cache && typeof app.cache.get === "function" ? app.cache.get(k) : null;
  const cacheSet = (k, v, ttl) =>
    app.cache && typeof app.cache.set === "function"
      ? app.cache.set(k, v, ttl)
      : null;
  const cacheDel = (k) =>
    app.cache && typeof app.cache.del === "function" ? app.cache.del(k) : null;

  // ---------- Hooks (registrados se app.addHooks existir) ----------
  try {
    if (typeof app.addHooks === "function") {
      app.addHooks([
        {
          tipo: "before",
          fnName: "createColl",
          callback: async ({ args }) => {
            try {
              console.log(
                `[HOOK BEFORE] Antes de criar coleção: ${args?.collname}`
              );
            } catch {}
          },
        },
        {
          tipo: "after",
          fnName: "createColl",
          callback: { fn: "buildCollMapIndex" },
        },
        {
          tipo: "after",
          fnName: "deleteColl",
          callback: { fn: "buildCollMapIndex" },
        },
        {
          tipo: "after",
          fnName: "truncateColl",
          callback: { fn: "buildDocsIndexs" },
        },
      ]);
    }
  } catch (e) {
    /* ignore */
  }

  // ---------- API do Plugin ----------
  return {
    // cria collection e registra nos metadados do DB
    createColl: async ({ user, dbname, collname, schema = {} } = {}) => {
      try {
        app.ensureParams({ user, dbname, collname }, [
          "user",
          "dbname",
          "collname",
        ]);

        const dbMetaFile = await getDBMetaFile({ user, dbname });

        // usa app.getDBMeta se disponível (pode retornar {status:false,...}) ou faz read direto
        let dbMeta;
        if (typeof app.getDBMeta === "function") {
          dbMeta = await app.getDBMeta({ user, dbname });
          if (dbMeta && dbMeta.status === false)
            return {
              status: false,
              msg: dbMeta.error || dbMeta.msg || `DB '${dbname}' não existe.`,
            };
        } else {
          dbMeta = await app.readJSON(dbMetaFile, null);
          if (!dbMeta)
            return { status: false, msg: `DB '${dbname}' não existe.` };
        }

        if ((dbMeta.collections || []).some((c) => c.collname === collname)) {
          return { status: false, msg: "Coleção já existe" };
        }

        if (typeof app.expandSchema === "function") {
          try {
            schema = app.expandSchema({ schema }) || schema;
          } catch {}
        }

        const collMeta = {
          collname,
          file: `${collname}.json`,
          schema,
          nextId: 1,
          createdAt:
            typeof app.nowISO === "function"
              ? app.nowISO()
              : new Date().toISOString(),
        };

        dbMeta.collections = dbMeta.collections || [];
        dbMeta.collections.push(collMeta);

        const dbFolder = await getDBFolder({ user, dbname });

        // cria arquivo da collection (array vazio) e atualiza meta
        if (typeof app.getFullPath !== "function")
          throw new Error(
            "FSPlugin não disponível: app.getFullPath não encontrada"
          );
        const collFilePath = app.getFullPath(user, dbname, collMeta.file);
        await app.writeJSON(collFilePath, []);
        await app.writeJSON(dbMetaFile, dbMeta);

        // Invalida cache
        cacheDel(cacheKeyMeta(user, dbname, collname));
        cacheDel(cacheKeyData(user, dbname, collname));
        cacheDel(cacheKeyList(user, dbname));
        cacheDel(
          typeof app.cacheKeyDB === "function"
            ? app.cacheKeyDB(user, dbname)
            : `${user}/${dbname}/db/full`
        );

        // tenta atualizar índice se função disponível (não obrigatório)
        if (typeof app.addCollection === "function") {
          try {
            await app.addCollection({ user, dbname, collname });
          } catch (e) {
            /* ignore */
          }
        }

        return {
          status: true,
          msg: "Coleção criada com sucesso",
          collection: collMeta,
        };
      } catch (error) {
        return { status: false, msg: error.message || String(error) };
      }
    },

    // lê meta + dados da collection (caching)
    readColl: async ({ user, dbname, collname } = {}) => {
      try {
        app.ensureParams({ user, dbname, collname }, [
          "user",
          "dbname",
          "collname",
        ]);

        const metaKey = cacheKeyMeta(user, dbname, collname);
        const dataKey = cacheKeyData(user, dbname, collname);

        const cachedMeta = cacheGet(metaKey);
        const cachedData = cacheGet(dataKey);
        if (cachedMeta && cachedData)
          return { meta: cachedMeta, data: cachedData };

        // obtém dbMeta de forma segura
        let dbMeta;
        if (typeof app.getDBMeta === "function") {
          dbMeta = await app.getDBMeta({ user, dbname });
          if (dbMeta && dbMeta.status === false)
            return {
              status: false,
              msg: dbMeta.error || dbMeta.msg || `DB '${dbname}' não existe.`,
            };
        } else {
          const dbMetaFile = await getDBMetaFile({ user, dbname });
          dbMeta = await app.readJSON(dbMetaFile, null);
          if (!dbMeta)
            return { status: false, msg: `DB '${dbname}' não existe.` };
        }

        const coll = dbMeta.collections?.find((c) => c.collname === collname);
        if (!coll) return { status: false, msg: "Coleção não encontrada" };

        if (typeof app.getFullPath !== "function")
          throw new Error(
            "FSPlugin não disponível: app.getFullPath não encontrada"
          );
        const collFile = app.getFullPath(user, dbname, coll.file);
        const data = await app.readJSON(collFile, []);

        cacheSet(metaKey, coll);
        cacheSet(dataKey, data);

        let result = { meta: coll, total_docs: data.length, data };
        result = app.clone(result);
        return result;
      } catch (error) {
        return { status: false, msg: error.message || String(error) };
      }
    },

    // // retorna somente os dados (array)
    // getCollData: async ({ user, dbname, collname } = {}) => {
    //   try {
    //     app.ensureParams({ user, dbname, collname }, [
    //       "user",
    //       "dbname",
    //       "collname",
    //     ]);
    //     const key = cacheKeyData(user, dbname, collname);
    //     const cached = cacheGet(key);
    //     if (cached && Array.isArray(cached)) return cached;

    //     const res = await app.readColl?.({ user, dbname, collname });
    //     if (res && res.status === false)
    //       throw new Error(res.msg || res.error || "erro ao ler collection");
    //     const data = res?.data || [];
    //     cacheSet(key, data);
    //     return data;
    //   } catch (error) {
    //     throw error;
    //   }
    // },

    getCollData: async ({ user, dbname, collname, noCache = false } = {}) => {
      app.ensureParams({ user, dbname, collname }, [
        "user",
        "dbname",
        "collname",
      ]);

      if (noCache == false) {
        const key = cacheKeyData(user, dbname, collname);
        const cached = cacheGet(key);
        if (Array.isArray(cached)) {
          return cached.map(app.clone); // 🔒 nunca retorna cache direto
        }
      }

      const res = await app.readColl?.({ user, dbname, collname });

      if (res && res.status === false) {
        throw new Error(res.msg || res.error || "erro ao ler collection");
      }

      const data = (res?.data || []).map(app.clone);

      if (noCache == false) {
        const key = cacheKeyData(user, dbname, collname);
        cacheSet(key, data);
      }

      return data.map(app.clone);
    },

    getCollMeta: async ({ user, dbname, collname } = {}) => {
      try {
        app.ensureParams({ user, dbname, collname }, [
          "user",
          "dbname",
          "collname",
        ]);
        const key = cacheKeyMeta(user, dbname, collname);
        // const cached = cacheGet(key);
        // if (cached) return cached;

        const dbMeta = await app.getDBMeta({ user, dbname });
        const meta = dbMeta.collections?.find((c) => c.collname === collname);
        if (!meta) throw new Error("Coleção não encontrada");

        cacheSet(key, meta);
        return meta;
      } catch (error) {
        return { status: false, msg: error.message || String(error) };
      }
    },

    // grava array completo de dados na collection
    saveCollData: async ({ user, dbname, collname, data } = {}) => {
      try {
        app.ensureParams({ user, dbname, collname }, [
          "user",
          "dbname",
          "collname",
        ]);

        const dbMeta =
          typeof app.getDBMeta === "function"
            ? await app.getDBMeta({ user, dbname })
            : await app.readJSON(await getDBMetaFile({ user, dbname }), null);

        if (!dbMeta || dbMeta.status === false)
          return {
            status: false,
            msg: dbMeta?.error || `DB '${dbname}' não existe.`,
          };

        const coll = dbMeta.collections?.find((c) => c.collname === collname);
        if (!coll) return { status: false, msg: "Coleção não encontrada" };

        if (typeof app.getFullPath !== "function")
          throw new Error(
            "FSPlugin não disponível: app.getFullPath não encontrada"
          );
        const collFile = app.getFullPath(user, dbname, coll.file);
        await app.writeJSON(collFile, data);

        cacheDel(cacheKeyData(user, dbname, collname));
        cacheDel(
          typeof app.cacheKeyDB === "function"
            ? app.cacheKeyDB(user, dbname)
            : `${user}/${dbname}/db/full`
        );
        return { status: true };
      } catch (error) {
        return { status: false, msg: error.message || String(error) };
      }
    },

    // lista coleções do DB (nomes)
    listColls: async ({ user, dbname } = {}) => {
      try {
        app.ensureParams({ user, dbname }, ["user", "dbname"]);
        const key = cacheKeyList(user, dbname);
        const cached = cacheGet(key);
        if (cached)
          return {
            cache: true,
            status: true,
            msg: "Coleções listadas (cache)",
            collections: cached,
          };

        const dbMeta =
          typeof app.getDBMeta === "function"
            ? await app.getDBMeta({ user, dbname })
            : await app.readJSON(await getDBMetaFile({ user, dbname }), null);

        if (!dbMeta || dbMeta.status === false)
          return {
            status: false,
            msg: dbMeta?.error || `DB '${dbname}' não existe.`,
          };

        const collections = (dbMeta.collections || []).map((c) => c.collname);
        cacheSet(key, collections);

        return {
          cache: false,
          status: true,
          msg: "Coleções listadas com sucesso",
          collections,
        };
      } catch (error) {
        return { status: false, msg: error.message || String(error) };
      }
    },

    // atualiza somente meta da collection
    setCollMeta: async ({ user, dbname, collname, meta } = {}) => {
      try {
        app.ensureParams({ user, dbname, collname, meta }, [
          "user",
          "dbname",
          "collname",
          "meta",
        ]);
        const key = cacheKeyMeta(user, dbname, collname);
        const dbMetaFile = await getDBMetaFile({ user, dbname });

        const dbMeta =
          typeof app.getDBMeta === "function"
            ? await app.getDBMeta({ user, dbname })
            : await app.readJSON(dbMetaFile, null);

        if (!dbMeta || dbMeta.status === false)
          return {
            status: false,
            msg: dbMeta?.error || `DB '${dbname}' não existe.`,
          };

        const idx = (dbMeta.collections || []).findIndex(
          (c) => c.collname === collname
        );
        if (idx !== -1)
          dbMeta.collections[idx] = { ...dbMeta.collections[idx], ...meta };
        else dbMeta.collections.push({ collname, ...meta });

        await app.writeJSON(dbMetaFile, dbMeta);

        cacheDel(key);
        cacheDel(cacheKeyList(user, dbname));
        return { status: true };
      } catch (error) {
        return { status: false, msg: error.message || String(error) };
      }
    },

    updateColl: async ({ user, dbname, collname, schema } = {}) => {
      try {
        app.ensureParams({ user, dbname, collname }, [
          "user",
          "dbname",
          "collname",
        ]);

        const metaKey = cacheKeyMeta(user, dbname, collname);
        const dbMetaFile = await getDBMetaFile({ user, dbname });

        const dbMeta = await app.readJSON(dbMetaFile, null);
        if (!dbMeta)
          return { status: false, msg: `DB '${dbname}' não existe.` };

        const coll = dbMeta.collections?.find((c) => c.collname === collname);
        if (!coll) return { status: false, msg: "Coleção não existe" };

        if (schema && typeof app.expandSchema === "function") {
          schema = app.expandSchema({ schema }) || schema;
        }
        Object.assign(
          coll,
          { schema },
          { updatedAt: new Date().toISOString() }
        );

        await app.writeJSON(dbMetaFile, dbMeta);

        cacheDel(metaKey);
        cacheDel(cacheKeyList(user, dbname));

        return {
          status: true,
          msg: "Coleção atualizada com sucesso",
          collection: coll,
        };
      } catch (error) {
        return { status: false, msg: error.message || String(error) };
      }
    },

    deleteColl: async ({ user, dbname, collname } = {}) => {
      try {
        app.ensureParams({ user, dbname, collname }, [
          "user",
          "dbname",
          "collname",
        ]);

        const metaKey = cacheKeyMeta(user, dbname, collname);
        const dataKey = cacheKeyData(user, dbname, collname);

        const dbMetaFile = await getDBMetaFile({ user, dbname });

        const dbMeta =
          typeof app.getDBMeta === "function"
            ? await app.getDBMeta({ user, dbname })
            : await app.readJSON(dbMetaFile, null);

        if (!dbMeta || dbMeta.status === false)
          return {
            status: false,
            msg: dbMeta?.error || `DB '${dbname}' não existe.`,
          };

        const idx = (dbMeta.collections || []).findIndex(
          (c) => c.collname === collname
        );
        if (idx === -1) return { status: false, msg: "Coleção não existe" };

        const dbFolder = await getDBFolder({ user, dbname });
        if (typeof app.getFullPath !== "function")
          throw new Error(
            "FSPlugin não disponível: app.getFullPath não encontrada"
          );
        const collFile = app.getFullPath(
          user,
          dbname,
          dbMeta.collections[idx].file
        );

        if (await app.pathExists(collFile)) {
          try {
            await app.removeFile(collFile);
          } catch {}
        }

        dbMeta.collections.splice(idx, 1);
        await app.writeJSON(dbMetaFile, dbMeta);

        cacheDel(metaKey);
        cacheDel(dataKey);
        cacheDel(cacheKeyList(user, dbname));
        cacheDel(
          typeof app.cacheKeyDB === "function"
            ? app.cacheKeyDB(user, dbname)
            : `${user}/${dbname}/db/full`
        );

        // tenta atualizar índice se disponível
        if (typeof app.removeCollection === "function") {
          try {
            await app.removeCollection({ user, dbname, collname });
          } catch (e) {
            /* ignore */
          }
        }

        return { status: true, msg: "Coleção excluída com sucesso" };
      } catch (error) {
        return { status: false, msg: error.message || String(error) };
      }
    },

    truncateColl: async ({ user, dbname, collname } = {}) => {
      try {
        app.ensureParams({ user, dbname, collname }, [
          "user",
          "dbname",
          "collname",
        ]);

        // --- Verifica se DB existe ---
        const dbMeta =
          typeof app.getDBMeta === "function"
            ? await app.getDBMeta({ user, dbname })
            : await app.readJSON(await getDBMetaFile({ user, dbname }), null);

        if (!dbMeta || dbMeta.status === false) {
          return {
            status: false,
            msg: dbMeta?.error || `DB '${dbname}' não existe.`,
          };
        }

        // --- Verifica se a coleção existe ---
        const coll = dbMeta.collections?.find((c) => c.collname === collname);
        if (!coll) {
          return { status: false, msg: "Coleção não encontrada" };
        }
        coll.nextId = 1;
        await app.setCollMeta({ user, dbname, collname, meta: coll });
        // --- Caminho físico do arquivo da collection ---
        if (typeof app.getFullPath !== "function") {
          throw new Error(
            "FSPlugin não disponível: app.getFullPath não encontrada"
          );
        }
        const collFile = app.getFullPath(user, dbname, coll.file);

        // --- Truncar a collection (salvar array vazio) ---
        await app.writeJSON(collFile, []);

        // --- Limpa cache relacionado à coleção ---
        cacheDel(`${user}/${dbname}/coll/${collname}/data`);
        cacheDel(
          typeof app.cacheKeyDB === "function"
            ? app.cacheKeyDB(user, dbname)
            : `${user}/${dbname}/db/full`
        );

        // --- Opcional: rebuild do índice se houver plugin ---
        // if (typeof app.buildDocsIndexs === "function") {
        //   try {
        //     await app.buildDocsIndexs({ user, dbname, collname });
        //   } catch (e) {
        //     console.warn(
        //       "WARN: buildDocsIndexs falhou ao truncar collection:",
        //       e
        //     );
        //   }
        // }

        return {
          status: true,
          msg: "Coleção truncada com sucesso (todos os documentos removidos).",
          collection: collname,
        };
      } catch (error) {
        return { status: false, msg: error.message || String(error) };
      }
    },
  };
};
