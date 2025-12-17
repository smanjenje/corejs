// core/plugins/filters/ProjectPlugin.js
// Suporte a expressões avançadas de projeção (estilo MongoDB)

module.exports = ({ app } = {}) => {
  if (!app) throw new Error("ProjectPlugin: app obrigatório");

  if (app.pluginsNames && typeof app.pluginsNames === "object") {
    app.pluginsNames.ProjectPlugin = true;
  }

  // ---------- Helpers Internos ----------

  // Resolve referências de campo (ex: "$cliente.nome")
  const getValue = (doc, path) => {
    if (typeof path !== "string" || !path.startsWith("$")) return path;
    const keys = path.slice(1).split(".");
    let current = doc;
    for (const key of keys) {
      if (current == null || typeof current !== "object") return undefined;
      current = current[key];
    }
    return current;
  };

  // Avalia expressões recursivamente
  const evaluateExpression = (expr, doc, root = doc, variables = {}) => {
    if (expr === null || expr === undefined) return expr;

    // Valores literais
    if (typeof expr !== "object" || Array.isArray(expr)) return expr;

    // Operadores
    const operator = Object.keys(expr)[0];
    const args = expr[operator];

    switch (operator) {
      // --- Operadores de array ---
      case "$map":
        {
          const input = evaluateExpression(args.input, doc, root, variables);
          const as = args.as || "this";
          if (!Array.isArray(input)) return [];
          return input.map(item => {
            const newVars = { ...variables, [`$$${as}`]: item };
            return evaluateExpression(args.in, doc, root, newVars);
          });
        }

      case "$filter":
        {
          const input = evaluateExpression(args.input, doc, root, variables);
          if (!Array.isArray(input)) return [];
          return input.filter(item => {
            const newVars = { ...variables, "$$this": item };
            const cond = evaluateExpression(args.cond, doc, root, newVars);
            return !!cond;
          });
        }

      case "$arrayElemAt":
        {
          const array = evaluateExpression(args[0], doc, root, variables);
          const index = evaluateExpression(args[1], doc, doc, variables);
          if (!Array.isArray(array) || typeof index !== "number") return null;
          return index < 0 ? array[array.length + index] : array[index];
        }

      // --- Operadores de objeto ---
      case "$mergeObjects":
        {
          const objects = Array.isArray(args) ? args : [args];
          const result = {};
          for (const objExpr of objects) {
            const obj = evaluateExpression(objExpr, doc, root, variables);
            if (obj && typeof obj === "object" && !Array.isArray(obj)) {
              Object.assign(result, obj);
            }
          }
          return result;
        }

      // --- Operadores de comparação ---
      case "$eq":
        {
          const [a, b] = args.map(v => evaluateExpression(v, doc, root, variables));
          return a === b;
        }
      case "$ne":
        {
          const [a, b] = args.map(v => evaluateExpression(v, doc, root, variables));
          return a !== b;
        }
      case "$gt":
        {
          const [a, b] = args.map(v => evaluateExpression(v, doc, root, variables));
          return a > b;
        }
      case "$gte":
        {
          const [a, b] = args.map(v => evaluateExpression(v, doc, root, variables));
          return a >= b;
        }
      case "$lt":
        {
          const [a, b] = args.map(v => evaluateExpression(v, doc, root, variables));
          return a < b;
        }
      case "$lte":
        {
          const [a, b] = args.map(v => evaluateExpression(v, doc, root, variables));
          return a <= b;
        }

      // --- Acesso a variáveis de contexto ---
      default:
        if (typeof expr === "string" && expr.startsWith("$$")) {
          return variables[expr] !== undefined ? variables[expr] : expr;
        }
        if (typeof expr === "string" && expr.startsWith("$")) {
          return getValue(root, expr);
        }
        // Objeto literal
        const result = {};
        for (const [key, value] of Object.entries(expr)) {
          result[key] = evaluateExpression(value, doc, root, variables);
        }
        return result;
    }
  };

  // Aplica projeção a um único documento
  const projectDocument = (doc, projection) => {
    if (!projection || typeof projection !== "object") return doc;

    const result = {};
    const excludeMode = Object.values(projection).some(v => v === 0 || v === false);

    for (const [key, value] of Object.entries(projection)) {
      if (key === "_id" && value === 0) {
        // permite excluir _id explicitamente
      } else if (excludeMode && (value === 0 || value === false)) {
        continue;
      } else if (!excludeMode && (value === 1 || value === true)) {
        result[key] = doc[key];
      } else if (typeof value === "object" || Array.isArray(value)) {
        // Expressão avançada
        result[key] = evaluateExpression(value, doc, doc, {});
      }
    }

    return result;
  };

  // ---------- API Pública ----------
  const project = async ({ docs, fields }) => {
    if (!docs || !Array.isArray(docs)) {
      throw new Error("project requer 'docs' como array");
    }
    if (!fields || typeof fields !== "object") {
      throw new Error("project requer 'fields' como objeto de projeção");
    }

    return docs.map(doc => projectDocument(doc, fields));
  };

  return { project };
};