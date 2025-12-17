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
      /*       // 1. Criar coleção de clientes
      {
        fnName: "createColl",
        args: {
          user,
          dbname,
          collname: "clientes",
          schema: {
            nome: { type: "string" },
            email: { type: "string" },
          },
        },
      },

      // 2. Criar coleção de produtos
      {
        fnName: "createColl",
        args: {
          user,
          dbname,
          collname: "produtos",
          schema: {
            nome: { type: "string" },
            preco: { type: "number" },
          },
        },
      },

      // 3. Criar coleção de pedidos
      {
        fnName: "createColl",
        args: {
          user,
          dbname,
          collname: "pedidos",
          schema: {
            clienteId: { type: "number" },
            itens: {
              type: "array",
              items: {
                type: "object",
                subschema: {
                  produtoId: { type: "number" },
                  quantidade: { type: "number" },
                },
              },
            },
          },
        },
      },

      // 4. Inserir clientes
      {
        fnName: "insertDoc",
        args: {
          user,
          dbname,
          collname: "clientes",
          doc: { nome: "Ana", email: "ana@email.com" },
        },
      },
      {
        fnName: "insertDoc",
        args: {
          user,
          dbname,
          collname: "clientes",
          doc: { nome: "Carlos", email: "carlos@email.com" },
        },
      },

      // 5. Inserir produtos
      {
        fnName: "insertDoc",
        args: {
          user,
          dbname,
          collname: "produtos",
          doc: { nome: "Notebook", preco: 3500 },
        },
      },
      {
        fnName: "insertDoc",
        args: {
          user,
          dbname,
          collname: "produtos",
          doc: { nome: "Mouse", preco: 80 },
        },
      },
      {
        fnName: "insertDoc",
        args: {
          user,
          dbname,
          collname: "produtos",
          doc: { nome: "Teclado", preco: 120 },
        },
      },

      // 6. Inserir pedidos
      {
        fnName: "insertDoc",
        args: {
          user,
          dbname,
          collname: "pedidos",
          doc: {
            clienteId: 3,
            itens: [
              { produtoId: 4, quantidade: 1 },
              { produtoId: 5, quantidade: 2 },
            ],
          },
        },
      },
      {
        fnName: "insertDoc",
        args: {
          user,
          dbname,
          collname: "pedidos",
          doc: {
            clienteId: 4,
            itens: [
              { produtoId: 5, quantidade: 1 },
              { produtoId: 6, quantidade: 1 },
            ],
          },
        },
      },

      // 7. Listar pedidos brutos
      {
        fnName: "listDocs",
        args: { user, dbname, collname: "pedidos" },
      }, */

      // 8. Populate simples: cliente
      // {
      //   fnName: "populate",
      //   args: {
      //     collname: "pedidos",
      //     path: "clienteId",
      //     model: "clientes",
      //     as: "cliente",
      //     select: ["nome", "email"],
      //     user,
      //     dbname,
      //   },
      // },

      // // 9. Populate array: itens.produtoId → produto ✅
      // {
      //   fnName: "populateArray",
      //   args: {
      //     collname: "pedidos",
      //     arrayPath: "itens",
      //     refField: "produtoId",
      //     model: "produtos",
      //     as: "produto",
      //     select: ["nome", "preco"],
      //     user,
      //     dbname,
      //   },
      // },
      // {
      //   fnName: "lookupRecursive",
      //   args: {
      //     user,
      //     dbname,
      //     collname: "pedidos",
      //     lookups: [
      //       {
      //         from: "clientes",
      //         localField: "clienteId",
      //         foreignField: "_id",
      //         as: "cliente",
      //       },
      //     ],
      //   },
      // },
      // {
      //   fnName: "lookupRecursive",
      //   args: {
      //     user,
      //     dbname,
      //     collname: "pedidos",
      //     lookups: [
      //       // 1️⃣ Lookup clientes
      //       {
      //         from: "clientes",
      //         localField: "clienteId",
      //         foreignField: "_id",
      //         as: "cliente",
      //       },
      //       // 2️⃣ Lookup produtos dentro de itens
      //       {
      //         from: "produtos",
      //         localField: "itens.produtoId", // caminho aninhado
      //         foreignField: "_id",
      //         as: "produtos",
      //       },
      //     ],
      //   },
      // },

      // // 7️⃣ Popular cliente (lookup simples)
      // {
      //   fnName: "lookup",
      //   args: {
      //     collname: "pedidos",
      //     path: "clienteId",
      //     model: "clientes",
      //     as: "cliente",
      //     select: ["nome", "email"],
      //     user,
      //     dbname,
      //   },
      // },

      // // 8️⃣ Popular produtos dentro de itens (populateArray)
      // {
      //   fnName: "populateArray",
      //   args: {
      //     collname: "pedidos",
      //     arrayPath: "itens",
      //     refField: "produtoId",
      //     model: "produtos",
      //     as: "produto",
      //     select: ["nome", "preco"],
      //     user,
      //     dbname,
      //   },
      // },

      // 5️⃣ Lookup recursivo: clientes e produtos
      {
        fnName: "lookupRecursive",
        args: {
          collname: "pedidos",
          user,
          dbname,
          lookups: [
            {
              from: "clientes",
              localField: "clienteId",
              foreignField: "_id",
              as: "cliente",
            },
            {
              from: "produtos",
              localField: "itens.produtoId",
              foreignField: "_id",
              as: "produto",
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
