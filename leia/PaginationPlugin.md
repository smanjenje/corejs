Perfeito! Você quer um **`PaginationPlugin.js` minimalista**, com **apenas um método `paginate`**, que:

- Se receber `docs`, **usa esse array diretamente**
- Se **não receber `docs`**, **carrega todos os documentos da coleção** via `app.getCollData`
- **Não inclui** `findManyPaginated`, `findManyCursor` ou lógica de filtragem
- Funciona como **helper de paginação genérico**

---

### ✅ `core/plugins/pagination/PaginationPlugin.js` (versão simplificada)

```js
// core/plugins/pagination/PaginationPlugin.js
// Plugin de paginação simples: recebe docs ou carrega todos da coleção

module.exports = ({ app } = {}) => {
  if (!app) throw new Error("PaginationPlugin: app obrigatório");

  /**
   * Aplica paginação a uma lista de documentos.
   * @param {Object} params
   * @param {string} params.user
   * @param {string} params.dbname
   * @param {string} params.collname
   * @param {Array} [params.docs] - opcional: documentos já carregados/filtrados
   * @param {number} [params.page=1]
   * @param {number} [params.limit=10]
   * @param {number} [params.skip] - sobrescreve cálculo de page/limit
   * @returns {Object} { docs: [...], meta: { total, page, limit, pages, hasNext, hasPrev, skip } }
   */
  const paginate = async ({ user, dbname, collname, docs, page = 1, limit = 10, skip } = {}) => {
    // Validação básica
    if (!user || !dbname || !collname) {
      throw new Error("paginate requer user, dbname e collname");
    }

    // Carrega todos os documentos se não forem fornecidos
    const allDocs = docs ?? (await app.getCollData({ user, dbname, collname })) ?? [];

    if (!Array.isArray(allDocs)) {
      throw new Error("app.getCollData deve retornar um array");
    }

    const total = allDocs.length;
    const normalizedPage = Math.max(1, parseInt(page) || 1);
    const normalizedLimit = Math.max(1, Math.min(parseInt(limit) || 10, 100)); // limite máximo seguro

    const computedSkip = skip !== undefined ? skip : (normalizedPage - 1) * normalizedLimit;
    const paginatedDocs = allDocs.slice(computedSkip, computedSkip + normalizedLimit);

    const totalPages = Math.ceil(total / normalizedLimit);

    return {
      docs: paginatedDocs,
      meta: {
        total,
        page: normalizedPage,
        limit: normalizedLimit,
        pages: totalPages,
        hasNext: normalizedPage < totalPages,
        hasPrev: normalizedPage > 1,
        skip: computedSkip,
      },
    };
  };

  return { paginate };
};
```

---

### ✅ Como usar

#### Caso 1: com documentos já filtrados (ex: do `FilterPlugin`)

```js
const filteredDocs = await app.findMany({ user, dbname, collname, queries: [...] });
const resultado = await app.paginate({ docs: filteredDocs, page: 2, limit: 3 });
```

#### Caso 2: todos os documentos da coleção

```js
const resultado = await app.paginate({ user, dbname, collname, page: 1, limit: 5 });
```

---

### ✅ Vantagens dessa abordagem

- **Leve e reutilizável**
- **Não duplica lógica de filtragem**
- **Funciona com qualquer fonte de dados** (`getCollData`, `findMany`, etc.)
- **Fácil de testar e manter**

Pronto! 🚀 Agora seu `PaginationPlugin` faz **exatamente o que você pediu** — nada mais, nada menos.
