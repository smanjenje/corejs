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
const ProjectPlugin = require("./core/plugins/joins/ProjectPlugin");
const UnwindPlugin = require("./core/plugins/joins/UnwindPlugin");
const SortLimitPlugin = require("./core/plugins/joins/SortLimitPlugin");
const AggregatePlugin = require("./core/plugins/joins/AggregatePlugin");

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
  ProjectPlugin,
  UnwindPlugin,
  SortLimitPlugin,
  AggregatePlugin,
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
      // 1. group básico: total por usuário
      {
        fnName: "group",
        args: {
          user,
          dbname,
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

      // 2. group com having + sort + limit (top clientes)
      {
        fnName: "group",
        args: {
          user,
          dbname,
          collname: "Orders",
          groups: [
            {
              _id: "$userId",
              total: { $sum: "$preco" },
              orders: { $sum: 1 },
            },
          ],
          having: { total: { $gt: 100 } },
          sort: { total: -1 },
          limit: 2,
        },
      },

      // 3. groupBy simples (agrupa documentos por userId)
      {
        fnName: "groupBy",
        args: {
          user,
          dbname,
          collname: "Orders",
          by: "userId",
        },
      },

      // 4. groupBy como array (útil para APIs)
      {
        fnName: "groupBy",
        args: {
          user,
          dbname,
          collname: "Orders",
          by: "userId",
          asArray: true,
        },
      },

      // 5. countBy: contagem de pedidos por usuário
      {
        fnName: "countBy",
        args: {
          user,
          dbname,
          collname: "Orders",
          by: "userId",
        },
      },

      // 6. sumBy: soma do preço por usuário
      {
        fnName: "sumBy",
        args: {
          user,
          dbname,
          collname: "Orders",
          by: "userId",
          of: "preco",
        },
      },

      // 7. uniqueBy: produtos únicos por usuário
      {
        fnName: "uniqueBy",
        args: {
          user,
          dbname,
          collname: "Orders",
          by: "userId",
          field: "produto",
        },
      },

      // 8. facets: múltiplas agregações em uma só chamada
      {
        fnName: "group",
        args: {
          user,
          dbname,
          collname: "Orders",
          facets: {
            byUser: [{ _id: "$userId", total: { $sum: "$preco" } }],
            byProduct: [{ _id: "$produto", count: { $sum: 1 } }],
            stats: [
              {
                _id: null,
                avgPrice: { $avg: "$preco" },
                orderCount: { $sum: 1 },
              },
            ],
          },
        },
      },

      // 9. bucket: agrupamento por faixa de preço
      {
        fnName: "group",
        args: {
          user,
          dbname,
          collname: "Orders",
          bucket: {
            groupBy: "$preco",
            boundaries: [0, 50, 200, 1000],
            default: "premium",
            output: { count: { $sum: 1 } },
          },
        },
      },

      // 10. group com pipeline: filtra + agrupa
      {
        fnName: "group",
        args: {
          user,
          dbname,
          collname: "Orders",
          pipeline: [
            { $match: { preco: { $gt: 50 } } },
            // { $populate: { path: "userId", as: "user", targetColl: "Users" } } // se quiser
          ],
          groups: [
            {
              _id: "$userId",
              highValueOrders: { $sum: 1 },
              totalHighValue: { $sum: "$preco" },
            },
          ],
        },
      },
    ];

    const results = await app.runFuncs(commands);
    logResults(results);
  } catch (err) {
    console.error("Erro:", err.message);
  }
})();

// node test.populate.js
