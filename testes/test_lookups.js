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
  LookupPlugin,
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
    const user = "admin",
      dbname = "meubanco",
      collname = "professores";

    const commands = [
      // // 1. Criar coleção de professores
      // {
      //   fnName: "createColl",
      //   args: {
      //     user,
      //     dbname,
      //     collname: "professores",
      //     schema: {
      //       nome: { type: "string", required: true },
      //     },
      //   },
      // },

      // // 2. Inserir professores
      // {
      //   fnName: "insertDoc",
      //   args: {
      //     user,
      //     dbname,
      //     collname: "professores",
      //     doc: { nome: "Severino1" },
      //   },
      // },
      // {
      //   fnName: "insertDoc",
      //   args: {
      //     user,
      //     dbname,
      //     collname: "professores",
      //     doc: { nome: "Severino2" },
      //   },
      // },

      // // 3. Criar coleção de disciplinas
      // {
      //   fnName: "createColl",
      //   args: {
      //     user,
      //     dbname,
      //     collname: "disciplinas",
      //     schema: {
      //       nome: { type: "string", required: true },
      //       professorId: { type: "number", required: true },
      //     },
      //   },
      // },

      // // 4. Inserir disciplinas (relacionadas aos professores)
      // {
      //   fnName: "insertDoc",
      //   args: {
      //     user,
      //     dbname,
      //     collname: "disciplinas",
      //     doc: { nome: "Matemática", professorId: 1 },
      //   },
      // },
      // {
      //   fnName: "insertDoc",
      //   args: {
      //     user,
      //     dbname,
      //     collname: "disciplinas",
      //     doc: { nome: "Física", professorId: 1 },
      //   },
      // },
      // {
      //   fnName: "insertDoc",
      //   args: {
      //     user,
      //     dbname,
      //     collname: "disciplinas",
      //     doc: { nome: "Química", professorId: 2 },
      //   },
      // },

      // 5. Testar lookup: professores com suas disciplinas
      {
        fnName: "lookup",
        args: {
          user,
          dbname,
          collname: "professores", // coleção principal
          from: "disciplinas", // coleção estrangeira
          localField: "_id", // campo em professores
          foreignField: "professorId", // campo em disciplinas
          as: "disciplinas", // nome do novo campo
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
