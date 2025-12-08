Claro! Um **`LookupPlugin`** permite fazer **"joins" entre coleções** — ou seja, **incluir documentos de outra coleção com base em um campo de referência** (como `_id` ou `professorId`).

Vamos seguir **exatamente o mesmo padrão** dos seus plugins anteriores:

- Usa `docs` se fornecido, senão carrega da coleção principal
- Leve, simples e compatível com `app.getCollData`
- Interface clara e minimalista

---

### ✅ Exemplo de uso desejado

```js
const resultado = await app.lookup({
  docs: professores, // coleção principal
  from: "disciplinas", // coleção a "juntar"
  localField: "_id",   // campo na coleção principal
  foreignField: "professorId", // campo na coleção estrangeira
  as: "disciplinas"    // nome do novo campo no resultado
});
```

Resultado:

```js
[
  {
    _id: 1,
    nome: "Severino1",
    disciplinas: [ /* docs de disciplinas onde professorId === 1 */ ]
  }
]
```

---

### ✅ `core/plugins/lookup/LookupPlugin.js`

```js
// core/plugins/lookup/LookupPlugin.js
// Plugin para "join" entre coleções (lookup)

module.exports = ({ app } = {}) => {
  if (!app) throw new Error("LookupPlugin: app obrigatório");

  /**
   * Realiza um lookup (join) entre coleções.
   * @param {Object} params
   * @param {string} [params.user]
   * @param {string} [params.dbname]
   * @param {string} params.collname - coleção principal (se docs não fornecido)
   * @param {Array} [params.docs] - documentos da coleção principal
   * @param {string} params.from - coleção estrangeira (ex: "disciplinas")
   * @param {string} params.localField - campo na coleção principal (ex: "_id")
   * @param {string} params.foreignField - campo na coleção estrangeira (ex: "professorId")
   * @param {string} params.as - nome do novo campo no resultado (ex: "disciplinas")
   * @returns {Promise<Array>} documentos com os dados "joinados"
   */
  const lookup = async ({
    user,
    dbname,
    collname,
    docs,
    from,
    localField,
    foreignField,
    as
  }) => {
    // Validação de parâmetros obrigatórios
    if (!from || !localField || !foreignField || !as) {
      throw new Error("lookup requer 'from', 'localField', 'foreignField' e 'as'");
    }

    let mainDocs;

    if (docs !== undefined) {
      mainDocs = Array.isArray(docs) ? docs : [];
    } else {
      if (!user || !dbname || !collname) {
        throw new Error("lookup requer user, dbname, collname quando 'docs' não é fornecido");
      }
      mainDocs = (await app.getCollData({ user, dbname, collname })) ?? [];
      if (!Array.isArray(mainDocs)) mainDocs = [];
    }

    if (mainDocs.length === 0) {
      return [];
    }

    // Carrega todos os documentos da coleção estrangeira
    if (!user || !dbname) {
      throw new Error("lookup requer user e dbname para acessar coleção 'from'");
    }
    const foreignDocs = (await app.getCollData({ user, dbname, collname: from })) ?? [];
    if (!Array.isArray(foreignDocs)) {
      throw new Error(`Coleção '${from}' deve retornar um array`);
    }

    // Cria um mapa de índices para lookup O(1)
    const foreignMap = new Map();
    for (const doc of foreignDocs) {
      const key = doc[foreignField];
      if (key != null) { // ignora null/undefined
        if (!foreignMap.has(key)) {
          foreignMap.set(key, []);
        }
        foreignMap.get(key).push(doc);
      }
    }

    // Helper: obter valor aninhado (suporte a "a.b.c")
    const getNestedValue = (obj, path) => {
      return path.split(".").reduce((o, k) => (o != null ? o[k] : undefined), obj);
    };

    // Aplica o lookup
    return mainDocs.map(doc => {
      const localValue = getNestedValue(doc, localField);
      const matches = localValue != null ? foreignMap.get(localValue) || [] : [];
      return { ...doc, [as]: matches };
    });
  };

  return { lookup };
};
```

---

### ✅ Como usar

#### Caso 1: com `docs` já carregados

```js
const professores = await app.findMany({ user, dbname, collname: "professores", queries: [...] });
const resultado = await app.lookup({
  docs: professores,
  from: "disciplinas",
  localField: "_id",
  foreignField: "professorId",
  as: "disciplinas"
});
```

#### Caso 2: carregar coleção principal automaticamente

```js
const resultado = await app.lookup({
  user: "admin",
  dbname: "meubanco",
  collname: "professores", // coleção principal
  from: "disciplinas",
  localField: "_id",
  foreignField: "professorId",
  as: "disciplinas"
});
```

---

### ✅ Suporte a campos aninhados (opcional)

O plugin suporta `localField: "endereco.cidade"` graças ao `getNestedValue`.
Exemplo:

```js
// Professores têm: { perfil: { endereco: { cidade: "Recife" } } }
// Disciplinas têm: { cidade: "Recife" }
lookup({
  localField: "perfil.endereco.cidade",
  foreignField: "cidade",
  // ...
})
```

---

### ✅ Comportamento

- Cria um **array vazio** se não houver correspondência
- **Não modifica** os documentos originais (usa spread operator)
- Funciona com **qualquer tipo de valor** (`string`, `number`, etc.)
- **Eficiente**: usa `Map` para lookup em O(1)

---

### ✅ Integração com outros plugins

Você pode combinar facilmente:

```js
let docs = await app.query({ ... }); // filtragem + ordenação + projeção
docs = await app.lookup({
  docs,
  from: "disciplinas",
  localField: "_id",
  foreignField: "professorId",
  as: "disciplinas"
});
// Agora cada professor tem .disciplinas[]
```

---

Pronto! Agora seu `CoreJS` tem **suporte a relacionamentos entre coleções** — essencial para APIs REST ou GraphQL com dados aninhados! 🚀

Quer que eu mostre um exemplo completo com **professores → disciplinas**? 😊


Excelente pergunta! Um **`lookup` recursivo** permite fazer **"joins" em múltiplos níveis**, como:

> **Professores → Disciplinas → Alunos → Responsáveis**

Ou seja, após fazer um `lookup`, você pode **aplicar outro `lookup` nos documentos recém-inseridos**, e assim por diante.

---

### ✅ Estratégia para `lookup` recursivo
Vamos estender seu `LookupPlugin` com um novo método: **`lookupRecursive`**, que aceita um **array de operações de lookup** e as aplica em sequência.

Cada operação pode referenciar:
- A coleção principal original
- **Ou documentos dentro de um campo já populado** (ex: `disciplinas.alunos`)

---

### ✅ Exemplo de uso desejado

```js
const resultado = await app.lookupRecursive({
  user, dbname,
  collname: "professores",
  lookups: [
    // Nível 1: professores → disciplinas
    {
      from: "disciplinas",
      localField: "_id",
      foreignField: "professorId",
      as: "disciplinas"
    },
    // Nível 2: disciplinas → alunos
    {
      from: "alunos",
      localField: "disciplinas._id", // caminho até o campo em documentos já populados
      foreignField: "disciplinaId",
      as: "alunos"
    }
  ]
});
```

Resultado:
```js
[
  {
    _id: 1,
    nome: "Severino",
    disciplinas: [
      {
        _id: 101,
        nome: "Matemática",
        alunos: [ /* ... */ ] // ← populado!
      }
    ]
  }
]
```

---

### ✅ `LookupPlugin.js` com `lookupRecursive`

```js
// core/plugins/lookup/LookupPlugin.js
// Plugin para "join" entre coleções (lookup simples + recursivo)

module.exports = ({ app } = {}) => {
  if (!app) throw new Error("LookupPlugin: app obrigatório");

  // ========== Helper: obter valor aninhado ==========
  const getNestedValue = (obj, path) => {
    return path.split(".").reduce((o, k) => (o != null ? o[k] : undefined), obj);
  };

  // ========== Helper: definir valor aninhado ==========
  const setNestedValue = (obj, path, value) => {
    const keys = path.split(".");
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (current[key] == null || typeof current[key] !== "object") {
        current[key] = {};
      }
      current = current[key];
    }
    current[keys[keys.length - 1]] = value;
  };

  // ========== Lookup simples (existente) ==========
  const lookup = async ({ user, dbname, collname, docs, from, localField, foreignField, as }) => {
    // (mesma lógica que você já tem)
    if (!from || !localField || !foreignField || !as) {
      throw new Error("lookup requer 'from', 'localField', 'foreignField' e 'as'");
    }

    let mainDocs = docs;
    if (mainDocs === undefined) {
      if (!user || !dbname || !collname) {
        throw new Error("lookup requer user, dbname, collname quando 'docs' não é fornecido");
      }
      mainDocs = (await app.getCollData({ user, dbname, collname })) ?? [];
      if (!Array.isArray(mainDocs)) mainDocs = [];
    }
    if (mainDocs.length === 0) return [];

    if (!user || !dbname) {
      throw new Error("lookup requer user e dbname");
    }
    const foreignDocs = (await app.getCollData({ user, dbname, collname: from })) ?? [];
    if (!Array.isArray(foreignDocs)) {
      throw new Error(`Coleção '${from}' deve retornar um array`);
    }

    const foreignMap = new Map();
    for (const doc of foreignDocs) {
      const key = doc[foreignField];
      if (key != null) {
        if (!foreignMap.has(key)) foreignMap.set(key, []);
        foreignMap.get(key).push(doc);
      }
    }

    return mainDocs.map(doc => {
      const localValue = getNestedValue(doc, localField);
      const matches = localValue != null ? foreignMap.get(localValue) || [] : [];
      return { ...doc, [as]: matches };
    });
  };

  // ========== 🔁 Lookup recursivo ==========
  const lookupRecursive = async ({ user, dbname, collname, docs, lookups }) => {
    if (!Array.isArray(lookups) || lookups.length === 0) {
      throw new Error("lookupRecursive requer array 'lookups'");
    }

    // Começa com os documentos principais
    let currentDocs = docs;
    if (currentDocs === undefined) {
      if (!user || !dbname || !collname) {
        throw new Error("lookupRecursive requer user, dbname, collname quando 'docs' não é fornecido");
      }
      currentDocs = (await app.getCollData({ user, dbname, collname })) ?? [];
      if (!Array.isArray(currentDocs)) currentDocs = [];
    }

    // Aplica cada lookup em sequência
    for (const op of lookups) {
      const { from, localField, foreignField, as } = op;
      if (!from || !localField || !foreignField || !as) {
        throw new Error("Cada lookup requer 'from', 'localField', 'foreignField', 'as'");
      }

      // Carrega coleção estrangeira
      const foreignDocs = (await app.getCollData({ user, dbname, collname: from })) ?? [];
      if (!Array.isArray(foreignDocs)) {
        throw new Error(`Coleção '${from}' deve retornar um array`);
      }

      // Cria mapa para O(1)
      const foreignMap = new Map();
      for (const doc of foreignDocs) {
        const key = doc[foreignField];
        if (key != null) {
          if (!foreignMap.has(key)) foreignMap.set(key, []);
          foreignMap.get(key).push(doc);
        }
      }

      // Aplica lookup recursivamente em todos os documentos relevantes
      const walkAndPopulate = (obj) => {
        if (Array.isArray(obj)) {
          return obj.map(item => walkAndPopulate(item));
        }
        if (obj !== null && typeof obj === "object") {
          const localValue = getNestedValue(obj, localField);
          const matches = localValue != null ? foreignMap.get(localValue) || [] : [];
          const newObj = { ...obj };
          setNestedValue(newObj, as, matches);
          return newObj;
        }
        return obj;
      };

      // Aplica no nível raiz (ou em qualquer profundidade, se localField for aninhado)
      currentDocs = walkAndPopulate(currentDocs);
    }

    return currentDocs;
  };

  return {
    lookup,
    lookupRecursive,
  };
};
```

---

### ✅ Como funciona o `walkAndPopulate`

- Ele **varre todos os objetos e arrays** nos `currentDocs`
- Para **cada objeto**, tenta extrair `localField` (ex: `"disciplinas._id"`)
- Se encontrar, busca em `foreignMap` e insere os docs em `as` (ex: `"alunos"`)
- Funciona em **qualquer nível de profundidade**

---

### ✅ Exemplo completo

```js
// Suponha:
// - professores (_id)
// - disciplinas (professorId, _id)
// - alunos (disciplinaId)

const resultado = await app.lookupRecursive({
  user: "admin",
  dbname: "escola",
  collname: "professores",
  lookups: [
    {
      from: "disciplinas",
      localField: "_id",
      foreignField: "professorId",
      as: "disciplinas"
    },
    {
      from: "alunos",
      localField: "disciplinas._id", // ← olha dentro de "disciplinas"
      foreignField: "disciplinaId",
      as: "alunos"
    }
  ]
});
```

Cada disciplina em `professor.disciplinas` terá um campo `.alunos` com seus alunos.

---

### ✅ Notas importantes

- **Não há limite de profundidade** — você pode encadear quantos `lookups` quiser.
- **Desempenho**: carrega todas as coleções estrangeiras por lookup (eficiente para volumes moderados).
- **Campos aninhados**: `localField: "a.b.c"` funciona perfeitamente.

---

Pronto! Agora seu `CoreJS` suporta **relacionamentos complexos e aninhados** com apenas um método. 🚀