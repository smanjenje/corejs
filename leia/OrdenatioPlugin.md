Perfeito! Você quer usar um **objeto para definir a ordenação**, assim:

```js
{
  docs: filteredDocs,
  orderBy: { "_id": "desc", "nome": "asc" }
}
```

Isso é mais limpo, legível e evita desalinhamento entre campos e direções.

Vou atualizar o `OrdenationPlugin.js` para suportar **exatamente esse formato**, mantendo a compatibilidade com o padrão que você definiu (com `docs` opcional, etc.).

---

### ✅ `core/plugins/order/OrdenationPlugin.js` — com suporte a `orderBy` como objeto

```js
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
        throw new Error("sort requer user, dbname e collname quando 'docs' não é fornecido");
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
      sortSpecs = orderBy.map(field => [field, "asc"]);
    } else if (typeof orderBy === "object" && orderBy !== null) {
      // orderBy: { "_id": "desc", "nome": "asc" }
      sortSpecs = Object.entries(orderBy).map(([field, dir]) => {
        const direction = (String(dir).toLowerCase() === "desc") ? "desc" : "asc";
        return [field, direction];
      });
    } else {
      return allDocs;
    }

    // Helper: obter valor aninhado
    const getValue = (obj, path) => {
      return path.split(".").reduce((o, k) => (o != null ? o[k] : undefined), obj);
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
          const cmp = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: "base" });
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
```

---

### ✅ Agora você pode usar exatamente como queria:

```js
const resultado = await app.sort({
  docs: filteredDocs,
  orderBy: { "_id": "desc" }
});
```

Ou com múltiplos campos:

```js
const resultado = await app.sort({
  user: "admin",
  dbname: "meubanco",
  collname: "professores",
  orderBy: { "idade": "desc", "nome": "asc" }
});
```

Ou até misturar (embora não recomendado):

```js
orderBy: { "createdAt": "desc" } // ✅
orderBy: "nome"                  // ✅ (equivale a { nome: "asc" })
orderBy: ["nome", "idade"]       // ✅ (todos "asc")
```

---

### ✅ Exemplo completo com seu estilo:

```js
const filteredDocs = await app.findMany({
  user: "admin",
  dbname: "meubanco",
  collname: "professores",
  queries: [{ nome: { contains: "Severino" } }]
});

const sortedDocs = await app.sort({
  docs: filteredDocs,
  orderBy: { "_id": "desc" }
});
```

✅ **Sem erro**
✅ **Sem exigir `user/db/coll` quando `docs` é fornecido**
✅ **Interface limpa com objeto `{ campo: direção }`**

Pronto! Agora está exatamente como você queria. 🚀

Seu exemplo tem um pequeno **problema de design**: você está tentando usar **dois formatos diferentes** de ordenação no mesmo plugin (`direction` + `orderBy` como array **vs** `orderBy` como objeto), mas **o plugin agora só suporta o formato de objeto** (como você pediu).

Além disso, **`filteredDocs` não está definido** no escopo do array `commands` — a menos que seu sistema tenha um mecanismo de **encadeamento de resultados** (ex: `USE_PREV_RESULT`).

Vamos corrigir os dois pontos:

---

### ✅ 1. Use **apenas o formato de objeto** `{ campo: direção }`

Remova `direction` e use só `orderBy` como objeto.

### ✅ 2. Se quiser encadear `findMany` → `sort`, faça em **etapas separadas**

(ou implemente um placeholder como `"$prev"` no seu `runFuncs`)

---

### ✅ Opção A: **Execução em etapas (recomendada para clareza)**

```js
// Primeiro: filtra
const filteredDocs = await app.findMany({
  user, dbname, collname,
  queries: [{ nome: { contains: "Severino" } }]
});

// Depois: ordena
const results = await Promise.all([
  // 1. Ordenar toda a coleção com objeto
  app.sort({ user, dbname, collname, orderBy: { _id: "desc" } }),

  // 2. Ordenar só os filtrados
  app.sort({ docs: filteredDocs, orderBy: { _id: "desc" } })
]);

logResults(results);
```

---

### ✅ Opção B: **Se seu `runFuncs` suporta referência ao resultado anterior**

Suponha que seu `coreJS.runFuncs` entenda um placeholder como `"$prev"`:

```js
const commands = [
  // Passo 1: filtrar
  {
    fnName: "findMany",
    args: { user, dbname, collname, queries: [{ nome: { contains: "Severino" } }] }
  },
  // Passo 2: ordenar todos os docs da coleção
  {
    fnName: "sort",
    args: { user, dbname, collname, orderBy: { _id: "desc" } }
  },
  // Passo 3: ordenar só os filtrados (usa resultado do passo 1)
  {
    fnName: "sort",
    args: {
      docs: "$prev", // ← seu runFuncs deve substituir isso pelo resultado anterior
      orderBy: { _id: "desc" }
    }
  }
];
```

> ⚠️ **Importante**: isso **só funciona se seu `runFuncs` tiver essa lógica de encadeamento**. Se não tiver, use a **Opção A**.

---

### ✅ Opção C: **Se você insiste em um único array `commands` sem encadeamento**

Então **não use `docs: filteredDocs` diretamente**, pois `filteredDocs` não existe nesse escopo. Em vez disso, faça duas chamadas independentes:

```js
const commands = [
  // 1. Ordenar TODOS os documentos da coleção
  {
    fnName: "sort",
    args: { user, dbname, collname, orderBy: { _id: "desc" } }
  },
  // 2. Ordenar APENAS documentos filtrados (mas precisa filtrar dentro do comando!)
  {
    fnName: "sort",
    args: {
      user, dbname, collname,
      // Simulamos: primeiro filtra, depois ordena (mas isso é ineficiente)
      // Melhor: usar Opção A
      orderBy: { _id: "desc" },
      // ⚠️ Não dá pra passar "filteredDocs" aqui sem encadeamento!
    }
  }
];
```

👉 **Conclusão**: o jeito **mais limpo e correto** é **não misturar lógica de filtragem e ordenação no mesmo array de comandos estáticos**, a menos que seu executor suporte composição.

---

### ✅ Recomendação final

Use **etapas sequenciais** no seu exemplo de teste:

```js
(async () => {
  const filtered = await app.findMany({ user, dbname, collname, queries: [...] });
  
  const results = await Promise.all([
    app.sort({ user, dbname, collname, orderBy: { _id: "desc" } }),
    app.sort({ docs: filtered, orderBy: { _id: "desc" } })
  ]);

  logResults(results);
})();
```

Assim:

- ✅ Funciona com seu `OrdenationPlugin` atual
- ✅ Não depende de magic strings ou placeholders
- ✅ Código legível e depurável

Se você quiser, posso te ajudar a **adicionar suporte a `"$prev"` no `runFuncs`** — mas por enquanto, **evite depender disso se não estiver implementado**.
