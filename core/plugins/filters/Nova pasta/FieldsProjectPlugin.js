// core/plugins/projection/FieldsProjectPlugin.js
// Plugin de projeção por lista de campos: fields: ["nome", "_id"]

module.exports = ({ app } = {}) => {
  if (!app) throw new Error("FieldsProjectPlugin: app obrigatório");

  /**
   * Projeta apenas os campos especificados.
   * @param {Object} params
   * @param {string} [params.user]
   * @param {string} [params.dbname]
   * @param {string} [params.collname]
   * @param {Array} [params.docs] - documentos a projetar
   * @param {string[]} [params.fields] - ex: ["nome", "_id"]
   * @returns {Promise<Array>} documentos com apenas os campos selecionados
   */
  const project = async ({ user, dbname, collname, docs, fields } = {}) => {
    let allDocs;

    if (docs !== undefined) {
      allDocs = Array.isArray(docs) ? docs : [];
    } else {
      if (!user || !dbname || !collname) {
        throw new Error(
          "project requer user, dbname e collname quando 'docs' não é fornecido"
        );
      }
      allDocs = (await app.getCollData({ user, dbname, collname })) ?? [];
      if (!Array.isArray(allDocs)) {
        throw new Error("app.getCollData deve retornar um array");
      }
    }

    // Se não houver fields ou for vazio, retorna tudo
    if (!fields || !Array.isArray(fields) || fields.length === 0) {
      return allDocs;
    }

    // Remove espaços extras (ex: "_id " → "_id")
    const cleanFields = fields.map((f) => String(f).trim());

    // Helper: obter valor aninhado
    const getNestedValue = (obj, path) => {
      return path
        .split(".")
        .reduce((o, k) => (o != null ? o[k] : undefined), obj);
    };

    // Helper: definir valor aninhado no novo objeto
    const setNestedValue = (obj, path, value) => {
      const keys = path.split(".");
      let current = obj;
      for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (current[key] == null || typeof current[key] !== "object") {
          current[key] = {};
        }
        current = current[key];
      }
      current[keys[keys.length - 1]] = value;
    };

    return allDocs.map((doc) => {
      const newDoc = {};
      for (const path of cleanFields) {
        if (path === "") continue;
        const value = getNestedValue(doc, path);
        if (value !== undefined) {
          setNestedValue(newDoc, path, value);
        }
      }
      return newDoc;
    });
  };

  return { project };
};
