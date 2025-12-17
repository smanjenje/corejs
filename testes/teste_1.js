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
const LookupPlugin = require("./core/plugins/filters/LookupPlugin");
const AggregatePlugin = require("./core/plugins/filters/AggregatePlugin");
const GroupPlugin = require("./core/plugins/filters/GroupPlugin");
const PopulatePlugin = require("./core/plugins/filters/PopulatePlugin");
const ProjectPlugin = require("./core/plugins/filters/ProjectPlugin");

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
  ProjectPlugin,
  QueryPlugin,
  LookupPlugin,
  GroupPlugin,
  AggregatePlugin,
  PopulatePlugin,
  DBPlugin,
  CollPlugin,
  DocPlugin, // depende de app.findMany
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
      {
        fnName: "aggregate",
        args: {
          user: "admin",
          dbname: "meubanco",
          collname: "pedidos",
          pipeline: [
            {
              $match: { clienteId: 1 },
            },
            {
              $lookup: {
                from: "clientes",
                localField: "clienteId",
                foreignField: "_id",
                as: "cliente",
              },
            },
            {
              $project: {
                _id: 1,
                cliente: { $arrayElemAt: ["$cliente", 0] },
              },
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

// Se quiser adicionar paginação, ordenação ou projeção de campos node test.populate.js
