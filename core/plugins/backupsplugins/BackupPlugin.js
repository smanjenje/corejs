// core/plugins/backupsplugins/BackupPlugin.js

module.exports = ({ app } = {}) => {
  if (!app) throw new Error("BackupPlugin: app é obrigatório");

  /**
   * Gera um snapshot completo do banco de dados de um usuário.
   */
  const createBackup = async ({ user, dbname, tag = "manual" } = {}) => {
    try {
      if (!user || !dbname)
        throw new Error("Usuário e banco são obrigatórios.");

      // 1. Localiza a pasta do banco e define a pasta de destino
      const dbFolder = await app.getDBFolder({ user, dbname });
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupFolderName = `backup_${tag}_${timestamp}`;

      // Criamos uma pasta de backups dentro da pasta do usuário, mas fora da pasta do DB ativo
      const userFolder = await app.getUserFolder(user);
      const backupPath = app.getFullPath(
        user,
        "backups",
        dbname,
        backupFolderName
      );

      await app.ensureFolder(backupPath);

      // 2. Lista os arquivos atuais do banco (db.json, coleções, índices)
      const files = await app.listFolder(dbFolder);

      // 3. Copia cada arquivo usando a infraestrutura do FSPlugin
      for (const file of files) {
        const sourceFile = app.getFullPath(user, dbname, file);
        const destinationFile = app.getFullPath(
          user,
          "backups",
          dbname,
          backupFolderName,
          file
        );

        const data = await app.readJSON(sourceFile);
        await app.writeJSON(destinationFile, data);
      }

      return {
        status: true,
        message: `Backup de '${dbname}' concluído.`,
        path: backupPath,
        filesCopied: files.length,
      };
    } catch (err) {
      return { status: false, error: err.message };
    }
  };

  /**
   * Restaura um banco de dados a partir de uma pasta de backup.
   */
  const restoreBackup = async ({ user, dbname, backupFolderName } = {}) => {
    try {
      const backupPath = app.getFullPath(
        user,
        "backups",
        dbname,
        backupFolderName
      );
      const dbFolder = await app.getDBFolder({ user, dbname });

      if (!(await app.pathExists(backupPath))) {
        throw new Error("Pasta de backup não encontrada.");
      }

      const files = await app.listFolder(backupPath);

      for (const file of files) {
        const sourceFile = app.getFullPath(
          user,
          "backups",
          dbname,
          backupFolderName,
          file
        );
        const destinationFile = app.getFullPath(user, dbname, file);

        const data = await app.readJSON(sourceFile);
        await app.writeJSON(destinationFile, data);
      }

      // Limpa o cache para garantir que o sistema leia os dados restaurados
      if (app.clearCache) app.clearCache();

      return {
        status: true,
        message: `Banco '${dbname}' restaurado com sucesso.`,
      };
    } catch (err) {
      return { status: false, error: err.message };
    }
  };

  const listBackups = async ({ user, dbname } = {}) => {
    try {
      if (!user || !dbname)
        throw new Error("Usuário e banco são obrigatórios.");

      // 1. Define o caminho onde os backups dessa DB específica ficam
      const backupsPath = app.getFullPath(user, "backups", dbname);

      // 2. Verifica se a pasta de backups existe (evita erro de pasta inexistente)
      const exists = await app.pathExists(backupsPath);
      if (!exists) return { status: true, total: 0, backups: [] };

      // 3. Lista as pastas de backup dentro do diretório
      const folders = await app.listFolder(backupsPath);

      // 4. Mapeia os detalhes de cada backup (opcional, mas recomendado)
      const backupList = [];
      for (const folderName of folders) {
        const folderPath = app.getFullPath(user, "backups", dbname, folderName);
        const stats = await app.getFileStats(folderPath);

        backupList.push({
          folder: folderName,
          createdAt: stats?.birthtime || stats?.mtime || "Desconhecido",
          path: folderPath,
        });
      }

      // Retorna ordenado pelo mais recente primeiro
      backupList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      return {
        status: true,
        total: backupList.length,
        backups: backupList,
      };
    } catch (err) {
      return { status: false, error: err.message };
    }
  };

  return { createBackup, restoreBackup, listBackups };
};
