// core/plugins/transform/ProjectPlugin.js
// Plugin para projeção de campos com suporte a paths aninhados (ex: "user.name")

module.exports = ({ app } = {}) => {
  if (!app) {
    throw new Error("ProjectPlugin: app é obrigatório");
  }

  if (app.pluginsNames && typeof app.pluginsNames === "object") {
    app.pluginsNames.ProjectPlugin = true;
  }

  // --------------------------------------------------
  // Utils para acesso e definição aninhada
  // --------------------------------------------------
  const getNested = (obj, path) => {
    if (!obj || typeof obj !== "object") return undefined;
    return path
      .split(".")
      .reduce(
        (o, key) => (o && o[key] !== undefined ? o[key] : undefined),
        obj
      );
  };

  const setNested = (obj, path, value) => {
    if (value === undefined) return;
    const keys = path.split(".");
    const lastKey = keys.pop();
    const parent = keys.reduce((o, key) => {
      if (!o[key] || typeof o[key] !== "object") o[key] = {};
      return o[key];
    }, obj);
    parent[lastKey] = value;
  };

  // --------------------------------------------------
  // project: aplica projeção a documentos
  // --------------------------------------------------
  /**
   * Projeta campos específicos de uma lista de documentos.
   * Suporta campos aninhados: { "user.name": 1 }
   *
   * @param {Object} options
   * @param {Array} options.docs - documentos de entrada
   * @param {Object} options.spec - especificação de projeção, ex: { name: 1, "user.email": 1 }
   * @returns {Array} - novos documentos com apenas os campos projetados
   */
  const project = ({ docs = [], spec = {} }) => {
    if (!Array.isArray(docs)) {
      return [];
    }
    if (typeof spec !== "object" || spec === null) {
      return docs;
    }

    return docs.map((doc) => {
      const newDoc = {};
      for (const [fieldPath, include] of Object.entries(spec)) {
        if (include) {
          const value = getNested(doc, fieldPath);
          setNested(newDoc, fieldPath, value);
        }
      }
      return newDoc;
    });
  };

  // --------------------------------------------------
  // projectMany: aplica múltiplas projeções em sequência
  // --------------------------------------------------
  const projectMany = ({ docs = [], specs = [] }) => {
    let current = docs;
    for (const spec of specs) {
      current = project({ docs: current, spec });
    }
    return current;
  };

  // --------------------------------------------------
  // Registro no app
  // --------------------------------------------------

  return { project, projectMany };
};
