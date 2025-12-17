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
// filtros
const FilterPlugin = require("./core/plugins/filters/FilterPlugin");
const QueryPlugin = require("./core/plugins/filters/QueryPlugin");

// joins
const PopulatePlugin = require("./core/plugins/joins/PopulatePlugin");
const LookupPlugin = require("./core/plugins/joins/LookupPlugin");
const GroupPlugin = require("./core/plugins/joins/GroupPlugin");

// ================================
// Inicializa CoreJS
// ================================
const app = coreJS({ root: "./mydb" });

// Adiciona plugins na ordem correta
app.addPlugins([
  // utilitários
  UtilsPlugin,
  DatePlugin,
  FSPlugin,
  CachePlugin,
  //  preparação e schema
  SchemaPlugin,
  PrepareDocPlugin,

  //   indexação
  CollMapIndexPlugin,
  DocsIndexPlugin,

  // filtros
  FilterPlugin,
  QueryPlugin,

  // CRUDs
  DBPlugin,
  CollPlugin,
  DocPlugin, // depende de app.findMany
  // joins
  PopulatePlugin,
  LookupPlugin,
  GroupPlugin,
]);

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

(async () => {
  try {
    const user = "admin";
    const dbname = "meubanco";

    const commands = [
      // {
      //   fnName: "populate",
      //   args: {
      //     user: "admin",
      //     dbname: "meubanco",
      //     collname: "Orders",
      //     populates: [
      //       {
      //         path: "userId",
      //         // as: "user",
      //         targetColl: "Users", // ✅ agora reconhecido

      //         select: ["name"],
      //       },
      //     ],
      //   },
      // },
      // {
      //   fnName: "lookup",
      //   args: {
      //     user: "admin",
      //     dbname: "meubanco",
      //     collname: "Orders",
      //     lookups: [
      //       {
      //         localField: "_id",
      //         foreignField: "userId",
      //         from: "Orders",
      //         as: "orders",
      //         select: ["produto", "quantidade"],
      //       },
      //       {
      //         localField: "userId",
      //         foreignField: "_id",
      //         from: "Users",
      //         as: "user",
      //         select: ["name"],
      //       },
      //     ],
      //   },
      // },

      {
        fnName: "group",

        args: {
          user: "admin",
          dbname: "meubanco",
          collname: "Orders",
          groups: [
            {
              _id: "$userId",
              totalOrders: { $sum: 1 },
              totalAmount: { $sum: "$preco" },
            },
          ],
        },
      },
      {
        fnName: "groupBy",

        args: {
          user: "admin",
          dbname: "meubanco",
          collname: "Orders",
          by: "userId",
        },
      },
    ];

    const results = await app.runFuncs(commands);
    logResults(results);
  } catch (err) {
    console.error("Erro:", err.message);
  }
})();

// Se quiser adicionar paginação, ordenação ou projeção de campos node test.populate.js
