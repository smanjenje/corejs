// CoreJS/plugins/PrepareDocPlugin.js
module.exports = ({ app, options = {} } = {}) => {
  const { strict = true } = options;

  if (!app) throw new Error("PrepareDocPlugin: app obrigatório");
  if (app.pluginsNames && typeof app.pluginsNames === "object") {
    app.pluginsNames.PrepareDocPlugin = true;
  }

  // ============================================================
  // Helpers
  // ============================================================
  const timestamp = () =>
    typeof app.nowISO === "function" ? app.nowISO() : new Date().toISOString();

  const clone = (v) => {
    try {
      return JSON.parse(JSON.stringify(v));
    } catch {
      return v;
    }
  };

  const isPlainObject = (v) =>
    v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date);

  // ============================================================
  // Meta da collection
  // ============================================================
  const getCollMeta = async ({ user, dbname, collname }) => {
    if (!app.getCollMeta) throw new Error("getCollMeta não implementado");
    return await app.getCollMeta({ user, dbname, collname });
  };

  const setCollMeta = async ({ user, dbname, collname, meta }) => {
    if (!app.setCollMeta) throw new Error("setCollMeta não implementado");
    return await app.setCollMeta({ user, dbname, collname, meta });
  };

  // ============================================================
  // Normalização de tipos
  // ============================================================
  const normalizeType = (value, type) => {
    if (value === undefined || value === null) return value;

    switch (type) {
      case "string":
        return String(value);
      case "number":
        const n = Number(value);
        return isNaN(n) ? value : n;
      case "boolean":
        if (typeof value === "boolean") return value;
        if (value === "true") return true;
        if (value === "false") return false;
        return Boolean(value);
      case "date":
        if (value instanceof Date) return value;
        const d = new Date(value);
        return isNaN(d.getTime()) ? value : d;
      case "array":
        return Array.isArray(value) ? value : [value];
      case "object":
        return isPlainObject(value) ? value : value;
      default:
        return value;
    }
  };

  // ============================================================
  // AutoValue
  // ============================================================
  const applyAutoValue = (rule, currentValue, ctx) => {
    const auto = rule.autoValue;
    if (!auto) return currentValue;

    if (auto === "now") return timestamp();
    if (auto === "increment") {
      ctx.meta.nextId ??= 1;
      return ctx.meta.nextId++;
    }
    if (typeof auto === "function") {
      return auto({ value: currentValue, app, ...ctx });
    }

    return currentValue;
  };

  // ============================================================
  // Aplica schema recursivamente
  // ============================================================
  const applySchema = (doc, schema, ctx) => {
    const result = {};

    for (const [field, rule] of Object.entries(schema)) {
      const userValue = doc[field];

      let value =
        userValue !== undefined
          ? userValue
          : rule.default !== undefined
          ? clone(rule.default)
          : undefined;

      // autoValue
      value = applyAutoValue(rule, value, ctx);

      // normalização
      value = normalizeType(value, rule.type);

      // object
      if (rule.type === "object" && rule.subschema) {
        value = applySchema(value || {}, rule.subschema, ctx);
      }

      // array
      if (rule.type === "array" && rule.items) {
        if (!Array.isArray(value)) value = value === undefined ? [] : [value];

        value = value.map((item) => {
          if (rule.items.type === "object" && rule.items.subschema) {
            return applySchema(item || {}, rule.items.subschema, ctx);
          }
          return normalizeType(item, rule.items.type);
        });
      }

      result[field] = value;
    }

    return result;
  };

  // ============================================================
  // Remove campos fora do schema
  // ============================================================
  const removeDisallowedFields = (doc, schema) => {
    if (!isPlainObject(doc)) return;

    for (const key of Object.keys(doc)) {
      const isMeta = ["_id", "createdAt", "updatedAt"].includes(key);

      if (!schema[key] && !isMeta) {
        delete doc[key];
        continue;
      }

      if (schema[key]?.subschema && typeof doc[key] === "object") {
        removeDisallowedFields(doc[key], schema[key].subschema);
      }
    }
  };

  // ============================================================
  // Validação
  // ============================================================
  const validateField = (field, value, rule) => {
    if (rule.required && (value === undefined || value === null)) {
      throw new Error(`O campo "${field}" é obrigatório`);
    }
    if (value === undefined || value === null) return;

    const actualType = Array.isArray(value)
      ? "array"
      : value instanceof Date
      ? "date"
      : typeof value;

    if (rule.type && actualType !== rule.type) {
      throw new Error(
        `O campo "${field}" deve ser do tipo '${rule.type}', recebido '${actualType}'`
      );
    }

    if (rule.enum && !rule.enum.includes(value)) {
      throw new Error(
        `O campo "${field}" deve ser um dos valores: ${rule.enum.join(", ")}`
      );
    }

    if (rule.validate && typeof rule.validate === "function") {
      const res = rule.validate(value);
      if (res !== true) {
        throw new Error(`Validação customizada falhou em "${field}": ${res}`);
      }
    }
  };

  const validateSchema = (doc, schema) => {
    for (const [field, rule] of Object.entries(schema)) {
      validateField(field, doc[field], rule);
      if (rule.subschema && typeof doc[field] === "object") {
        validateSchema(doc[field], rule.subschema);
      }
    }
  };

  // ============================================================
  // Aplica updates
  // ============================================================
  const applyUpdates = (doc, updates) => {
    for (const [path, val] of Object.entries(updates)) {
      if (path.startsWith("$")) continue; // reservado para futuro
      app.setNestedValue(doc, path, val);
    }
  };

  // ============================================================
  // prepareDoc
  // ============================================================
  const prepareDoc = async ({
    user,
    dbname,
    collname,
    document = {},
    operation = "create",
    updates = {},
  }) => {
    const meta = await getCollMeta({ user, dbname, collname });
    if (!meta) throw new Error(`Meta da collection ${collname} não encontrada`);
    const schema = meta.schema || {};

    const ctx = { user, dbname, collname, meta, operation };
    let baseDoc = clone(document);

    // Timestamp
    const now =
      typeof app.nowISO === "function"
        ? app.nowISO()
        : new Date().toISOString();

    // _id e timestamps
    if (operation === "create") {
      if (baseDoc._id === undefined) {
        meta.nextId ??= 1;
        baseDoc._id = meta.nextId++;
        await setCollMeta({ user, dbname, collname, meta });
      }
      if (!baseDoc.createdAt) baseDoc.createdAt = now;
    } else {
      baseDoc.updatedAt = now;
    }

    // Aplica updates antes do schema
    applyUpdates(baseDoc, updates);

    // Normaliza e aplica schema
    let finalDoc = applySchema(baseDoc, schema, ctx);

    // Força campos essenciais (_id, createdAt, updatedAt)
    if (baseDoc._id !== undefined) finalDoc._id = baseDoc._id;
    if (baseDoc.createdAt !== undefined) finalDoc.createdAt = baseDoc.createdAt;
    if (baseDoc.updatedAt !== undefined) finalDoc.updatedAt = baseDoc.updatedAt;

    // Remove campos não permitidos
    if (strict) removeDisallowedFields(finalDoc, schema);

    // Valida schema
    validateSchema(finalDoc, schema);

    return finalDoc;
  };

  // ============================================================
  // prepareDocs (array)
  // ============================================================
  const prepareDocs = async ({
    user,
    dbname,
    collname,
    documents,
    operation = "create",
  }) => {
    const arr = Array.isArray(documents) ? documents : [documents];
    const out = [];

    for (const doc of arr) {
      out.push(
        await prepareDoc({
          user,
          dbname,
          collname,
          document: doc,
          operation,
        })
      );
    }

    return out;
  };

  return { prepareDoc, prepareDocs };
};
