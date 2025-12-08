// core/plugins/order/OrdenationPlugin.js
module.exports = ({ app } = {}) => {
  if (!app) throw new Error("OrdenationPlugin: app obrigatório");

  /**
   * Ordena documentos com suporte a:
   * - orderBy como objeto: { campo1: "asc", campo2: "desc" }
   * - docs opcional (se fornecido, ignora user/db/coll)
   */
  const sort = async ({ user, dbname, collname, docs, orderBy } = {}) => {
    let allDocs;

    if (docs !== undefined) {
      allDocs = Array.isArray(docs) ? docs : [];
    } else {
      if (!user || !dbname || !collname) {
        throw new Error(
          "sort requer user, dbname e collname quando 'docs' não é fornecido"
        );
      }
      allDocs = (await app.getCollData({ user, dbname, collname })) ?? [];
      if (!Array.isArray(allDocs)) {
        throw new Error("app.getCollData deve retornar um array");
      }
    }

    if (!orderBy || allDocs.length === 0) {
      return allDocs;
    }

    // Normaliza orderBy para array de [campo, direção]
    let sortSpecs = [];

    if (typeof orderBy === "string") {
      // orderBy: "_id"
      sortSpecs = [[orderBy, "asc"]];
    } else if (Array.isArray(orderBy)) {
      // orderBy: ["_id", "nome"] → todos "asc"
      sortSpecs = orderBy.map((field) => [field, "asc"]);
    } else if (typeof orderBy === "object" && orderBy !== null) {
      // orderBy: { "_id": "desc", "nome": "asc" }
      sortSpecs = Object.entries(orderBy).map(([field, dir]) => {
        const direction = String(dir).toLowerCase() === "desc" ? "desc" : "asc";
        return [field, direction];
      });
    } else {
      return allDocs;
    }

    // Helper: obter valor aninhado
    const getValue = (obj, path) => {
      return path
        .split(".")
        .reduce((o, k) => (o != null ? o[k] : undefined), obj);
    };

    // Comparador
    const compare = (a, b) => {
      for (const [field, direction] of sortSpecs) {
        const dir = direction === "desc" ? -1 : 1;
        const valA = getValue(a, field);
        const valB = getValue(b, field);

        if (valA == null && valB == null) continue;
        if (valA == null) return -1 * dir;
        if (valB == null) return 1 * dir;

        if (typeof valA === "string" && typeof valB === "string") {
          const cmp = valA.localeCompare(valB, undefined, {
            numeric: true,
            sensitivity: "base",
          });
          if (cmp !== 0) return cmp * dir;
        } else if (valA < valB) {
          return -1 * dir;
        } else if (valA > valB) {
          return 1 * dir;
        }
      }
      return 0;
    };

    return allDocs.slice().sort(compare);
  };

  return { sort };
};
