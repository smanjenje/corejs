Excelente ideia! Um **`JoinPlugin`** que emule **`JOIN` do MySQL** (especificamente **`INNER JOIN`**, **`LEFT JOIN`**, etc.) é uma ótima adição ao seu ecossistema `CoreJS`.

Vamos criar um plugin **simples, poderoso e compatível** com seus plugins existentes, usando **`LookupPlugin` como base**, mas com uma **interface mais familiar para quem vem do SQL**.

---

### ✅ Objetivo: Interface estilo MySQL

```js
// INNER JOIN
app.join({
  user, dbname,
  from: "pedidos",          // tabela "principal"
  join: "clientes",         // tabela a juntar
  on: {                     // condição de junção
    "pedidos.clienteId": "clientes._id"
  },
  type: "inner" // ou "left"
})
```

Resultado:

```js
[
  {
    ...pedido,
    clientes: [ /* cliente correspondente */ ] // ou null se LEFT JOIN
  }
]
```

---

### ✅ `core/plugins/join/JoinPlugin.js`

```js
// core/plugins/join/JoinPlugin.js
// Emula JOIN do MySQL usando LookupPlugin como base

module.exports = ({ app } = {}) => {
  if (!app) throw new Error("JoinPlugin: app obrigatório");

  /**
   * Realiza JOIN entre coleções (como no MySQL).
   * @param {Object} params
   * @param {string} params.user
   * @param {string} params.dbname
   * @param {string} params.from - coleção principal (ex: "pedidos")
   * @param {string} params.join - coleção a juntar (ex: "clientes")
   * @param {Object} params.on - condição de junção { "local.campo": "foreign.campo" }
   * @param {string} [params.type="inner"] - "inner" | "left"
   * @param {string} [params.as] - nome do campo de resultado (padrão: nome da coleção join)
   * @returns {Promise<Array>}
   */
  const join = async ({ user, dbname, from, join, on, type = "inner", as }) => {
    // Validação
    if (!from || !join || !on) {
      throw new Error("join requer 'from', 'join' e 'on'");
    }
    if (type !== "inner" && type !== "left") {
      throw new Error("join suporta apenas type: 'inner' ou 'left'");
    }
    const asField = as || join;

    // Carrega documentos das duas coleções
    const mainDocs = (await app.getCollData({ user, dbname, collname: from })) ?? [];
    const foreignDocs = (await app.getCollData({ user, dbname, collname: join })) ?? [];

    if (!Array.isArray(mainDocs) || !Array.isArray(foreignDocs)) {
      throw new Error("Coleções devem retornar arrays");
    }

    // Extrai os campos da condição "on"
    const [localPath, foreignPath] = Object.keys(on);
    const localField = localPath.split(".").pop(); // ex: "clienteId"
    const foreignField = foreignPath.split(".").pop(); // ex: "_id"

    // Cria mapa de índices para lookup O(1)
    const foreignMap = new Map();
    for (const doc of foreignDocs) {
      const key = doc[foreignField];
      if (key != null) {
        if (!foreignMap.has(key)) foreignMap.set(key, []);
        foreignMap.get(key).push(doc);
      }
    }

    // Aplica o JOIN
    const result = [];
    for (const mainDoc of mainDocs) {
      const localValue = mainDoc[localField];
      const matches = localValue != null ? foreignMap.get(localValue) || [] : [];

      if (type === "inner" && matches.length === 0) {
        continue; // ignora se não há correspondência
      }

      const joinedDoc = { ...mainDoc };
      joinedDoc[asField] = type === "left" && matches.length === 0 ? null : matches;
      result.push(joinedDoc);
    }

    return result;
  };

  return { join };
};
```

---

### ✅ Como usar

#### 1. **INNER JOIN** (só registros com correspondência)

```js
const resultado = await app.join({
  user: "admin",
  dbname: "loja",
  from: "pedidos",
  join: "clientes",
  on: { "pedidos.clienteId": "clientes._id" },
  type: "inner"
});
```

#### 2. **LEFT JOIN** (todos os registros da esquerda + correspondência ou null)

```js
const resultado = await app.join({
  user: "admin",
  dbname: "loja",
  from: "pedidos",
  join: "clientes",
  on: { "pedidos.clienteId": "clientes._id" },
  type: "left",
  as: "clienteInfo" // campo de saída
});
```

Resultado (LEFT JOIN):

```js
[
  {
    _id: 1,
    clienteId: 101,
    // ... outros campos de pedido
    clienteInfo: [ { _id: 101, nome: "Ana" } ]
  },
  {
    _id: 2,
    clienteId: 999, // não existe em clientes
    clienteInfo: null
  }
]
```

---

### ✅ Vantagens sobre o `LookupPlugin`

| Característica         | `LookupPlugin`                 | `JoinPlugin`                         |
| ----------------------- | -------------------------------- | -------------------------------------- |
| **Interface**     | `{ localField, foreignField }` | `{ "local.campo": "foreign.campo" }` |
| **Familiaridade** | Estilo MongoDB                   | Estilo MySQL/SQL                       |
| **Tipo de JOIN**  | Sempre LEFT (com array vazio)    | Escolha:`inner` ou `left`          |
| **Nome do campo** | Exige `as`                     | Padrão: nome da coleção             |

---

### ✅ Registro do plugin

```js
app.addPlugins([
  // ... outros plugins
  JoinPlugin
]);
```

---

### ✅ Relação com `LookupPlugin`

Este `JoinPlugin` é um **wrapper de alto nível** sobre a mesma lógica do `LookupPlugin`, mas com:

- **Interface mais intuitiva para devs SQL**
- **Controle explícito sobre o tipo de JOIN**
- **Mapeamento de campos explícito**

Se quiser, posso adaptar para usar **`app.lookup` internamente** — mas como ele depende do mesmo `getCollData`, é mais eficiente reimplementar a lógica diretamente.

---

### 🚀 Exemplo completo com seus dados

```js
// Suponha:
// - pedidos: [ { _id: 1, clienteId: 1, produto: "Notebook" } ]
// - clientes: [ { _id: 1, nome: "Ana" } ]

const resultado = await app.join({
  user: "admin",
  dbname: "loja",
  from: "pedidos",
  join: "clientes",
  on: { "pedidos.clienteId": "clientes._id" },
  type: "inner"
});

// Resultado:
// [ { _id: 1, clienteId: 1, produto: "Notebook", clientes: [ { _id: 1, nome: "Ana" } ] } ]
```

---

Pronto! Agora você tem um **`JoinPlugin` estilo MySQL**, perfeito para quem prefere uma abordagem mais relacional. 🎯

Quer que eu adicione suporte a **`RIGHT JOIN`** ou **`FULL OUTER JOIN`**? (Embora sejam mais raros em bancos de documentos!) 😊
