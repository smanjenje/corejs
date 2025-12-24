// core/plugins/JoinPlugin.js
module.exports = ({ app }) => {
  if (!app) throw new Error("JoinPlugin: app é obrigatório");
  if (!app.clone || !app.setNestedValue) {
    throw new Error(
      "JoinPlugin depende do UtilsPlugin (clone, setNestedValue)."
    );
  }

  // --------------------------------------------------
  // JOIN imutável usando UtilsPlugin
  // --------------------------------------------------
  const joinCollections = async ({ user, dbname, localColl, joins = [] }) => {
    if (!Array.isArray(joins) || joins.length === 0) {
      return { status: true, data: [] };
    }

    // 1. Recupera dados base (immutável)
    const localRaw =
      (await app.getCollData({ user, dbname, collname: localColl })) || [];
    if (!Array.isArray(localRaw) || localRaw.length === 0)
      return { status: true, data: [] };

    // 🔒 clone defensivo da coleção local
    const localData = localRaw.map(app.clone);

    // 2. Mapa temporário de joins (escopo da execução)
    const joinMap = {};

    for (const joinCfg of joins) {
      const { targetColl, targetField, isMultiple } = joinCfg;

      if (joinMap[targetColl]) continue;

      const targetRaw =
        (await app.getCollData({ user, dbname, collname: targetColl })) || [];
      const map = new Map();

      for (const targetDoc of targetRaw) {
        const key = app.getNestedField(targetDoc, targetField);
        if (key === undefined || key === null) continue;

        const strKey = String(key);
        const clonedTarget = app.clone(targetDoc);

        if (isMultiple) {
          if (!map.has(strKey)) map.set(strKey, []);
          map.get(strKey).push(clonedTarget);
        } else {
          map.set(strKey, clonedTarget);
        }
      }

      joinMap[targetColl] = map;
    }

    // 3. Aplica JOIN
    const result = [];

    for (const doc of localData) {
      let keep = true;

      for (const joinCfg of joins) {
        const {
          localField,
          targetColl,
          joinType = "INNER",
          as,
          isMultiple,
        } = joinCfg;
        const localValue = app.getNestedField(doc, localField);
        const match =
          localValue !== undefined && localValue !== null
            ? joinMap[targetColl].get(String(localValue))
            : undefined;

        if (match !== undefined) {
          app.setNestedValue(doc, as, match);
        } else {
          if (joinType === "INNER") {
            keep = false;
            break;
          }
          app.setNestedValue(doc, as, isMultiple ? [] : null);
        }
      }

      if (keep) result.push(doc);
    }

    return { status: true, data: result };
  };

  return {
    joinCollections,
  };
};
