O **VirtualsPlugin** é uma adição fantástica para o seu ecossistema. Ele permite criar campos "fictícios" que não ocupam espaço no seu arquivo JSON, mas que são calculados dinamicamente no momento da leitura.

Isso é ideal para formatar strings, calcular totais ou combinar dados que o seu front-end em **Vue** ou **Tailwind** precisaria processar manualmente.

---

### 🧪 VirtualsPlugin.js

Este plugin percorre os documentos e aplica funções de transformação baseadas em uma configuração de "virtuals".

```javascript
// core/plugins/filters/VirtualsPlugin.js

module.exports = ({ app } = {}) => {
  if (!app) throw new Error("VirtualsPlugin: app é obrigatório");

  /**
   * Aplica campos virtuais aos documentos.
   * * @param {Object} args
   * @param {Array} args.docs - Lista de documentos.
   * @param {Object} args.virtuals - Definição dos campos virtuais.
   * Ex: { nomeCompleto: (doc) => `${doc.nome} ${doc.sobrenome}` }
   */
  const applyVirtuals = async ({ docs, virtuals } = {}) => {
    if (!Array.isArray(docs)) return docs;
    if (!virtuals || typeof virtuals !== "object") return docs;

    const virtualKeys = Object.keys(virtuals);

    // Mapeia os documentos aplicando cada função virtual
    const processedDocs = docs.map(doc => {
      // Criamos uma cópia para não mutar o estado original se necessário
      const newDoc = { ...doc };

      for (const key of virtualKeys) {
        const formula = virtuals[key];
        if (typeof formula === "function") {
          try {
            newDoc[key] = formula(newDoc);
          } catch (err) {
            newDoc[key] = null; // Falha no cálculo
          }
        }
      }
      return newDoc;
    });

    return processedDocs;
  };

  return { applyVirtuals };
};

```

---

### 🛠️ Exemplo de Uso no seu Pipeline

Imagine que você quer criar um campo que mostre o tempo de conta do usuário ou uma string formatada para um crachá.

```javascript
const commands = [
  {
    fnName: "findMany",
    args: {
      user,
      dbname,
      collname: "Users"
    }
  },
  {
    fnName: "applyVirtuals",
    args: {
      virtuals: {
        // Exemplo 1: Label formatada
        label: (doc) => `Usuário: ${doc.nome} (${doc.email})`,
        
        // Exemplo 2: Verificação de segurança (esconde parte do email)
        emailProtegido: (doc) => {
          if (!doc.email) return "";
          const [user, domain] = doc.email.split("@");
          return `${user[0]}***@${domain}`;
        },

        // Exemplo 3: Link de avatar dinâmico
        avatarUrl: (doc) => `https://api.dicebear.com/7.x/avataaars/svg?seed=${doc._id}`
      }
    }
  }
];

```

---

### 🌟 Por que este plugin é poderoso para você?

1. **Limpeza no Front-end**: Em vez de fazer lógica de string no seu componente Vue, você já recebe o dado pronto do CoreJS.
2. **Consistência**: Se você mudar a regra de exibição de um nome, muda apenas no plugin, e todos os lugares que consomem o CoreJS (seja via API ou direto no Node) serão atualizados.
3. **Encadeamento**: Como ele roda sobre o array de `docs`, você pode usá-lo **depois** de um `lookup`. Por exemplo, criar um virtual que depende de dados que vieram da coleção de `Perfis`.

### 💡 Próxima ideia: ValidationPlugin

Já que você tem o **Schema** definido no seu JSON do banco `Quime` (com `type`, `required`, `autoValue`), eu poderia te ajudar a criar o **ValidationPlugin** que lê esse schema e impede que alguém salve um usuário sem nome ou com email inválido.

**Gostaria que eu seguisse para o ValidationPlugin ou prefere testar os Virtuals primeiro?**