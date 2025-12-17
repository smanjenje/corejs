// core/plugins/utils/VirtualsPlugin.js

module.exports = ({ app }) => {
  // Armazena as definições: { "Users": { "fullName": (doc) => ... } }
  const virtualsRegistry = {};

  /**
   * Registra um campo virtual
   */
  app.defineVirtual = ({ coll, name, fn }) => {
    if (!virtualsRegistry[coll]) virtualsRegistry[coll] = {};
    virtualsRegistry[coll][name] = fn;
    return app;
  };

  /**
   * Método chamado pelo Mapa de Hooks
   */
  const applyVirtuals = async (args) => {
    const { collname, result } = args;
    if (!result || !virtualsRegistry[collname]) return;

    // Extrai os documentos do padrão de retorno do DocPlugin
    const data =
      result.docs ||
      result.updated ||
      (Array.isArray(result) ? result : [result]);
    const docsArray = Array.isArray(data) ? data : [data];

    const definitions = virtualsRegistry[collname];

    // Aplica cada função virtual por referência
    docsArray.forEach((doc) => {
      if (doc && typeof doc === "object") {
        for (const [fieldName, transformFn] of Object.entries(definitions)) {
          try {
            doc[fieldName] = transformFn(doc);
          } catch (e) {
            doc[fieldName] = null;
          }
        }
      }
    });
  };

  // Registro automático no Mapa de Hooks
  if (typeof app.addHooks === "function") {
    app.addHooks([
      { tipo: "after", fnName: "insertDoc", callback: { fn: "applyVirtuals" } },
      { tipo: "after", fnName: "updateDoc", callback: { fn: "applyVirtuals" } },
      { tipo: "after", fnName: "getDoc", callback: { fn: "applyVirtuals" } },
      { tipo: "after", fnName: "listDocs", callback: { fn: "applyVirtuals" } },
    ]);
  }

  return { applyVirtuals };
};
