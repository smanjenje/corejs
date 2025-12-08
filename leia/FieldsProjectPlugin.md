Perfeito! Você quer que a **projeção use um array de nomes de campos**, assim:

```js
fields: ["nome", "_id"]
```

Isso é mais simples, limpo e evita a ambiguidade de `1`/`0`.

Vou reescrever o `FieldsProjectPlugin` para usar **exatamente esse formato**, mantendo o mesmo padrão dos outros plugins:

- Se `docs` for fornecido → projeta ele
- Senão → carrega com `app.getCollData`
- `fields` é um **array de strings** com os campos a **incluir**
- Suporta campos aninhados (ex: `"endereco.rua"`)

---

### ✅ `core/plugins/projection/FieldsProjectPlugin.js` — com `fields: [...]`

```js
// core/plugins/projection/FieldsProjectPlugin.js
// Plugin de projeção por lista de campos: fields: ["nome", "_id"]

module.exports = ({ app } = {}) => {
  if (!app) throw new Error("FieldsProjectPlugin: app obrigatório");

  /**
   * Projeta apenas os campos especificados.
   * @param {Object} params
   * @param {string} [params.user]
   * @param {string} [params.dbname]
   * @param {string} [params.collname]
   * @param {Array} [params.docs] - documentos a projetar
   * @param {string[]} [params.fields] - ex: ["nome", "_id"]
   * @returns {Promise<Array>} documentos com apenas os campos selecionados
   */
  const project = async ({ user, dbname, collname, docs, fields } = {}) => {
    let allDocs;

    if (docs !== undefined) {
      allDocs = Array.isArray(docs) ? docs : [];
    } else {
      if (!user || !dbname || !collname) {
        throw new Error("project requer user, dbname e collname quando 'docs' não é fornecido");
      }
      allDocs = (await app.getCollData({ user, dbname, collname })) ?? [];
      if (!Array.isArray(allDocs)) {
        throw new Error("app.getCollData deve retornar um array");
      }
    }

    // Se não houver fields ou for vazio, retorna tudo
    if (!fields || !Array.isArray(fields) || fields.length === 0) {
      return allDocs;
    }

    // Remove espaços extras (ex: "_id " → "_id")
    const cleanFields = fields.map(f => String(f).trim());

    // Helper: obter valor aninhado
    const getNestedValue = (obj, path) => {
      return path.split(".").reduce((o, k) => (o != null ? o[k] : undefined), obj);
    };

    // Helper: definir valor aninhado no novo objeto
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

    return allDocs.map(doc => {
      const newDoc = {};
      for (const path of cleanFields) {
        if (path === "") continue;
        const value = getNestedValue(doc, path);
        if (value !== undefined) {
          setNestedValue(newDoc, path, value);
        }
      }
      return newDoc;
    });
  };

  return { project };
};
```

---

### ✅ Como usar (exatamente como você quer):

```js
const resultado = await app.project({
  docs: meusDocumentos,
  fields: ["nome", "_id"]
});
// → [{ _id: 1, nome: "Severino1" }, ...]
```

Ou com campos aninhados:

```js
// Documento: { perfil: { email: "x@y.com", idade: 30 }, _id: 1 }
const resultado = await app.project({
  docs: [doc],
  fields: ["_id", "perfil.email"]
});
// → [{ _id: 1, perfil: { email: "x@y.com" } }]
```

Ou carregando direto da coleção:

```js
const resultado = await app.project({
  user: "admin",
  dbname: "meubanco",
  collname: "professores",
  fields: ["nome"]
});
```

---

### ✅ Comportamento

- Apenas os campos em `fields` são incluídos
- Campos não existentes são **ignorados** (não geram erro)
- Espaços em branco nos nomes são **removidos** (ex: `" _id "` vira `"_id"`)
- Suporta **qualquer nível de aninhamento**

---

Agora sim: **simples, previsível e no seu estilo**! ✅

Quer testar com seu exemplo? Bastaria fazer:

```js
const commands = [
  {
    fnName: "project",
    args: {
      docs: filteredDocs,
      fields: ["nome", "_id"]
    }
  }
];
```
