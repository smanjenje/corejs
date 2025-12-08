// Exemplo de uso do coreJS
const coreJS = require("./core/coreJS");
const UtilsPlugin = require("./core/plugins/utils/UtilsPlugin");
const DatePlugin = require("./core/plugins/utils/DatePlugin");
const CachePlugin = require("./core/plugins/utils/CachePlugin");
const FSPlugin = require("./core/plugins/utils/FSPlugin");
const SchemaPlugin = require("./core/plugins/prepare/SchemaPlugin");
const CollMapIndexPlugin = require("./core/plugins/indexMap/CollMapIndexPlugin");
const DocsIndexPlugin = require("./core/plugins/indexMap/DocsIndexPlugin");
const PrepareDocPlugin = require("./core/plugins/prepare/PrepareDocPlugin");

const DBPlugin = require("./core/plugins/CRUD/DBPlugin");
const CollPlugin = require("./core/plugins/CRUD/CollPlugin");
const DocPlugin = require("./core/plugins/CRUD/DocPlugin");

const app = coreJS({ root: "./mydb" });
app.addPlugins([
  UtilsPlugin,
  DatePlugin,
  FSPlugin,
  SchemaPlugin,
  PrepareDocPlugin,
  CachePlugin,
  CollMapIndexPlugin,
  DocsIndexPlugin,
  DBPlugin,
  CollPlugin,
  DocPlugin,
]);

// 5) Demonstrações de execução
(async () => {
  try {
    const commands = [
      {
        fnName: "createDB",
        args: { user: "admin", dbname: "meubanco" },
      },
      {
        fnName: "createColl",
        args: {
          user: "admin",
          dbname: "meubanco",
          collname: "disciplinas",
          schema: {
            nome: { type: "string", required: true },
          },
        },
      },
      {
        fnName: "insertDoc",
        args: {
          user: "admin",
          dbname: "meubanco",
          collname: "disciplinas",
          doc: {
            nome: "Severino",
          },
        },
      },
      {
        fnName: "getDB",
        args: { user: "admin", dbname: "meubanco" },
      },
    ];

    // Executa todas as funções em ordem
    const results = await app.runFuncs(commands);

    console.log("Resultados das execuções:");

    console.dir(results, { depth: null, colors: true });

    // Se quiser, pode extrair os resultados individuais
    const dbResult = results[2];
    console.log("DB completo:");
    console.dir(dbResult, { depth: null, colors: true });
  } catch (err) {
    console.error("Erro no exemplo:", err.message);
  }
})();
