// coreJS.js - Versão segura com safeParseObj
// Framework modular com plugins, hooks e execução inteligente

/**
 * @typedef {Object} CoreApp
 * @property {Object} options
 * @property {(plugin: Function) => CoreApp} addPlugin
 * @property {(plugins: Function[]) => CoreApp} addPlugins
 * @property {(hookName: string, fn: Function) => CoreApp} onHook
 * @property {(fnName: string, args?: Object) => Promise<any>} runFunc
 * @property {(funcArray: { fnName: string, args?: Object }[]) => Promise<any[]>} runFuncs
 * @property {(funcArray: { fnName: string, args?: Object }[]) => Promise<PromiseSettledResult<any>[]>} runFuncsSafe
 * @property {(fnName: string, args?: Object) => any} runFuncSync
 * @property {(funcArray: { fnName: string, args?: Object }[]) => any[]} runFuncsSync
 * @property {(cmdsStr: string) => any[]} prepareCmds
 * @property {(cmd: any) => { fnName: string, args: any }} buildCmd
 * @property {(cmds: string) => any[]} buildCmds
 */

const coreJS = (options = {}) => {
  /** @type {CoreApp} */
  const app = { options };

  app.pluginsNames = {};

  // ---------------------------------------------------------
  // UTILIDADES INTERNAS
  // ---------------------------------------------------------
  app.normalizeArray = (val) => (Array.isArray(val) ? val : [val]);
  /** Detecta se a função deve ser chamada como async */
  app.isAsync = (fn, result) =>
    fn.constructor.name === "AsyncFunction" ||
    (result && typeof result.then === "function");

  /** Executa função automaticamente como sync ou async */
  app.smartCall = async (fn, args = {}) => {
    try {
      const result = fn(args);
      return app.isAsync(fn, result) ? await result : result;
    } catch (err) {
      throw new Error("Erro interno ao executar função: " + err.message);
    }
  };

  // ---------------------------------------------------------
  // PLUGINS
  // ---------------------------------------------------------

  app.addPlugin = (plugin) => {
    if (typeof plugin !== "function") {
      throw new Error("Plugin deve ser uma função.");
    }

    const pluginAPI = plugin({ app, options });

    if (!pluginAPI || typeof pluginAPI !== "object") {
      throw new Error("Plugin deve retornar um objeto com funções.");
    }

    // Anexa cada função ao app
    for (const [key, value] of Object.entries(pluginAPI)) {
      if (key in app) {
        console.warn(`⚠ Aviso: sobrescrevendo função existente: ${key}`);
      }
      app[key] = value;
    }

    return app;
  };

  app.addPlugins = (plugins = []) => {
    plugins.forEach((p) => app.addPlugin(p));
    return app;
  };

  // ---------------------------------------------------------
  // SISTEMA DE HOOKS (Mapa de Métodos)
  // ---------------------------------------------------------

  /** Mapa de execução: { "fnName": { before: [], after: [] } } */
  // coreJS.js -> Seção de Hooks

  app._hookMap = {}; // O mapa dinâmico

  app.addHooks = (hooks = []) => {
    if (!Array.isArray(hooks)) return app;

    hooks.forEach(({ tipo, fnName, callback }) => {
      // 1. Inicializa o mapa para a função alvo
      if (!app._hookMap[fnName]) {
        app._hookMap[fnName] = { before: [], after: [] };
      }

      const fase = tipo === "before" ? "before" : "after";
      let executor;

      // Caso A: O plugin passou uma função diretamente
      if (typeof callback === "function") {
        executor = callback;
      }
      // Caso B: O plugin passou um objeto { fn: "nomeDaFuncao" }
      else if (typeof callback === "object" && callback.fn) {
        // Criamos o executor "Preguiçoso" (Lazy)
        executor = async (ctx) => {
          // A função é buscada no app apenas NESTE momento (na execução)
          const fnDoPlugin = app[callback.fn];

          if (typeof fnDoPlugin !== "function") {
            // Se a função não existe nem na hora de rodar, apenas ignora
            return;
          }

          const payload = {
            ...ctx.args,
            ...(callback.args || {}),
            result: ctx.result,
            fnName: ctx.fnName,
          };
          return await app.smartCall(fnDoPlugin, payload);
        };

        // Nomeia para o seu debug ficar bonito como no log que você postou
        Object.defineProperty(executor, "name", {
          value: `hook_${fase}_${callback.fn}`,
        });
      }

      if (executor) {
        app._hookMap[fnName][fase].push(executor);
      }
    });

    return app;
  };

  app.runFunc = async (fnName, args = {}) => {
    const fn = app[fnName];
    if (typeof fn !== "function") {
      throw new Error(`Função '${fnName}' não encontrada no CoreJS.`);
    }

    // Contexto base da execução
    const ctx = { fnName, args, app };
    const hooks = app._hookMap[fnName];

    // 1. Executa Métodos "Before" (Pré-processamento/Validação)
    if (hooks?.before?.length) {
      for (const hookFn of hooks.before) {
        await hookFn(ctx);
      }
    }

    // 2. Executa a Função Principal do Banco/Sistema
    let result;
    try {
      result = await app.smartCall(fn, args);
    } catch (err) {
      throw new Error(`Erro ao executar '${fnName}': ${err.message}`);
    }

    // 3. Executa Métodos "After" (Auditoria/Campos Virtuais/Transformação)
    if (hooks?.after?.length) {
      const afterCtx = { ...ctx, result };
      for (const hookFn of hooks.after) {
        // O resultado pode ser modificado por referência se for um objeto
        await hookFn(afterCtx);
      }
    }

    return result;
  };

  app.runFuncs = async (arr = []) => {
    const out = [];
    for (const { fnName, args = {} } of arr) {
      out.push(await app.runFunc(fnName, args));
    }
    return out;
  };

  app.runFuncsSafe = async (arr = []) => {
    return Promise.allSettled(
      arr.map(({ fnName, args = {} }) => app.runFunc(fnName, args))
    );
  };

  // ---------------------------------------------------------
  // EXECUÇÕES SÍNCRONAS
  // ---------------------------------------------------------

  app.runFuncSync = (fnName, args = {}) => {
    const fn = app[fnName];
    if (typeof fn !== "function") {
      throw new Error(`Função '${fnName}' não encontrada.`);
    }
    return fn(args);
  };

  app.runFuncsSync = (arr = []) => {
    return arr.map(({ fnName, args = {} }) => {
      const fn = app[fnName];
      if (typeof fn !== "function") {
        throw new Error(`Função '${fnName}' não encontrada.`);
      }
      return fn(args);
    });
  };

  // ---------------------------------------------------------
  // PARSE DE COMANDOS SEGURO
  // ---------------------------------------------------------

  /** Converte string de objeto para JS sem usar eval */
  const safeParseObj = (str) => {
    if (!str || typeof str !== "string") return {};
    try {
      // 1. Envolve chaves não citadas com aspas duplas
      // 2. Transforma aspas simples em duplas
      let prepared = str
        .replace(/([{,])\s*(\w+)\s*:/g, '$1"$2":')
        .replace(/'/g, '"');

      // Remove vírgulas extras antes de fechar chaves/colchetes (comum em JS, proibido em JSON)
      prepared = prepared.replace(/,\s*([}\]])/g, "$1");

      return JSON.parse(prepared);
    } catch (err) {
      // Se falhar, tenta uma abordagem via Function (mais flexível, mas ainda isolada)
      try {
        return new Function(`return (${str})`)();
      } catch (e) {
        throw new Error("Erro de sintaxe no objeto DSL: " + str);
      }
    }
  };
  // const safeParseObj = (str) => {
  //   if (!str || typeof str !== "string") return {};
  //   try {
  //     // Coloca aspas nas chaves não-quoted
  //     let fixed = str.replace(/(\w+)\s*:/g, '"$1":');
  //     // Substitui aspas simples por duplas
  //     fixed = fixed.replace(/'/g, '"');
  //     // Parse JSON seguro
  //     return JSON.parse(fixed);
  //   } catch (err) {
  //     throw new Error("Não foi possível parsear a string para objeto: " + str);
  //   }
  // };

  app.prepareCmds = (cmdsStr) => {
    if (!cmdsStr || typeof cmdsStr !== "string") return [];
    return cmdsStr
      .replace(/[\n\r\t]/g, "")
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  };

  app.buildCmd = (cmd) => {
    if (typeof cmd === "string") {
      const match = cmd.match(/^(\w+)\s*(.*)$/);
      if (!match) throw new Error("Comando inválido: " + cmd);

      const fnName = match[1];
      const argsText = match[2].trim();
      let args = {};

      if (argsText) {
        args = safeParseObj(argsText);
      }

      return { fnName, args };
    }

    if (typeof cmd === "object" && cmd !== null) {
      const fnName = Object.keys(cmd)[0];
      return { fnName, args: cmd[fnName] || {} };
    }

    throw new Error("Formato de comando inválido.");
  };

  app.buildCmds = (cmds) => {
    return app.prepareCmds(cmds).map((cmd) => app.buildCmd(cmd));
  };

  return app;
};

// Export compatível CommonJS e alguns bundlers que usam .default
module.exports = coreJS;
module.exports.default = coreJS;
