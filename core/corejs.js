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
  const app = { options, _hooks: {} };

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
  // HOOKS
  // ---------------------------------------------------------

  app.onHook = (hookName, fn) => {
    if (!app._hooks[hookName]) app._hooks[hookName] = [];
    app._hooks[hookName].push(fn);
    return app;
  };

  app.addHooks = (hooks = []) => {
    if (!Array.isArray(hooks)) {
      throw new Error("addHooks espera um array de hooks");
    }

    hooks.forEach(({ tipo, fnName, callback }) => {
      if (!["before", "after"].includes(tipo)) {
        throw new Error("Tipo de hook inválido. Use 'before' ou 'after'.");
      }
      if (typeof fnName !== "string") {
        throw new Error("fnName deve ser uma string.");
      }

      const hookName = tipo === "before" ? "beforeRun" : "afterRun";

      app.onHook(hookName, async (ctx) => {
        if (ctx.fnName !== fnName) return;

        try {
          // Callback como função
          if (typeof callback === "function") {
            await callback(ctx);
          }
          // Callback como objeto { fn, args }
          else if (typeof callback === "object" && callback.fn) {
            const fnToCall = app[callback.fn];

            if (typeof fnToCall === "function") {
              const args = callback.args || ctx.args;
              await app.smartCall(fnToCall, args);
            } else {
              console.warn(
                `[addHooks] Função '${callback.fn}' não encontrada no app`
              );
            }
          } else {
            console.warn(`[addHooks] Callback inválido para ${fnName}`);
          }
        } catch (err) {
          console.error(
            `[addHooks] Erro no hook ${hookName} para ${fnName}: ${err.message}`
          );
        }
      });
    });

    return app; // Para encadeamento
  };

  /** Executa hooks */
  const runHook = async (hookName, ctx) => {
    const hooks = app._hooks[hookName] || [];
    for (const fn of hooks) {
      await app.smartCall(fn, ctx);
    }
  };
  // ---------------------------------------------------------
  // EXECUÇÃO INTELIGENTE (ASSÍNCRONA)
  // ---------------------------------------------------------

  app.runFunc = async (fnName, args = {}) => {
    const fn = app[fnName];
    if (typeof fn !== "function") {
      throw new Error(`Função '${fnName}' não encontrada no CoreJS.`);
    }

    const ctx = { fnName, args, app };

    await runHook("beforeRun", ctx);

    let result;
    try {
      result = await app.smartCall(fn, args);
    } catch (err) {
      throw new Error(`Erro ao executar '${fnName}': ${err.message}`);
    }

    await runHook("afterRun", { ...ctx, result });

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
      // Coloca aspas nas chaves não-quoted
      let fixed = str.replace(/(\w+)\s*:/g, '"$1":');
      // Substitui aspas simples por duplas
      fixed = fixed.replace(/'/g, '"');
      // Parse JSON seguro
      return JSON.parse(fixed);
    } catch (err) {
      throw new Error("Não foi possível parsear a string para objeto: " + str);
    }
  };

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
