Para criar um **BackupPlugin** profissional, ele deve ir além de uma simples cópia. Ele precisa garantir a integridade dos dados, organizar os arquivos por data e, preferencialmente, permitir a restauração rápida.

Como você já tem um **FSPlugin** muito sólido com escrita atômica e proteção de diretório, o `BackupPlugin` deve utilizá-lo para manipular os arquivos com segurança.

### 📦 Estrutura do BackupPlugin.js

```javascript
// core/plugins/utils/BackupPlugin.js

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

  return { createBackup, restoreBackup };
};
```

---

### 🛡️ Por que esta abordagem é segura?

1. **Isolamento**: Os backups ficam em uma pasta `backups/` separada da pasta de dados ativos, evitando que o `listDBs` confunda um backup com um banco real.
2. **Aproveitamento do Cache**: Ao usar `app.readJSON` e `app.writeJSON` para copiar, você aproveita o cache e a **escrita atômica** que você já implementou no `FSPlugin`.
3. **Rastreabilidade**: O uso de `tags` (ex: "pre-update", "automatico") ajuda a identificar por que aquele backup foi feito.

---

### 🧪 Como testar no seu `commands`

Adicione estas tarefas ao seu fluxo de execução:

```javascript
const commands = [
  {
    fnName: "createBackup",
    args: {
      user: "admin",
      dbname: "Quime",
      tag: "estavel",
    },
  },
  {
    // Opcional: listar para ver se o arquivo de backup foi criado
    fnName: "listFolder",
    args: {
      folder: "./mydb/admin/backups/Quime",
    },
  },
];
```

### 💡 Próxima Ideia: Auto-Backup

Você pode configurar o seu **DocPlugin** para que, sempre que houver uma deleção em massa (`deleteMany`), ele chame o `createBackup` automaticamente antes de executar a ação.

**Gostaria que eu integrasse o BackupPlugin com o seu DocPlugin para criar backups automáticos em ações críticas?**
