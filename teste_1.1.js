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
const CryptoPlugin = require("./core/plugins/utils/CryptoPlugin");
const AuditLogPlugin = require("./core/plugins/utils/AuditLogPlugin");
const AuthPlugin = require("./core/plugins/utils/AuthPlugin");

// ================================
// Inicializa CoreJS
// ================================
const app = coreJS({ root: "./mydb" });

// Adiciona plugins na ordem correta
app.addPlugins([
  AuthPlugin,
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
  CryptoPlugin,

  AuditLogPlugin,
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
    const token =
      "eyJuYW1lIjoiQWRtaW5zdHJhZG9yIiwidXNlciI6ImFkbWluIiwidXNlcm5hbWUiOiJhZG1pbiIsInJvbGUiOiJ1c2VyIiwiZGJuYW1lIjoiUXVpbWUiLCJpYXQiOjE3NjU5OTg2MjgzMjEsImV4cCI6MTc2NjA4NTAyODMyMX0=.667c59efc80a42e67969f87ecd01c07dfb091ac3588a16340f06b3bf6e6fa473";

    const commands = [
      // {
      //   // Primeiro protegemos
      //   fnName: "encryptFile",
      //   args: {
      // user,
      // dbname,
      //     file: "db.json",
      //     destFile: "db.json.safe",
      //   },
      // },
      // {
      //   // Depois restauramos para conferir
      //   fnName: "decryptFile",
      //   args: {
      //     user,
      //     dbname,
      //     file: "db.json.safe",
      //     destFile: "db_restaurado.json",
      //   },
      // },
      // Inserir usuários
      // {
      //   fnName: "insertDoc",
      //   args: {
      //     user,
      //     dbname,
      //     collname: "Users",
      //     doc: [
      //       {
      //         nome: "Seven",
      //         email: "seven@email.com",
      //         perfil_id: 1,
      //         endereco_id: 1,
      //       },
      //       {
      //         nome: "Justo",
      //         email: "justo@email.com",
      //         perfil_id: 2,
      //         endereco_id: 2,
      //       },
      //     ],
      //   },
      // },
      // {
      //   fnName: "getAuditLogs",
      //   args: { user: "admin", dbname: "Quime" },
      // },

      // {
      //   fnName: "addUser",
      //   args: { name: "Adminstrador", username: "admin", password: "1234" },
      // },
      // {
      //   fnName: "login",
      //   args: { username: "admin", password: "1234", dbname },
      // },
      {
        fnName: "validateToken",
        args: { token },
      },
    ];
    const results = await app.runFuncs(commands);
    logResults(results);

    // console.dir(app._hookMap, { depth: null, colors: true });
  } catch (err) {
    console.error("Erro:", err.message);
  }
})();

// node teste.js
