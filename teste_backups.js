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
const JoinPlugin = require("./core/plugins/sql/JoinPlugin");
const PaginationPlugin = require("./core/plugins/filters/PaginationPlugin");
const BackupPlugin = require("./core/plugins/backupsplugins/BackupPlugin");

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

  JoinPlugin,

  PaginationPlugin,
  BackupPlugin,
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
    const dbname = "Quime";

    const commands = [
      /*     {
        fnName: "createBackup",
        args: {
          user,
          dbname,
          tag: "estavel",
        },
      },
      {
        // Opcional: listar para ver se o arquivo de backup foi criado
        fnName: "listBackups",
        args: {
          user,
          dbname,
        },
      }, */

      {
        fnName: "restoreBackup",
        args: {
          user: "admin",
          dbname: "Quime",
          // Você deve passar o nome exato da pasta retornado pelo listBackups
          backupFolderName: "backup_estavel_2025-12-17T09-30-57-692Z",
        },
      },
    ];

    const results = await app.runFuncs(commands);
    logResults(results);
  } catch (err) {
    console.error("Erro:", err.message);
  }
})();

// node teste.js
