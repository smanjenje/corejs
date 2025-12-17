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
const PopulatePlugin = require("./core/plugins/joins/PopulatePlugin");

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

  PopulatePlugin,
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
      //   fnName: "createColl",
      //   args: {
      //     user,
      //     dbname,
      //     collname: "Users",
      //     schema: {
      //       nome: { type: "string", required: true },
      //       email: { type: "string" }, // exemplo de outro campo
      //       createdAt: { type: "string" }, // timestamp ISO
      //     },
      //   },
      // },
      // {
      //   fnName: "createColl",
      //   args: {
      //     user,
      //     dbname,
      //     collname: "Orders",
      //     schema: {
      //       userId: { type: "number", required: true }, // referência para Users
      //       produto: { type: "string", required: true },
      //       quantidade: { type: "number", required: true },
      //       preco: { type: "number" },
      //       createdAt: { type: "string" },
      //     },
      //   },
      // },

      // // Inserir usuários
      // {
      //   fnName: "insertDoc",
      //   args: {
      //     user: "admin",
      //     dbname: "meubanco",
      //     collname: "Users",
      //     doc: [
      //       { name: "Alice", email: "alice@email.com" },
      //       { name: "Bob", email: "bob@email.com" },
      //     ],
      //   },
      // },

      // // Inserir pedidos
      // {
      //   fnName: "insertDoc",
      //   args: {
      //     user: "admin",
      //     dbname: "meubanco",
      //     collname: "Orders",
      //     doc: [
      //       { userId: 1, produto: "Notebook", quantidade: 2, preco: 1200 },
      //       { userId: 2, produto: "Mouse", quantidade: 5, preco: 25 },
      //       { userId: 1, produto: "Teclado", quantidade: 1, preco: 80 },
      //     ],
      //   },
      // },

      {
        fnName: "populate",
        args: {
          user: "admin",
          dbname: "meubanco",
          collname: "orders", // coleção principal
          localField: "userId", // campo na collection orders
          foreignColl: "users", // coleção a ser populada
          foreignField: "_id", // campo da collection users que referencia
          as: "user", // nome do campo que vai receber os dados do usuário
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
