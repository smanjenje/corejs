// core/plugins/FilterPlugin.js
// Versão otimizada mantendo 100% da funcionalidade original.

module.exports = ({ app } = {}) => {
  // -------------------- Helpers --------------------

  const getNestedValue = (obj, path) =>
    path.split(".").reduce((o, k) => (o ? o[k] : undefined), obj);

  const isPrimitiveForIndex = (v) =>
    v === null ||
    v === undefined ||
    typeof v === "string" ||
    typeof v === "number" ||
    typeof v === "boolean" ||
    v instanceof Date;

  const valueKey = (v) => {
    if (v === null) return "__null__";
    if (v === undefined) return "__undef__";
    if (v instanceof Date) return v.toISOString();
    if (typeof v === "object") {
      try {
        return JSON.stringify(v);
      } catch {
        return String(v);
      }
    }
    return String(v);
  };

  // -------------------- matches() --------------------
  //   const matches = (doc, criteria) => {
  //     if (!criteria || typeof criteria !== "object") return false;

  //     // --- OR ---
  //     if (criteria.$or) {
  //       const arr = criteria.$or;
  //       if (!Array.isArray(arr)) throw new Error("$or deve ser array");
  //       for (const sub of arr) if (matches(doc, sub)) return true;
  //       return false;
  //     }

  //     // --- AND ---
  //     if (criteria.$and) {
  //       const arr = criteria.$and;
  //       if (!Array.isArray(arr)) throw new Error("$and deve ser array");
  //       for (const sub of arr) if (!matches(doc, sub)) return false;
  //       return true;
  //     }

  //     // --- Comparações comuns ---
  //     for (const [field, cond] of Object.entries(criteria)) {
  //       const val = getNestedValue(doc, field);

  //       if (typeof cond === "function") {
  //         if (!cond(val)) return false;
  //         continue;
  //       }

  //       if (cond === null || typeof cond !== "object") {
  //         if (val !== cond) return false;
  //         continue;
  //       }

  //       if ("$eq" in cond && val !== cond.$eq) return false;
  //       if ("$ne" in cond && val === cond.$ne) return false;
  //       if ("$gt" in cond && !(val > cond.$gt)) return false;
  //       if ("$gte" in cond && !(val >= cond.$gte)) return false;
  //       if ("$lt" in cond && !(val < cond.$lt)) return false;
  //       if ("$lte" in cond && !(val <= cond.$lte)) return false;

  //       if ("contains" in cond) {
  //         if (typeof val !== "string" || !val.includes(cond.contains))
  //           return false;
  //       }

  //       if ("$in" in cond) {
  //         const arr = cond.$in;
  //         if (!Array.isArray(arr) || !arr.includes(val)) return false;
  //       }

  //       if ("$nin" in cond) {
  //         const arr = cond.$nin;
  //         if (!Array.isArray(arr) || arr.includes(val)) return false;
  //       }

  //       // fallback: nested object
  //       if (!matches(val, cond)) return false;
  //     }

  //     return true;
  //   };

  const matches = (doc, criteria) => {
    if (!criteria || typeof criteria !== "object") return false;

    // ---------- OR ----------
    if (criteria.$or) {
      const arr = criteria.$or;
      if (!Array.isArray(arr)) throw new Error("$or deve ser array");
      for (const sub of arr) if (matches(doc, sub)) return true;
      return false;
    }

    // ---------- AND ----------
    if (criteria.$and) {
      const arr = criteria.$and;
      if (!Array.isArray(arr)) throw new Error("$and deve ser array");
      for (const sub of arr) if (!matches(doc, sub)) return false;
      return true;
    }

    // ---------- NOT (nega qualquer critério) ----------
    if (criteria.$not) return !matches(doc, criteria.$not);

    // ---------- Comparações por campo ----------
    for (const [field, cond] of Object.entries(criteria)) {
      const val = getNestedValue(doc, field);

      // Função callback custom
      if (typeof cond === "function") {
        if (!cond(val)) return false;
        continue;
      }

      // Igualdade simples
      if (cond === null || typeof cond !== "object") {
        if (val !== cond) return false;
        continue;
      }

      // ----------------------------- Operadores Avançados -----------------------------

      // $eq / $ne
      if ("$eq" in cond && val !== cond.$eq) return false;
      if ("$ne" in cond && val === cond.$ne) return false;

      // $gt / $gte / $lt / $lte
      if ("$gt" in cond && !(val > cond.$gt)) return false;
      if ("$gte" in cond && !(val >= cond.$gte)) return false;
      if ("$lt" in cond && !(val < cond.$lt)) return false;
      if ("$lte" in cond && !(val <= cond.$lte)) return false;

      // contains (string.includes)
      if ("contains" in cond) {
        if (typeof val !== "string" || !val.includes(cond.contains))
          return false;
      }

      // IN / NIN
      if ("$in" in cond) {
        const arr = cond.$in;
        if (!Array.isArray(arr) || !arr.includes(val)) return false;
      }
      if ("$nin" in cond) {
        const arr = cond.$nin;
        if (!Array.isArray(arr) || arr.includes(val)) return false;
      }

      // ----------------------------- NOVOS OPERADORES -----------------------------

      // $startsWith
      if ("$startsWith" in cond) {
        if (typeof val !== "string" || !val.startsWith(cond.$startsWith))
          return false;
      }

      // $endsWith
      if ("$endsWith" in cond) {
        if (typeof val !== "string" || !val.endsWith(cond.$endsWith))
          return false;
      }

      // $containsAny (alguma substring bate)
      if ("$containsAny" in cond) {
        const arr = cond.$containsAny;
        if (
          typeof val !== "string" ||
          !Array.isArray(arr) ||
          !arr.some((s) => val.includes(s))
        )
          return false;
      }

      // $containsAll (todas as substrings batem)
      if ("$containsAll" in cond) {
        const arr = cond.$containsAll;
        if (
          typeof val !== "string" ||
          !Array.isArray(arr) ||
          !arr.every((s) => val.includes(s))
        )
          return false;
      }

      // $between: (números ou datas)
      if ("$between" in cond) {
        const [min, max] = cond.$between || [];
        if (min === undefined || max === undefined) return false;

        const v = val instanceof Date ? val.getTime() : val;
        const a = min instanceof Date ? min.getTime() : min;
        const b = max instanceof Date ? max.getTime() : max;

        if (!(v >= a && v <= b)) return false;
      }

      // $regex: aceita RegExp ou string
      if ("$regex" in cond) {
        const rgx = cond.$regex;
        if (typeof val !== "string") return false;

        let re =
          rgx instanceof RegExp
            ? rgx
            : new RegExp(rgx, cond.$options || undefined);

        if (!re.test(val)) return false;
      }

      // -------------------------- fallback: nested object --------------------------
      if (!matches(val, cond)) return false;
    }

    return true;
  };

  // -------------------- Index helpers --------------------

  const indicesForFieldValue = async ({
    user,
    dbname,
    collname,
    field,
    value,
  }) => {
    const values = Array.isArray(value) ? value : [value];
    const idxSet = new Set();

    if (app.queryByIndex) {
      for (const v of values) {
        const res = await app.queryByIndex({
          user,
          dbname,
          collname,
          field,
          value: v,
        });
        if (res) for (const i of res) idxSet.add(i);
      }
      return [...idxSet];
    }

    if (app.readDocsMap) {
      const docsMap = await app.readDocsMap({ user, dbname });
      const map = docsMap?.[collname]?.[field] || {};
      for (const v of values) {
        const arr = map[valueKey(v)];
        if (arr) for (const i of arr) idxSet.add(i);
      }
      return [...idxSet];
    }

    return null;
  };

  const intersectArrays = (arrays) =>
    arrays.reduce((acc, arr) => acc.filter((x) => arr.includes(x)));

  // -------------------- findMany --------------------

  const findMany = async ({ user, dbname, collname, queries }) => {
    const qArray = Array.isArray(queries) ? queries : [queries];
    const docs = app.getCollData
      ? await app.getCollData({ user, dbname, collname })
      : [];
    const results = [];
    const seen = new Set();

    for (const criteria of qArray) {
      if (!criteria) continue;

      // Força varredura se houver AND/OR
      if (criteria.$or || criteria.$and) {
        for (const doc of docs) {
          if (!seen.has(doc._id) && matches(doc, criteria)) {
            seen.add(doc._id);
            results.push(doc);
          }
        }
        continue;
      }

      // Verifica se pode indexar
      const entries = Object.entries(criteria);
      let canIndex = true;

      for (const [, cond] of entries) {
        if (Array.isArray(cond)) {
          if (!cond.every(isPrimitiveForIndex)) {
            canIndex = false;
            break;
          }
        } else if (!isPrimitiveForIndex(cond)) {
          canIndex = false;
          break;
        }
      }

      let candidates = [];

      if (canIndex) {
        const perField = [];

        for (const [field, cond] of entries) {
          const idx = await indicesForFieldValue({
            user,
            dbname,
            collname,
            field,
            value: cond,
          });
          if (!idx) {
            canIndex = false;
            break;
          }
          perField.push(idx);
        }

        if (canIndex) {
          const idxs = intersectArrays(perField);
          for (const i of idxs) candidates.push(docs[i]);
        } else {
          candidates = docs;
        }
      } else {
        candidates = docs;
      }

      for (const d of candidates) {
        if (!seen.has(d._id) && matches(d, criteria)) {
          seen.add(d._id);
          results.push(d);
        }
      }
    }

    return results;
  };

  // -------------------- findOne --------------------
  const findOne = async ({ user, dbname, collname, queries }) => {
    const qArray = Array.isArray(queries) ? queries : [queries];
    const docs = app.getCollData
      ? await app.getCollData({ user, dbname, collname })
      : [];

    for (const criteria of qArray) {
      if (!criteria) continue;

      if (criteria.$or || criteria.$and) {
        for (const doc of docs) if (matches(doc, criteria)) return doc;
        continue;
      }

      const entries = Object.entries(criteria);
      let canIndex = true;

      for (const [, cond] of entries) {
        if (Array.isArray(cond)) {
          if (!cond.every(isPrimitiveForIndex)) {
            canIndex = false;
            break;
          }
        } else if (!isPrimitiveForIndex(cond)) {
          canIndex = false;
          break;
        }
      }

      if (canIndex) {
        const perField = [];
        for (const [field, cond] of entries) {
          const idx = await indicesForFieldValue({
            user,
            dbname,
            collname,
            field,
            value: cond,
          });
          if (!idx) {
            canIndex = false;
            break;
          }
          perField.push(idx);
        }

        if (canIndex) {
          const idxs = intersectArrays(perField);
          for (const i of idxs) {
            const d = docs[i];
            if (d && matches(d, criteria)) return d;
          }
          continue;
        }
      }

      for (const d of docs) if (matches(d, criteria)) return d;
    }

    return null;
  };

  return { matches, findMany, findOne };
};
