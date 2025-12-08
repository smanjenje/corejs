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
const PaginationPlugin = require("./core/plugins/filters/PaginationPlugin");
const OrdenationPlugin = require("./core/plugins/filters/OrdenationPlugin");
const FieldsProjectPlugin = require("./core/plugins/filters/FieldsProjectPlugin");
const QueryPlugin = require("./core/plugins/filters/QueryPlugin");

// ================================
// Inicializa CoreJS
// ================================
const app = coreJS({ root: "./mydb" });

// Adiciona plugins na ordem correta
app.addPlugins([
  UtilsPlugin,
  DatePlugin,
  FSPlugin,
  SchemaPlugin,
  PrepareDocPlugin,
  CachePlugin,
  CollMapIndexPlugin,
  DocsIndexPlugin,
  FilterPlugin,
  PaginationPlugin,
  OrdenationPlugin,
  FieldsProjectPlugin,
  QueryPlugin,
  DBPlugin,
  CollPlugin,
  DocPlugin, // depende de app.findMany
]);

const user = "admin",
  dbname = "meubanco",
  collname = "professores";

const logResults = (results) => {
  console.log("=== Resultados das execuções ===");
  for (let i = 0; i < results.length; i++) {
    console.log(`--- Resultado do comando ${i + 1} ---`);
    console.dir(results[i], { depth: null, colors: true });
  }
};

// ================================
// Função principal de demonstração
// ================================
// (async () => {
//   try {
//     const filteredDocs = await app.findMany({
//       user,
//       dbname,
//       collname,
//       queries: [{ nome: { $regex: "^Severino[2-4]$", $options: "i" } }],
//     });

//     const commands = [

//       {
//         fnName: "sort",
//         args: { user, dbname, collname, orderBy: ["_id"], direction: ["desc"] },
//       },

//       {
//         fnName: "sort",
//         args: {
//           docs: filteredDocs,
//           orderBy: {"_id": "desc"},

//         },
//       },
//     ];

//     const results = await app.runFuncs(commands);
//     logResults(results);
//   } catch (err) {
//     console.error("Erro no exemplo:", err.message);
//   }
// })();

(async () => {
  try {
    const filteredDocs = await app.findMany({
      user,
      dbname,
      collname,
      queries: [{ nome: { $regex: "^Severino[2-4]$", $options: "i" } }],
    });

    const commands = [
      // ✅ 1. Ordenar TODOS os documentos da coleção (sem docs)
      // {
      //   fnName: "sort",
      //   args: {
      // user,
      // dbname,
      // collname,
      //     orderBy: { _id: "desc" }, // ← formato de objeto
      //   },
      // },

      // // ✅ 2. Ordenar só os filtrados (com docs)
      // {
      //   fnName: "sort",
      //   args: {
      //     docs: filteredDocs,
      //     orderBy: { _id: "desc" }, // ← mesmo formato
      //   },
      // },
      // // ✅ 3. Projetar campos específicos nos documentos filtrados
      // {
      //   fnName: "project",
      //   args: {
      //     docs: filteredDocs,
      //     fields: ["_id", "nome"],
      //   },
      // },

      // // ✅ 3. Projetar campos específicos na coleção inteira
      // {
      //   fnName: "project",
      //   args: {
      //     user,
      //     dbname,
      //     collname,
      //     fields: ["_id", "nome"],
      //   },
      // },
      {
        fnName: "query",
        args: {
          user,
          dbname,
          collname,
          orderBy: { _id: "desc" },
          
          queries: [{ nome: { $regex: "^Severino[2-4]$", $options: "i" } }],
          fields: ["_id", "nome"],
          page: 1,
          limit: 2,
        },
      },
    ];

    const results = await app.runFuncs(commands);
    logResults(results);
  } catch (err) {
    console.error("Erro no exemplo:", err.message);
  }
})();
// Se quiser adicionar paginação, ordenação ou projeção de campos
