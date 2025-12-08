// Exemplo de uso do coreJS
const coreJS = require("./core/coreJS");
const pluginMath = require("./core/plugins/test/plugin-math");

const app = coreJS({});

// 1) Adiciona plugin externo
app.addPlugin(pluginMath);

// 2) Adiciona plugin inline (logging)
app.addPlugin(({ app }) => ({
  log: ({ msg = "" } = {}) => {
    console.log("[LOG]", String(msg));
    return true;
  },
  asyncLog: async ({ msg = "" } = {}) => {
    await new Promise((r) => setTimeout(r, 5));
    console.log("[ASYNC LOG]", String(msg));
    return true;
  },
}));

// 3) Hooks globais via onHook
app.onHook("beforeRun", async (ctx) => {
  console.log(`>> beforeRun hook: chamando ${ctx.fnName} com`, ctx.args);
});

app.onHook("afterRun", async (ctx) => {
  console.log(`<< afterRun hook: ${ctx.fnName} result=`, ctx.result);
});

// 4) addHooks (registro baseado em nome de função)
app.addHooks([
  {
    tipo: "before",
    fnName: "add",
    callback: async (ctx) => {
      console.log(`[addHooks] before add args=`, ctx.args);
    },
  },
  {
    tipo: "after",
    fnName: "squareAsync",
    callback: { fn: "asyncLog", args: { msg: "squareAsync completed" } }, // chama app.asyncLog automaticamente
  },
]);

// 5) Demonstrações de execução
(async () => {
  try {
    // runFunc (async-safe)
    const sum = await app.runFunc("add", { a: 4, b: 6 });
    console.log("sum =>", sum); // 10

    // runFunc com função async do plugin
    const sq = await app.runFunc("squareAsync", { n: 7 });
    console.log("squareAsync =>", sq); // 49

    // runFuncs (sequencial)
    const multiple = await app.runFuncs([
      { fnName: "add", args: { a: 1, b: 2 } },
      { fnName: "mul", args: { a: 3, b: 4 } },
    ]);
    console.log("runFuncs =>", multiple); // [3, 12]

    // runFuncsSafe (allSettled) — inclui um comando inválido para demonstrar rejeição
    const safe = await app.runFuncsSafe([
      { fnName: "add", args: { a: 2, b: 3 } },
    //   { fnName: "doesNotExist", args: {} },
    ]);
    console.log("runFuncsSafe =>", safe);

    // runFuncSync / runFuncsSync (somente para funções sync)
    const syncMul = app.runFuncSync("mul", { a: 5, b: 6 });
    console.log("runFuncSync mul =>", syncMul); // 30

    const syncAll = app.runFuncsSync([
      { fnName: "add", args: { a: 10, b: 20 } },
    ]);
    console.log("runFuncsSync =>", syncAll);

    // buildCmds: parse de string de comandos (usa safeParseObj internamente)
    const cmdsStr =
      "add {a:2, b:3}; squareAsync {n:5}; log {msg:'hello world'}";
    const built = app.buildCmds(cmdsStr);
    console.log("built cmds =>", built);
    // executar os comandos parseados
    const cmdResults = await app.runFuncs(built);
    console.log("cmdResults =>", cmdResults);
  } catch (err) {
    console.error("Erro no exemplo:", err.message);
  }
})();
