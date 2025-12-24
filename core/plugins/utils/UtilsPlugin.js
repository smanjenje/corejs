// core/plugins/UtilsPlugin.js
module.exports = ({ app, options = {} } = {}) => {
  if (!app.pluginsNames || typeof app.pluginsNames !== "object") {
    app.pluginsNames = {};
  }
  app.pluginsNames.UtilsPlugin = true;

  // --------------------------------------------------
  // Helpers
  // --------------------------------------------------

  const ensureParams = (params = {}, fields = []) => {
    for (const f of fields) {
      if (params[f] === undefined || params[f] === null) {
        throw new Error(`Parâmetro obrigatório faltando: ${f}`);
      }
    }
  };

  // --------------------------------------------------
  // Utils básicos
  // --------------------------------------------------

  const isObject = (val) => val !== null && typeof val === "object";
  const isPlainObject = (val) =>
    isObject(val) && Object.getPrototypeOf(val) === Object.prototype;

  // --------------------------------------------------
  // Clone seguro
  // --------------------------------------------------

  const clone = (v) => {
    if (typeof structuredClone === "function") return structuredClone(v);
    return JSON.parse(JSON.stringify(v));
  };
  const deepClone = clone;

  // --------------------------------------------------
  // setNestedValue CORRIGIDO (arrays + objetos)
  // --------------------------------------------------

  const setNestedValue = (obj, path, value) => {
    if (!isObject(obj)) return;

    const keys = path.split(".");
    let curr = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      const nextIsIndex = !isNaN(keys[i + 1]);

      if (!isNaN(k)) {
        const idx = Number(k);
        if (!Array.isArray(curr)) return; // proteção
        if (!curr[idx]) curr[idx] = nextIsIndex ? [] : {};
        curr = curr[idx];
      } else {
        if (!curr[k] || typeof curr[k] !== "object") {
          curr[k] = nextIsIndex ? [] : {};
        }
        curr = curr[k];
      }
    }

    const last = keys[keys.length - 1];

    if (!isNaN(last)) {
      if (!Array.isArray(curr)) return;
      curr[Number(last)] = value;
    } else {
      curr[last] = value;
    }
  };

  const getNestedField = (obj, path) => {
    if (!obj || typeof obj !== "object") return undefined;
    return path.split(".").reduce((acc, part) => acc && acc[part], obj);
  };

  // --------------------------------------------------
  // pick / omit
  // --------------------------------------------------

  const pick = (obj = {}, keys = []) =>
    keys.reduce((acc, k) => {
      if (k in obj) acc[k] = obj[k];
      return acc;
    }, {});

  const omit = (obj = {}, keys = []) =>
    Object.keys(obj).reduce((acc, k) => {
      if (!keys.includes(k)) acc[k] = obj[k];
      return acc;
    }, {});

  // --------------------------------------------------
  // Sanitização segura
  // --------------------------------------------------

  const sanitizeObject = (input) => {
    if (Array.isArray(input)) {
      return input.map((v) => sanitizeObject(v));
    }

    if (!isPlainObject(input)) return input;

    const out = {};
    for (const k of Object.keys(input)) {
      if (k === "__proto__" || k === "constructor" || k === "prototype") {
        continue;
      }
      const v = input[k];
      out[k] = sanitizeObject(v);
    }
    return out;
  };

  // --------------------------------------------------
  // Validação simples
  // --------------------------------------------------

  const validateDoc = (schema = {}, doc = {}) => {
    const errors = [];
    if (!isPlainObject(schema)) return { valid: true, errors: [] };

    for (const [field, def] of Object.entries(schema)) {
      const val = doc[field];
      const required = def?.required === true;
      const type = def?.type;

      if (required && (val === undefined || val === null || val === "")) {
        errors.push({ field, error: "required" });
        continue;
      }

      if (type && val != null) {
        const ok =
          (type === "array" && Array.isArray(val)) ||
          (type === "object" && isPlainObject(val)) ||
          (type === "number" && typeof val === "number") ||
          (type === "string" && typeof val === "string") ||
          (type === "boolean" && typeof val === "boolean");

        if (!ok) errors.push({ field, error: `type:${type}` });
      }
    }

    return { valid: errors.length === 0, errors };
  };

  // --------------------------------------------------
  // Merge imutável
  // --------------------------------------------------

  const merge = (target = {}, source = {}) => {
    const out = { ...target };
    for (const [k, v] of Object.entries(source)) {
      if (isPlainObject(v) && isPlainObject(out[k])) {
        out[k] = merge(out[k], v);
      } else {
        out[k] = v;
      }
    }
    return out;
  };

  const isPrimitive = (v) =>
    v === null || ["string", "number", "boolean"].includes(typeof v);

  const operators = {
    $eq: (v, c) => v === c,
    $ne: (v, c) => v !== c,
    $gt: (v, c) => v > c,
    $gte: (v, c) => v >= c,
    $lt: (v, c) => v < c,
    $lte: (v, c) => v <= c,
    $in: (v, c) => Array.isArray(c) && c.includes(v),
    $nin: (v, c) => Array.isArray(c) && !c.includes(v),
    $all: (v, c) =>
      Array.isArray(v) &&
      Array.isArray(c) &&
      c.every((item) => v.includes(item)),
    $size: (v, c) => Array.isArray(v) && v.length === c,
    $regex: (v, c, opts) => {
      if (typeof v !== "string") return false;
      const re = c instanceof RegExp ? c : new RegExp(c, opts || "");
      return re.test(v);
    },
    $startsWith: (v, c) => typeof v === "string" && v.startsWith(c),
    $endsWith: (v, c) => typeof v === "string" && v.endsWith(c),
    $containsAny: (v, c) =>
      typeof v === "string" && Array.isArray(c) && c.some((s) => v.includes(s)),
    $containsAll: (v, c) =>
      typeof v === "string" &&
      Array.isArray(c) &&
      c.every((s) => v.includes(s)),
    $between: (v, c) => {
      if (!Array.isArray(c) || c.length < 2) return false;
      const [min, max] = c;
      const val = v instanceof Date ? v.getTime() : v;
      const a = min instanceof Date ? min.getTime() : min;
      const b = max instanceof Date ? max.getTime() : max;
      return val >= a && val <= b;
    },
  };

  // --------------------------------------------------
  // API
  // --------------------------------------------------

  return {
    ensureParams,
    setNestedValue,
    getNestedField,
    isPrimitive,
    isObject,
    isPlainObject,
    deepClone,
    clone,
    pick,
    omit,
    sanitizeObject,
    validateDoc,
    merge,
    operators,
  };
};
