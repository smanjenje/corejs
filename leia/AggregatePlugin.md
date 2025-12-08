Claro! Um **`AggregatePlugin`** é a evolução natural do seu ecossistema: ele permite encadear operações como **filtragem, lookup, ordenação, projeção, paginação e agrupamento** em um único pipeline — no estilo do **MongoDB Aggregation Pipeline**.

Vamos criar um plugin simples, poderoso e compatível com seus plugins existentes.

---

### ✅ Objetivo

Permitir um pipeline como:

```js
app.aggregate({
  user,
  dbname,
  collname: "professores",
  pipeline: [
    { $match: { nome: { $regex: /Severino/ } } },
    {
      $lookup: {
        from: "disciplinas",
        localField: "_id",
        foreignField: "professorId",
        as: "disciplinas",
      },
    },
    { $sort: { _id: "desc" } },
    { $project: ["nome", "disciplinas.nome"] },
    { $limit: 2 },
  ],
});
```

---

### ✅ `core/plugins/aggregate/AggregatePlugin.js`

```js
// core/plugins/aggregate/AggregatePlugin.js
// Pipeline de agregação estilo MongoDB

module.exports = ({ app } = {}) => {
  if (!app) throw new Error("AggregatePlugin: app obrigatório");

  /**
   * Executa um pipeline de agregação.
   * @param {Object} params
   * @param {string} params.user
   * @param {string} params.dbname
   * @param {string} params.collname
   * @param {Array} params.pipeline - lista de estágios
   * @returns {Promise<Array>} documentos após pipeline
   */
  const aggregate = async ({ user, dbname, collname, pipeline = [] }) => {
    if (!user || !dbname || !collname) {
      throw new Error("aggregate requer user, dbname e collname");
    }
    if (!Array.isArray(pipeline)) {
      throw new Error("pipeline deve ser um array");
    }

    // Carrega documentos iniciais
    let docs = (await app.getCollData({ user, dbname, collname })) ?? [];
    if (!Array.isArray(docs)) docs = [];

    // Executa cada estágio
    for (const stage of pipeline) {
      const operator = Object.keys(stage)[0];
      const args = stage[operator];

      switch (operator) {
        // === $match: filtragem ===
        case "$match":
          if (typeof app.findMany !== "function") {
            throw new Error("Estágio $match requer FilterPlugin");
          }
          docs = await app.findMany({
            user,
            dbname,
            collname,
            queries: [args],
            docs,
          });
          break;

        // === $lookup: relacionamento ===
        case "$lookup":
          if (typeof app.lookup !== "function") {
            throw new Error("Estágio $lookup requer LookupPlugin");
          }
          docs = await app.lookup({ docs, ...args });
          break;

        // === $sort: ordenação ===
        case "$sort":
          if (typeof app.sort !== "function") {
            throw new Error("Estágio $sort requer OrdenationPlugin");
          }
          docs = await app.sort({ docs, orderBy: args });
          break;

        // === $project: projeção ===
        case "$project":
          if (typeof app.project !== "function") {
            throw new Error("Estágio $project requer FieldsProjectPlugin");
          }
          docs = await app.project({ docs, fields: args });
          break;

        // === $limit: limite de documentos ===
        case "$limit":
          const limit = parseInt(args);
          if (!isNaN(limit) && limit >= 0) {
            docs = docs.slice(0, limit);
          }
          break;

        // === $skip: pular documentos ===
        case "$skip":
          const skip = parseInt(args);
          if (!isNaN(skip) && skip >= 0) {
            docs = docs.slice(skip);
          }
          break;

        // === $group: agrupamento (básico) ===
        case "$group":
          docs = groupDocs(docs, args);
          break;

        default:
          throw new Error(`Estágio não suportado: ${operator}`);
      }
    }

    return docs;
  };

  // ========== Helper: $group ==========
  const groupDocs = (docs, groupSpec) => {
    if (!groupSpec || typeof groupSpec !== "object") {
      throw new Error("$group requer um objeto de especificação");
    }

    const { _id, ...accumulators } = groupSpec;
    const groups = new Map();

    for (const doc of docs) {
      // Calcula a chave de agrupamento
      let groupId;
      if (_id === null) {
        groupId = null;
      } else if (typeof _id === "string" && _id.startsWith("$")) {
        // Ex: _id: "$departamento"
        const field = _id.slice(1);
        groupId = doc[field];
      } else if (typeof _id === "object") {
        // Ex: _id: { dept: "$departamento", ano: "$ano" }
        groupId = {};
        for (const [key, path] of Object.entries(_id)) {
          if (typeof path === "string" && path.startsWith("$")) {
            groupId[key] = doc[path.slice(1)];
          } else {
            groupId[key] = path;
          }
        }
      } else {
        groupId = _id;
      }

      const key = JSON.stringify(groupId);
      if (!groups.has(key)) {
        groups.set(key, {
          _id: groupId,
          ...initializeAccumulators(accumulators),
        });
      }
      accumulate(groups.get(key), doc, accumulators);
    }

    return Array.from(groups.values());
  };

  const initializeAccumulators = (accSpec) => {
    const result = {};
    for (const [field, expr] of Object.entries(accSpec)) {
      if (typeof expr === "object" && expr !== null) {
        const op = Object.keys(expr)[0];
        switch (op) {
          case "$sum":
            result[field] = 0;
            break;
          case "$avg":
            result[field] = { sum: 0, count: 0 };
            break;
          case "$min":
            result[field] = null;
            break;
          case "$max":
            result[field] = null;
            break;
          case "$first":
            result[field] = null;
            break;
          case "$last":
            result[field] = null;
            break;
          case "$push":
            result[field] = [];
            break;
          default:
            result[field] = null;
        }
      } else {
        result[field] = expr;
      }
    }
    return result;
  };

  const accumulate = (group, doc, accSpec) => {
    for (const [field, expr] of Object.entries(accSpec)) {
      if (typeof expr === "object" && expr !== null) {
        const op = Object.keys(expr)[0];
        const path = expr[op];
        const value =
          typeof path === "string" && path.startsWith("$")
            ? doc[path.slice(1)]
            : path;

        switch (op) {
          case "$sum":
            if (typeof value === "number") group[field] += value;
            break;
          case "$avg":
            if (typeof value === "number") {
              group[field].sum += value;
              group[field].count += 1;
            }
            break;
          case "$min":
            if (
              group[field] === null ||
              (value != null && value < group[field])
            ) {
              group[field] = value;
            }
            break;
          case "$max":
            if (
              group[field] === null ||
              (value != null && value > group[field])
            ) {
              group[field] = value;
            }
            break;
          case "$first":
            if (group[field] === null) group[field] = value;
            break;
          case "$last":
            group[field] = value;
            break;
          case "$push":
            group[field].push(value);
            break;
        }
      }
    }
  };

  // Finaliza acumuladores (ex: calcula média)
  const finalizeGroups = (groups) => {
    return groups.map((group) => {
      const result = { _id: group._id };
      for (const [key, value] of Object.entries(group)) {
        if (key === "_id") continue;
        if (
          value &&
          typeof value === "object" &&
          value.sum !== undefined &&
          value.count !== undefined
        ) {
          result[key] = value.count > 0 ? value.sum / value.count : null;
        } else {
          result[key] = value;
        }
      }
      return result;
    });
  };

  // Atualiza groupDocs para usar finalizeGroups
  const groupDocsFinal = (docs, groupSpec) => {
    if (!groupSpec || typeof groupSpec !== "object") {
      throw new Error("$group requer um objeto de especificação");
    }

    const { _id, ...accumulators } = groupSpec;
    const groups = new Map();

    for (const doc of docs) {
      let groupId;
      if (_id === null) {
        groupId = null;
      } else if (typeof _id === "string" && _id.startsWith("$")) {
        groupId = doc[_id.slice(1)];
      } else if (typeof _id === "object") {
        groupId = {};
        for (const [k, v] of Object.entries(_id)) {
          groupId[k] =
            typeof v === "string" && v.startsWith("$") ? doc[v.slice(1)] : v;
        }
      } else {
        groupId = _id;
      }

      const key = JSON.stringify(groupId);
      if (!groups.has(key)) {
        groups.set(key, {
          _id: groupId,
          ...initializeAccumulators(accumulators),
        });
      }
      accumulate(groups.get(key), doc, accumulators);
    }

    return finalizeGroups(Array.from(groups.values()));
  };

  // Substitui a função groupDocs
  // ... (no aggregate, use groupDocsFinal)

  // ========== Atualização no aggregate ==========
  // Dentro do switch, no case "$group":
  //   docs = groupDocsFinal(docs, args);

  // Por simplicidade, vamos inlinear a lógica final:

  const aggregateFinal = async ({ user, dbname, collname, pipeline = [] }) => {
    if (!user || !dbname || !collname) {
      throw new Error("aggregate requer user, dbname e collname");
    }
    if (!Array.isArray(pipeline)) {
      throw new Error("pipeline deve ser um array");
    }

    let docs = (await app.getCollData({ user, dbname, collname })) ?? [];
    if (!Array.isArray(docs)) docs = [];

    for (const stage of pipeline) {
      const operator = Object.keys(stage)[0];
      const args = stage[operator];

      switch (operator) {
        case "$match":
          docs = await app.findMany({
            user,
            dbname,
            collname,
            queries: [args],
            docs,
          });
          break;
        case "$lookup":
          docs = await app.lookup({ docs, ...args });
          break;
        case "$sort":
          docs = await app.sort({ docs, orderBy: args });
          break;
        case "$project":
          docs = await app.project({ docs, fields: args });
          break;
        case "$limit":
          const limit = parseInt(args);
          if (!isNaN(limit) && limit >= 0) docs = docs.slice(0, limit);
          break;
        case "$skip":
          const skip = parseInt(args);
          if (!isNaN(skip) && skip >= 0) docs = docs.slice(skip);
          break;
        case "$group":
          docs = (function groupDocs(docs, spec) {
            const { _id, ...acc } = spec;
            const map = new Map();

            const getGroupKey = (doc) => {
              if (_id === null) return "null";
              if (typeof _id === "string" && _id.startsWith("$")) {
                return JSON.stringify(doc[_id.slice(1)]);
              }
              if (typeof _id === "object") {
                const k = {};
                for (let [f, p] of Object.entries(_id)) {
                  k[f] =
                    typeof p === "string" && p.startsWith("$")
                      ? doc[p.slice(1)]
                      : p;
                }
                return JSON.stringify(k);
              }
              return JSON.stringify(_id);
            };

            const initAcc = {};
            for (let [f, expr] of Object.entries(acc)) {
              if (typeof expr === "object" && expr !== null) {
                const op = Object.keys(expr)[0];
                if (op === "$sum") initAcc[f] = 0;
                else if (op === "$avg") initAcc[f] = { s: 0, c: 0 };
                else if (
                  op === "$min" ||
                  op === "$max" ||
                  op === "$first" ||
                  op === "$last"
                )
                  initAcc[f] = null;
                else if (op === "$push") initAcc[f] = [];
                else initAcc[f] = null;
              } else {
                initAcc[f] = expr;
              }
            }

            for (let doc of docs) {
              const key = getGroupKey(doc);
              if (!map.has(key)) {
                map.set(key, {
                  _id:
                    _id === null
                      ? null
                      : typeof _id === "string" && _id.startsWith("$")
                      ? doc[_id.slice(1)]
                      : _id,
                  ...JSON.parse(JSON.stringify(initAcc)),
                });
              }
              const g = map.get(key);
              for (let [f, expr] of Object.entries(acc)) {
                if (typeof expr === "object" && expr !== null) {
                  const op = Object.keys(expr)[0];
                  const val =
                    typeof expr[op] === "string" && expr[op].startsWith("$")
                      ? doc[expr[op].slice(1)]
                      : expr[op];
                  if (op === "$sum" && typeof val === "number") g[f] += val;
                  else if (op === "$avg" && typeof val === "number") {
                    g[f].s += val;
                    g[f].c++;
                  } else if (op === "$min" && (g[f] === null || val < g[f]))
                    g[f] = val;
                  else if (op === "$max" && (g[f] === null || val > g[f]))
                    g[f] = val;
                  else if (op === "$first" && g[f] === null) g[f] = val;
                  else if (op === "$last") g[f] = val;
                  else if (op === "$push") g[f].push(val);
                }
              }
            }

            return Array.from(map.values()).map((g) => {
              const r = { _id: g._id };
              for (let [f, v] of Object.entries(g)) {
                if (f === "_id") continue;
                if (
                  v &&
                  typeof v === "object" &&
                  v.s !== undefined &&
                  v.c !== undefined
                ) {
                  r[f] = v.c > 0 ? v.s / v.c : null;
                } else {
                  r[f] = v;
                }
              }
              return r;
            });
          })(docs, args);
          break;
        default:
          throw new Error(`Estágio não suportado: ${operator}`);
      }
    }

    return docs;
  };

  return { aggregate: aggregateFinal };
};
```

> ⚠️ **Nota**: A versão acima inclui `$group` com operadores como `$sum`, `$avg`, etc. Se quiser uma versão **mais simples** (só `$match`, `$lookup`, `$sort`, `$project`, `$limit`, `$skip`), posso remover o `$group`.

---

### ✅ Exemplos de uso

#### 1. **Pipeline completo**

```js
const resultado = await app.aggregate({
  user: "admin",
  dbname: "escola",
  collname: "professores",
  pipeline: [
    { $match: { nome: { $regex: "^Severino" } } },
    {
      $lookup: {
        from: "disciplinas",
        localField: "_id",
        foreignField: "professorId",
        as: "disciplinas",
      },
    },
    { $sort: { _id: "desc" } },
    { $project: ["nome", "disciplinas.nome"] },
    { $limit: 2 },
  ],
});
```

#### 2. **Agrupamento (contagem de disciplinas por professor)**

```js
const resultado = await app.aggregate({
  user: "admin",
  dbname: "escola",
  collname: "disciplinas",
  pipeline: [
    {
      $group: {
        _id: "$professorId",
        totalDisciplinas: { $sum: 1 },
        disciplinas: { $push: "$nome" },
      },
    },
  ],
});
```

---

### ✅ Estágios suportados

| Estágio    | Descrição                                   |
| ---------- | ------------------------------------------- |
| `$match`   | Filtra documentos (`FilterPlugin`)          |
| `$lookup`  | Faz join com outra coleção (`LookupPlugin`) |
| `$sort`    | Ordena (`OrdenationPlugin`)                 |
| `$project` | Seleciona campos (`FieldsProjectPlugin`)    |
| `$limit`   | Limita número de docs                       |
| `$skip`    | Pula docs                                   |
| `$group`   | Agrupa e acumula (soma, média, etc.)        |

---

### ✅ Registro do plugin

```js
app.addPlugins([
  // ... seus plugins existentes
  FilterPlugin,
  LookupPlugin,
  OrdenationPlugin,
  FieldsProjectPlugin,
  AggregatePlugin, // ← depois dos anteriores
]);
```

---

Pronto! Agora seu `CoreJS` tem **um motor de agregação completo**, compatível com MongoDB e pronto para APIs avançadas! 🚀

Se quiser uma versão **sem `$group`** (mais leve), é só pedir!

Claro! Vamos **refatorar o `AggregatePlugin`** para **usar o `GroupPlugin` externo** em vez de implementar `$group` internamente.

Isso mantém a arquitetura **modular e limpa**, seguindo o padrão do seu ecossistema.

---

### ✅ Mudanças principais

1. **Remover toda a lógica de `$group` do `AggregatePlugin`**
2. **Chamar `app.group()`** quando encontrar estágio `$group`
3. **Manter todos os outros estágios** (`$match`, `$lookup`, etc.)

---

### ✅ `core/plugins/aggregate/AggregatePlugin.js` (versão refatorada)

```js
// core/plugins/aggregate/AggregatePlugin.js
// Pipeline de agregação que delega $group para GroupPlugin

module.exports = ({ app } = {}) => {
  if (!app) throw new Error("AggregatePlugin: app obrigatório");

  /**
   * Executa um pipeline de agregação.
   * @param {Object} params
   * @param {string} params.user
   * @param {string} params.dbname
   * @param {string} params.collname
   * @param {Array} params.pipeline - lista de estágios
   * @returns {Promise<Array>} documentos após pipeline
   */
  const aggregate = async ({ user, dbname, collname, pipeline = [] }) => {
    if (!user || !dbname || !collname) {
      throw new Error("aggregate requer user, dbname e collname");
    }
    if (!Array.isArray(pipeline)) {
      throw new Error("pipeline deve ser um array");
    }

    // Carrega documentos iniciais
    let docs = (await app.getCollData({ user, dbname, collname })) ?? [];
    if (!Array.isArray(docs)) docs = [];

    // Executa cada estágio
    for (const stage of pipeline) {
      const operator = Object.keys(stage)[0];
      const args = stage[operator];

      switch (operator) {
        // === $match: filtragem ===
        case "$match":
          if (typeof app.findMany !== "function") {
            throw new Error("Estágio $match requer FilterPlugin");
          }
          docs = await app.findMany({
            user,
            dbname,
            collname,
            queries: [args],
            docs,
          });
          break;

        // === $lookup: relacionamento ===
        case "$lookup":
          if (typeof app.lookup !== "function") {
            throw new Error("Estágio $lookup requer LookupPlugin");
          }
          docs = await app.lookup({ docs, ...args });
          break;

        // === $sort: ordenação ===
        case "$sort":
          if (typeof app.sort !== "function") {
            throw new Error("Estágio $sort requer OrdenationPlugin");
          }
          docs = await app.sort({ docs, orderBy: args });
          break;

        // === $project: projeção ===
        case "$project":
          if (typeof app.project !== "function") {
            throw new Error("Estágio $project requer FieldsProjectPlugin");
          }
          docs = await app.project({ docs, fields: args });
          break;

        // === $limit: limite de documentos ===
        case "$limit":
          const limit = parseInt(args);
          if (!isNaN(limit) && limit >= 0) {
            docs = docs.slice(0, limit);
          }
          break;

        // === $skip: pular documentos ===
        case "$skip":
          const skip = parseInt(args);
          if (!isNaN(skip) && skip >= 0) {
            docs = docs.slice(skip);
          }
          break;

        // === $group: delega para GroupPlugin ===
        case "$group":
          if (typeof app.group !== "function") {
            throw new Error("Estágio $group requer GroupPlugin");
          }
          docs = await app.group({ docs, by: args._id, accumulators: args });
          break;

        default:
          throw new Error(`Estágio não suportado: ${operator}`);
      }
    }

    return docs;
  };

  return { aggregate };
};
```

---

### ✅ Explicação da integração com `GroupPlugin`

No estágio `$group`, o MongoDB usa esta estrutura:

```js
{
  $group: {
    _id: "$professorId",
    total: { $sum: 1 },
    disciplinas: { $push: "$nome" }
  }
}
```

Seu `GroupPlugin` espera:

```js
app.group({
  docs,
  by: "$professorId", // ← args._id
  accumulators: {
    // ← todo o objeto args
    _id: "$professorId",
    total: { $sum: 1 },
    disciplinas: { $push: "$nome" },
  },
});
```

⚠️ **Atenção**: o `GroupPlugin` que criamos **não espera `_id` dentro de `accumulators`**, então precisamos **remover `_id` dos acumuladores**.

---

### ✅ Correção: extrair `_id` antes de passar para `app.group`

Atualize o caso `$group`:

```js
case "$group":
  if (typeof app.group !== "function") {
    throw new Error("Estágio $group requer GroupPlugin");
  }
  const { _id, ...accumulators } = args;
  docs = await app.group({ docs, by: _id, accumulators });
  break;
```

---

### ✅ Versão final corrigida

```js
// core/plugins/aggregate/AggregatePlugin.js
module.exports = ({ app } = {}) => {
  if (!app) throw new Error("AggregatePlugin: app obrigatório");

  const aggregate = async ({ user, dbname, collname, pipeline = [] }) => {
    if (!user || !dbname || !collname) {
      throw new Error("aggregate requer user, dbname e collname");
    }
    if (!Array.isArray(pipeline)) {
      throw new Error("pipeline deve ser um array");
    }

    let docs = (await app.getCollData({ user, dbname, collname })) ?? [];
    if (!Array.isArray(docs)) docs = [];

    for (const stage of pipeline) {
      const operator = Object.keys(stage)[0];
      const args = stage[operator];

      switch (operator) {
        case "$match":
          docs = await app.findMany({
            user,
            dbname,
            collname,
            queries: [args],
            docs,
          });
          break;
        case "$lookup":
          docs = await app.lookup({ docs, ...args });
          break;
        case "$sort":
          docs = await app.sort({ docs, orderBy: args });
          break;
        case "$project":
          docs = await app.project({ docs, fields: args });
          break;
        case "$limit":
          const limit = parseInt(args);
          if (!isNaN(limit) && limit >= 0) docs = docs.slice(0, limit);
          break;
        case "$skip":
          const skip = parseInt(args);
          if (!isNaN(skip) && skip >= 0) docs = docs.slice(skip);
          break;
        case "$group":
          if (typeof app.group !== "function") {
            throw new Error("Estágio $group requer GroupPlugin");
          }
          const { _id, ...accumulators } = args;
          docs = await app.group({ docs, by: _id, accumulators });
          break;
        default:
          throw new Error(`Estágio não suportado: ${operator}`);
      }
    }

    return docs;
  };

  return { aggregate };
};
```

---

### ✅ Como usar

Com seus plugins registrados na ordem correta:

```js
app.addPlugins([
  // ... outros plugins
  FilterPlugin,
  LookupPlugin,
  OrdenationPlugin,
  FieldsProjectPlugin,
  GroupPlugin, // ← necessário para $group
  AggregatePlugin, // ← usa GroupPlugin
]);
```

E um pipeline:

```js
const resultado = await app.aggregate({
  user: "admin",
  dbname: "escola",
  collname: "disciplinas",
  pipeline: [
    {
      $group: {
        _id: "$professorId",
        totalDisciplinas: { $sum: 1 },
        disciplinas: { $push: "$nome" },
      },
    },
  ],
});
```

Resultado:

```js
[
  { _id: 1, totalDisciplinas: 2, disciplinas: ["Matemática", "Física"] },
  { _id: 2, totalDisciplinas: 1, disciplinas: ["Química"] },
];
```

---

### ✅ Benefícios

- ✅ **Código mais limpo** no `AggregatePlugin`
- ✅ **Reutilização total** da lógica de agrupamento
- ✅ **Manutenção simplificada** (bugs de agrupamento são resolvidos em um só lugar)
- ✅ **Consistência** com o design modular do seu `CoreJS`

Pronto! Agora seu `AggregatePlugin` é **leve, focado e delega responsabilidades** como deve ser. 🚀
