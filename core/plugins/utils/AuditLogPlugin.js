// core/plugins/utils/AuditLogPlugin.js

module.exports = ({ app }) => {
  /**
   * O 'args' é o payload injetado pelo executor do addHooks
   */
  const auditLogger = async (args) => {
    const { user, dbname, collname, result, fnName } = args;

    // Proteção: Só logamos se houver usuário e banco identificados
    if (!user || !dbname) return;

    try {
      const logsDir = app.getFullPath(user, "logs", dbname);
      const logFile = app.getFullPath(user, "logs", dbname, "audit.json");
      await app.ensureFolder(logsDir);

      // 1. Identifica o(s) ID(s) afetado(s) baseando-se no retorno do DocPlugin
      // O DocPlugin retorna: { status, docs: [...] } ou { status, updated: [...] }
      let targetIds = [];

      if (result) {
        const data = result.docs || result.updated || result.deleted || result;
        const docsArray = Array.isArray(data) ? data : [data];

        targetIds = docsArray
          .map((d) => d?._id || d?.id || d) // Pega o ID ou o valor se for string/número
          .filter((id) => id !== undefined && id !== null);
      }

      // 2. Monta a entrada do log
      const logEntry = {
        timestamp: new Date().toISOString(),
        user: user,
        action: fnName, // Ex: "insertDoc", "deleteDoc"
        collection: collname || args.coll || "n/a",
        targetIds: targetIds.length > 0 ? targetIds : null,
        success: result?.status !== false,
        result,
        // Opcional: detalhes simplificados do erro se houver
        error: result?.status === false ? result.error || result.msg : null,
      };

      // 3. Persistência
      const currentLogs = await app.readJSON(logFile, []);
      currentLogs.push(logEntry);

      // Mantém apenas os últimos 500 registros para performance
      if (currentLogs.length > 500) currentLogs.shift();

      await app.writeJSON(logFile, currentLogs);
    } catch (err) {
      console.warn(`[AuditLog] Falha ao gravar: ${err.message}`);
    }
  };

  // Registro automático no mapa de hooks do CoreJS
  if (typeof app.addHooks === "function") {
    app.addHooks([
      { tipo: "after", fnName: "insertDoc", callback: { fn: "auditLogger" } },
      { tipo: "after", fnName: "updateDoc", callback: { fn: "auditLogger" } },
      { tipo: "after", fnName: "deleteDoc", callback: { fn: "auditLogger" } },
      {
        tipo: "after",
        fnName: "truncateColl",
        callback: { fn: "auditLogger" },
      },
    ]);
  }

  /**
   * Método utilitário para o seu frontend Vue consultar os logs
   */
  const getAuditLogs = async ({ user, dbname } = {}) => {
    if (!user || !dbname)
      throw new Error("Parâmetros user e dbname obrigatórios.");
    const logFile = app.getFullPath(user, "logs", dbname, "audit.json");
    const logs = await app.readJSON(logFile, []);
    return { status: true, total: logs.length, logs: logs.reverse() };
  };

  return { auditLogger, getAuditLogs };
};
