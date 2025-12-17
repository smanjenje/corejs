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

  async function writeFile(file, data) {
    if (!file || typeof file !== "string")
      throw new Error("writeFile: file deve ser um caminho string.");

    // Hook opcional antes da escrita (útil para auditoria ou validação)
    if (typeof app.beforeWriteFile === "function") {
      try {
        await app.beforeWriteFile({ file, data });
      } catch (err) {
        // Se o hook lançar erro, interrompe a escrita por segurança
        throw new Error(
          "Escrita cancelada pelo hook beforeWriteFile: " + err.message
        );
      }
    }

    // 1) Escrita Atômica: Cria um arquivo temporário
    const tmp = file + ".tmp";

    try {
      // Garante que o diretório pai existe
      await fs.ensureFile(tmp);

      // 2) Escreve o Buffer/String no arquivo temporário
      // Diferente do writeJSON, aqui usamos fs.writeFile (suporta Buffer)
      await fs.writeFile(tmp, data);

      // 3) Move o temporário para o destino final (substituição atômica)
      await fs.move(tmp, file, { overwrite: true });

      // Invalida o cache JSON se este arquivo existir no cache
      // (Prevenção: se você sobrescrever um JSON usando writeFile, o cache deve limpar)
      if (jsonCache.has(file)) {
        jsonCache.delete(file);
      }
    } catch (err) {
      // Limpeza do arquivo temporário em caso de falha
      if (await fs.pathExists(tmp)) await fs.remove(tmp);
      throw err;
    }

    // Hook opcional após a escrita
    if (typeof app.afterWriteFile === "function") {
      try {
        await app.afterWriteFile({ file, data });
      } catch {}
    }

    return true;
  }

  /**
   * Lê um arquivo do disco como Buffer (binário).
   * @param {string} file - Caminho completo do arquivo.
   * @returns {Buffer} Conteúdo bruto do arquivo.
   */
  async function readFile(file) {
    if (!file || typeof file !== "string")
      throw new Error("readFile: file deve ser um caminho string.");

    try {
      // 1. Verifica se o arquivo existe antes de tentar ler
      const exists = await fs.pathExists(file);
      if (!exists) {
        throw new Error(`readFile: Arquivo não encontrado em ${file}`);
      }

      // 2. Lê o arquivo como Buffer
      // Não passamos 'utf8' para garantir que venha como binário (Buffer)
      // essencial para o seu CryptoPlugin e para imagens/PDFs.
      const data = await fs.readFile(file);

      return data;
    } catch (err) {
      throw new Error(`Erro ao ler arquivo: ${err.message}`);
    }
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
    writeFile,
    readFile,
  };
};
