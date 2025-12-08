// core/plugins/FSPlugin.js
// Versão aprimorada/segura

const fs = require("fs-extra");
const path = require("path");

module.exports = ({ app, options = {} } = {}) => {
  const ROOT = options.root ?? path.join(process.cwd(), "db");

  fs.ensureDir(ROOT).catch(() => {});
  const jsonCache = new Map();

  // 1) Safe join sem redundância
  function safeJoin(base, ...paths) {
    const baseResolved = path.resolve(base);
    const fullPath = path.resolve(baseResolved, ...paths);
    const relative = path.relative(baseResolved, fullPath);

    if (relative === "" || !relative.startsWith("..")) {
      return fullPath;
    }

    throw new Error(
      `Tentativa de acesso fora do diretório permitido: ${fullPath}`
    );
  }

  const getFullPath = (...paths) => safeJoin(ROOT, ...paths);

  async function ensureFolder(folder) {
    await fs.ensureDir(folder);
    return folder;
  }

  async function getUserFolder(user) {
    if (!user) throw new Error("getUserFolder: usuário não especificado.");
    const folder = safeJoin(ROOT, String(user));
    return ensureFolder(folder);
  }

  async function getDBFolder({ user, dbname } = {}) {
    if (!dbname)
      throw new Error("getDBFolder: nome do banco não especificado.");
    const userFolder = await getUserFolder(user);
    const dbFolder = safeJoin(userFolder, String(dbname));
    return ensureFolder(dbFolder);
  }

  const getDBMetaFile = async (params) =>
    safeJoin(await getDBFolder(params), "db.json");

  const getDBFile = async (params) =>
    safeJoin(await getDBFolder(params), "db.json");

  // 2) Cache coerente incluso
  async function readJSON(file, defaultValue = {}) {
    if (!file || typeof file !== "string")
      throw new Error("readJSON: file deve ser um caminho string.");

    if (jsonCache.has(file)) return jsonCache.get(file);

    try {
      const exists = await fs.pathExists(file);
      if (!exists) {
        jsonCache.set(file, defaultValue);
        return defaultValue;
      }

      const data = await fs.readJSON(file);
      jsonCache.set(file, data);
      return data;
    } catch {
      jsonCache.set(file, defaultValue);
      return defaultValue;
    }
  }

  // 3) write atomic
  async function writeJSON(file, data) {
    if (!file || typeof file !== "string")
      throw new Error("writeJSON: file deve ser um caminho string.");

    if (typeof app.beforeWriteJSON === "function") {
      try {
        await app.beforeWriteJSON({ file, data });
      } catch {}
    }

    const tmp = file + ".tmp";
    await fs.ensureFile(tmp);
    await fs.writeJSON(tmp, data, { spaces: 2 });
    await fs.move(tmp, file, { overwrite: true });

    jsonCache.set(file, data);

    if (typeof app.afterWriteJSON === "function") {
      try {
        await app.afterWriteJSON({ file, data });
      } catch {}
    }

    return true;
  }

  async function removeFile(file) {
    if (!file || typeof file !== "string")
      throw new Error("removeFile: file deve ser um caminho string.");

    if (await fs.pathExists(file)) {
      await fs.remove(file);
      jsonCache.delete(file);
      return true;
    }
    return false;
  }

  async function removeFolder(folder) {
    if (!folder || typeof folder !== "string")
      throw new Error("removeFolder: folder deve ser um caminho string.");

    if (await fs.pathExists(folder)) {
      await fs.remove(folder);
      for (const key of [...jsonCache.keys()]) {
        if (key.startsWith(folder)) jsonCache.delete(key);
      }
      return true;
    }
    return false;
  }

  async function listFolder(folder) {
    if (!folder || typeof folder !== "string")
      throw new Error("listFolder: folder deve ser um caminho string.");

    await ensureFolder(folder);
    return (await fs.readdir(folder)).sort();
  }

  const pathExists = (t) =>
    t && typeof t === "string" ? fs.pathExists(t) : false;

  async function getFileStats(targetPath) {
    if (!targetPath || typeof targetPath !== "string") return null;
    try {
      const s = await fs.stat(targetPath);
      return {
        isDirectory: s.isDirectory(),
        isFile: s.isFile(),
        size: s.size,
        mtime: s.mtime,
        ctime: s.ctime,
        birthtime: s.birthtime,
      };
    } catch {
      return null;
    }
  }

  const clearCache = () => (jsonCache.clear(), true);

  return {
    ROOT,
    getFullPath,
    ensureFolder,
    getUserFolder,
    getDBFolder,
    getDBFile,
    getDBMetaFile,
    readJSON,
    writeJSON,
    removeFile,
    removeFolder,
    listFolder,
    pathExists,
    getFileStats,
    clearCache,
  };
};
