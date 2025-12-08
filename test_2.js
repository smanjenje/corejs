// ================================
// Exemplo de uso do CoreJS
// ================================

const coreJS = require("./core/coreJS");

// Plugins utilitários
const UtilsPlugin = require("./core/plugins/utils/UtilsPlugin");
const DatePlugin = require("./core/plugins/utils/DatePlugin");
const CachePlugin = require("./core/plugins/utils/CachePlugin");
const FSPlugin = require("./core/plugins/utils/FSPlugin");

// Plugins de preparação e schema
const SchemaPlugin = require("./core/plugins/prepare/SchemaPlugin");
const PrepareDocPlugin = require("./core/plugins/prepare/PrepareDocPlugin");

// Plugins de indexação
const CollMapIndexPlugin = require("./core/plugins/indexMap/CollMapIndexPlugin");
const DocsIndexPlugin = require("./core/plugins/indexMap/DocsIndexPlugin");

// Plugins de CRUD
const DBPlugin = require("./core/plugins/CRUD/DBPlugin");
const CollPlugin = require("./core/plugins/CRUD/CollPlugin");
const DocPlugin = require("./core/plugins/CRUD/DocPlugin");
const FilterPlugin = require("./core/plugins/filters/FilterPlugin");

// ================================
// Inicializa CoreJS
// ================================
const app = coreJS({ root: "./mydb" });

// Adiciona plugins na ordem correta
app.addPlugins([
  UtilsPlugin,
  DatePlugin,
  FSPlugin,
  SchemaPlugin, // necessário antes do PrepareDocPlugin
  PrepareDocPlugin, // prepara/valida documentos
  CachePlugin,
  CollMapIndexPlugin,
  DocsIndexPlugin,
  FilterPlugin,
  DBPlugin,
  CollPlugin,
  DocPlugin,
]);

// ================================
// Função principal de demonstração
// ================================
(async () => {
  try {
    // Lista de comandos a executar sequencialmente
    const commands = [
      // Cria banco de dados
      // {
      //   fnName: "createDB",
      //   args: { user: "admin", dbname: "meubanco" },
      // },
      // Cria coleção com schema
      // {
      //   fnName: "createColl",
      //   args: {
      //     user: "admin",
      //     dbname: "meubanco",
      //     collname: "professores",
      //     schema: {
      //       nome: { type: "string", required: true },
      //     },
      //   },
      // },
      // Insere documento na coleção
      // {
      //   fnName: "insertDoc",
      //   args: {
      //     user: "admin",
      //     dbname: "meubanco",
      //     collname: "professores",
      //     doc: { nome: "Severino" },
      //   },
      // },
      {
        fnName: "findMany",
        args: {
          user: "admin",
          dbname: "meubanco",
          collname: "professores",
          queries: [
            { nome: { contains: "Severino2" } },
            { nome: { contains: "Severino4" } },
          ],
        },
      },

      // preparar documento na coleção
      // {
      //   fnName: "prepareDoc",
      //   args: {
      //     user: "admin",
      //     dbname: "meubanco",
      //     collname: "professores",
      //     document: { nome: "Severino" },
      //   },
      // },
      // Recupera informações do banco de dados
      // {
      //   fnName: "truncateColl",
      //   args: { user: "admin", dbname: "meubanco", collname: "professores" },
      // },
      // Recupera informações do banco de dados
      // {
      //   fnName: "getCollMeta",
      //   args: { user: "admin", dbname: "meubanco", collname: "professores" },
      // },
       {
        fnName: "queryByIndex",
        args: {
          user: "admin",
          dbname: "meubanco",
          collname: "professores",
          field: "nome",
          value: "Severino2",
        },
      },
    ];

    // Executa os comandos sequencialmente via runFuncs
    const results = await app.runFuncs(commands);

    console.log("=== Resultados das execuções ===");
    console.dir(results, { depth: null, colors: true });

  } catch (err) {
    console.error("Erro no exemplo:", err.message);
  }
})();

/* 
{
    user: "user1",
    dbname: "db1",
    collname: "coll1",
    queries: [
      { nome: { contains: "Severino2" } },
      { nome: { contains: "Severino4" } }
    ]
  }
*/
