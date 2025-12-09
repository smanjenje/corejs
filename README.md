

# 🧠 CoreJS  
**Uma mini biblioteca modular para construção de aplicações JavaScript com plugins, hooks e execução inteligente (síncrona/assíncrona).**

> Criado por **Severino Victorino**  
> Versão 0.1.

---

## ✨ Recursos

- 🔌 **Sistema de plugins** extensível  
- 🪝 **Hooks** (`beforeRun` / `afterRun`) com suporte a callbacks programáveis  
- ⚡ **Execução inteligente**: detecta automaticamente se uma função é assíncrona  
- 🛡️ **Modo seguro**: `runFuncsSafe` com `Promise.allSettled` para evitar falhas em lote  
- 💬 **Parser seguro de comandos**: transforma strings como `"salvar { id: 1, nome: 'teste' }"` em objetos válidos **sem `eval`**  
- 🔁 Suporte a execução **síncrona e assíncrona**  
- 🔗 **Encadeamento de métodos** para uma API fluente

---

## 📦 Instalação

```bash
npm install corejs-mini  # (ou o nome do seu pacote, se publicado)
```

Ou inclua diretamente o arquivo `coreJS.js` no seu projeto.

---

## 🚀 Uso Básico

```js
const coreJS = require('./coreJS');

// Cria uma instância
const app = coreJS({ debug: true });

// Adiciona um plugin
app.addPlugin(({ app }) => ({
  saudar: ({ nome }) => `Olá, ${nome}!`,
  salvar: async ({ id, nome }) => {
    // simula operação assíncrona
    await new Promise(r => setTimeout(r, 100));
    return { id, nome, salvo: true };
  }
}));

// Executa uma função
const msg = app.runFuncSync('saudar', { nome: 'User' });
console.log(msg); // "Olá, User!"

// Executa assincronamente
const resultado = await app.runFunc('salvar', { id: 42, nome: 'Alice' });
console.log(resultado); // { id: 42, nome: 'Alice', salvo: true }
```

---

## 🔌 Plugins

Plugins são funções que recebem `{ app, options }` e devolvem um objeto com métodos a serem injetados no app.

```js
const meuPlugin = ({ app }) => ({
  duplicar: ({ valor }) => valor * 2,
  logar: ({ msg }) => console.log('[LOG]', msg)
});

app.addPlugin(meuPlugin);
```

---

## 🪝 Hooks

Registre lógica para rodar **antes ou depois** da execução de qualquer função.

### Com `onHook`

```js
app.onHook('beforeRun', ({ fnName, args }) => {
  console.log(`Executando ${fnName} com`, args);
});
```

### Com `addHooks` (modo declarativo)

```js
app.addHooks([
  {
    tipo: 'before',
    fnName: 'salvar',
    callback: ({ args }) => console.log('Salvando:', args)
  },
  {
    tipo: 'after',
    fnName: 'salvar',
    callback: { fn: 'logar', args: { msg: 'Salvo com sucesso!' } }
  }
]);
```

---

## 📜 Execução por Comandos de Texto

Você pode executar funções a partir de strings — útil para scripts, configurações ou DSLs.

```js
const cmds = "saudar { nome: 'João' }; salvar { id: 10, nome: 'João' }";

const comandos = app.buildCmds(cmds);
// → [{ fnName: 'saudar', args: { nome: 'João' } }, ...]

const resultados = await app.runFuncs(comandos);
```

> ✅ O parser `safeParseObj` **não usa `eval`**. Ele corrige automaticamente chaves sem aspas e converte aspas simples → duplas.

---

## 🧪 Métodos Disponíveis

| Método | Descrição |
|-------|----------|
| `addPlugin(fn)` | Registra um plugin |
| `addPlugins([fn1, fn2])` | Registra múltiplos plugins |
| `onHook(nome, fn)` | Registra um hook manual |
| `addHooks([...])` | Registra hooks declarativos |
| `runFunc(nome, args?)` | Executa função **assíncrona** |
| `runFuncs([{ fnName, args }])` | Executa múltiplas funções em sequência |
| `runFuncsSafe([...])` | Executa com `Promise.allSettled` (seguro) |
| `runFuncSync(nome, args?)` | Executa **síncrona** |
| `runFuncsSync([...])` | Executa múltiplas sincronamente |
| `buildCmds(string)` | Transforma string em lista de comandos |
| `prepareCmds(string)` | Divide string em comandos brutos |
| `buildCmd(cmd)` | Normaliza um comando (string ou objeto) |

---

## ⚠️ Segurança

- **Nunca use `eval`** — o parser `safeParseObj` é baseado em regex + `JSON.parse`.
- Validação rigorosa de tipos para evitar injeções acidentais.
- Hooks e plugins rodam em contexto isolado (`{ fnName, args, app, result? }`).

---

## 📄 Licença

MIT © Severino Victorino

---

> 💡 **Dica**: Combine com plugins de logging, validação, cache ou I/O para criar micro-frameworks poderosos!


