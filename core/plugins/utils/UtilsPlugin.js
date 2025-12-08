module.exports = ({ app, options = {} } = {}) => {
  if (!app.pluginsNames || typeof app.pluginsNames !== "object") {
    try {
      app.pluginsNames = app.pluginsNames || {};
    } catch (e) {}
  }
  if (app.pluginsNames && typeof app.pluginsNames === "object") {
    app.pluginsNames.UtilsPlugin = true;
  }

  // ---------- Helpers ----------
  const ensureParams = (params = {}, fields = []) => {
    for (const f of fields) {
      if (params[f] === undefined || params[f] === null) {
        throw new Error(`Parâmetro obrigatório faltando: ${f}`);
      }
    }
  };

  // suporta arrays automaticamente
  const setNestedValue = (obj, path, value) => {
    const keys = path.split(".");
    let curr = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];

      // se a chave é número → array
      if (!isNaN(k)) {
        const idx = Number(k);
        if (!Array.isArray(curr)) curr = [];
        if (!curr[idx]) curr[idx] = {};
        curr = curr[idx];
        continue;
      }

      if (!curr[k] || typeof curr[k] !== "object") {
        curr[k] = {};
      }

      curr = curr[k];
    }

    const last = keys[keys.length - 1];

    if (!isNaN(last)) {
      if (!Array.isArray(curr)) curr = [];
      curr[Number(last)] = value;
    } else {
      curr[last] = value;
    }
  };

  const isObject = (val) => val !== null && typeof val === "object";
  const isPlainObject = (val) =>
    isObject(val) && Object.getPrototypeOf(val) === Object.prototype;

  const deepClone = (obj) => {
    if (typeof structuredClone === "function") {
      return structuredClone(obj);
    }
    return JSON.parse(JSON.stringify(obj));
  };
  const clone = (obj) => {
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch {
      return Object.assign({}, obj);
    }
  };

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

  // protege contra getters perigosos
  const safeGet = (obj, k) => {
    const desc = Object.getOwnPropertyDescriptor(obj, k);
    if (desc && (desc.get || desc.set)) return undefined;
    return obj[k];
  };

  const sanitizeObject = (input) => {
    if (!isObject(input)) return input;
    if (Array.isArray(input)) return input.map((v) => sanitizeObject(v));

    const out = {};
    for (const k of Object.keys(input)) {
      if (k === "__proto__" || k === "constructor" || k === "prototype")
        continue;

      const v = safeGet(input, k);
      if (isObject(v)) out[k] = sanitizeObject(v);
      else out[k] = v;
    }
    return out;
  };

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

  // deep merge opcional
  const merge = (target = {}, source = {}) => {
    const out = { ...target };
    for (const [k, v] of Object.entries(source)) {
      if (isPlainObject(v) && isPlainObject(out[k])) {
        out[k] = merge(out[k], v); // deep merge
      } else {
        out[k] = v; // override
      }
    }
    return out;
  };

  const api = {
    ensureParams,
    setNestedValue,
    isObject,
    isPlainObject,
    deepClone,
    clone,
    pick,
    omit,
    sanitizeObject,
    validateDoc,
    merge,
  };

  return api;
};
