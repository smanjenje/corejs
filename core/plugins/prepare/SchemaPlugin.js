// plugins/SchemaPlugin.js
module.exports = ({ app, options = {} } = {}) => {
  if (app && app.pluginsNames && typeof app.pluginsNames === "object") {
    app.pluginsNames.SchemaPlugin = true;
  }



  // ------------------------------
  // Operadores permitidos no filtro
  // (não fazem parte do schema)
  // ------------------------------
  const FILTER_OPERATORS = new Set([
    "$eq",
    "$ne",
    "$gt",
    "$gte",
    "$lt",
    "$lte",
    "$in",
    "$nin",
    "$regex",
    "$startsWith",
    "$endsWith",
    "$between",
    "$contains",
  ]);

  const isOperator = (k) => k.startsWith("$") && FILTER_OPERATORS.has(k);

  // ------------------------------------------------------
  // Expansão do schema (recursivo)
  // ------------------------------------------------------
  const _expandSchema = ({ schema } = {}) => {
    if (!schema || typeof schema !== "object") {
      throw new Error("Schema inválido");
    }

    const input = app.clone(schema);
    const expanded = {};
    const newSchema = {};

    for (const [key, fieldRaw] of Object.entries(input)) {
      // NOVO: ignorar operadores
      if (isOperator(key)) continue;

      const field = app.clone(fieldRaw);
      const novoCampo = { ...field };

      // Object com subschema
      if (field.type === "object" && field.subschema) {
        if (typeof field.subschema === "object") {
          const subschema = app.clone(field.subschema);
          delete subschema._id;

          novoCampo.subschema = _expandSchema({ schema: subschema });

          if (novoCampo.subschema && novoCampo.subschema._id) {
            delete novoCampo.subschema._id;
          }
        } else {
          throw new Error(`Subschema inválido para o campo ${key}`);
        }
      }

      // Arrays com items
      if (field.type === "array" && field.items) {
        if (field.items.type === "object" && field.items.subschema) {
          if (typeof field.items.subschema === "object") {
            novoCampo.items = {
              ...field.items,
              subschema: _expandSchema({ schema: field.items.subschema }),
            };
          } else {
            throw new Error(`Subschema inválido para o campo ${key} no array`);
          }
        } else {
          novoCampo.items = { ...field.items };
        }
      }

      expanded[key] = novoCampo;
    }

    // Adiciona _id padrão se não existir
    if (!(" _id" in input) && !("_id" in input) && !("id" in input)) {
      newSchema._id = {
        type: "number",
        required: true,
        autoValue: "increment",
      };
    }

    return { ...newSchema, ...expanded };
  };

  // API pública ------------------------------

  const expandSchema = ({ schema } = {}) => {
    return _expandSchema({ schema });
  };

  const validateSchema = async ({ schema } = {}) => {
    try {
      const expanded = _expandSchema({ schema });

      for (const [key, field] of Object.entries(expanded)) {
        // Ignorar operadores no validate também
        if (isOperator(key)) continue;

        if (!field.type) {
          throw new Error(`Campo '${key}' deve ter um tipo definido`);
        }

        const allowedTypes = [
          "string",
          "number",
          "boolean",
          "object",
          "array",
          "date",
        ];

        if (!allowedTypes.includes(String(field.type))) {
          throw new Error(`Campo '${key}' possui tipo inválido: ${field.type}`);
        }

        if (
          field.type === "object" &&
          field.subschema &&
          typeof field.subschema !== "object"
        ) {
          throw new Error(`Campo '${key}': subschema inválido`);
        }

        if (field.type === "array" && !field.items) {
          throw new Error(`Campo '${key}': array precisa de definição 'items'`);
        }
      }

      return { status: true, message: "Schema válido", schema: expanded };
    } catch (error) {
      return { status: false, message: error.message || String(error) };
    }
  };

  return { expandSchema, validateSchema };
};
