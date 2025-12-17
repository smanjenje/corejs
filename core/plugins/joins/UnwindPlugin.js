// core/plugins/transform/UnwindPlugin.js

module.exports = ({ app } = {}) => {
  if (!app) {
    throw new Error("UnwindPlugin: app é obrigatório");
  }

  if (app.pluginsNames && typeof app.pluginsNames === "object") {
    app.pluginsNames.UnwindPlugin = true;
  }

  // --------------------------------------------------
  // Utils para campos aninhados
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
    if (!obj || typeof obj !== "object") return;
    const keys = path.split(".");
    const lastKey = keys.pop();
    const parent = keys.reduce((o, key) => {
      if (!o[key] || typeof o[key] !== "object") o[key] = {};
      return o[key];
    }, obj);
    parent[lastKey] = value;
  };

  /**
   * Desestrutura um campo array em múltiplos documentos (estilo $unwind do MongoDB).
   *
   * @param {Object} options
   * @param {Array} options.docs - documentos de entrada
   * @param {string} options.path - caminho do campo array a ser desestruturado (ex: "tags", "user.hobbies")
   * @param {boolean} [options.preserveNullAndEmptyArrays=false] - se true, mantém docs quando array é null/undefined/vazio
   * @returns {Array} - documentos desestruturados
   */
  const unwind = ({
    docs = [],
    path,
    preserveNullAndEmptyArrays = false,
  } = {}) => {
    if (!path) {
      throw new Error("unwind: 'path' é obrigatório");
    }

    if (!Array.isArray(docs)) {
      return [];
    }

    const result = [];

    for (const doc of docs) {
      const arrayValue = getNested(doc, path);

      if (arrayValue == null) {
        if (preserveNullAndEmptyArrays) {
          result.push({ ...doc });
        }
        continue;
      }

      if (!Array.isArray(arrayValue)) {
        // Se não é array, mantém o documento como está (comportamento do MongoDB)
        result.push({ ...doc });
        continue;
      }

      if (arrayValue.length === 0) {
        if (preserveNullAndEmptyArrays) {
          result.push({ ...doc });
        }
        continue;
      }

      // Cria um novo documento para cada elemento do array
      for (const item of arrayValue) {
        const newDoc = { ...doc };
        setNested(newDoc, path, item); // substitui o array pelo item
        result.push(newDoc);
      }
    }

    return result;
  };

  /**
   * Aplica múltiplos unwind em sequência.
   */
  const unwindMany = ({ docs = [], paths = [] }) => {
    let current = docs;
    for (const path of paths) {
      current = unwind({ docs: current, path });
    }
    return current;
  };

  // Registra no app

  return { unwind, unwindMany };
};
