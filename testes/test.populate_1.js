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
          // 1. Criar coleção de clientes
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

      // 3. Criar coleção de pedidos (com referências)
      {
        fnName: "createColl",
        args: {
          user,
          dbname,
          collname: "pedidos",
          schema: {
            clienteId: { type: "number" }, // ← referencia _id de clientes
            itens: {
              type: "array",
              items: {
                type: "object",
                subschema: {
                  produtoId: { type: "number" }, // ← referencia _id de produtos
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

            // 6. Inserir pedidos com referências reais (após obter os _ids)
      // ⚠️ IMPORTANTE: Os _id são gerados automaticamente (1, 2, 3...)
      // Assumimos: Ana = _id 1, Carlos = _id 2
      //            Notebook = _id 1, Mouse = _id 2, Teclado = _id 3

      {
        fnName: "insertDoc",
        args: {
          user,
          dbname,
          collname: "pedidos",
          doc: {
            clienteId: 1,
            itens: [
              { produtoId: 1, quantidade: 1 }, // Notebook
              { produtoId: 2, quantidade: 2 }, // Mouse
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
            clienteId: 2,
            itens: [
              { produtoId: 2, quantidade: 1 }, // Mouse
              { produtoId: 3, quantidade: 1 }, // Teclado
            ],
          },
        },
      },

      // 7. Listar pedidos brutos
      {
        fnName: "listDocs",
        args: { user, dbname, collname: "pedidos" },
      },

      // 8. Popular: pedidos → cliente
      {
        fnName: "populate",
        args: {
          collname: "pedidos",
          path: "clienteId",
          model: "clientes",
          as: "cliente",
          user,
          dbname,
        },
      },

      // 9. Popular: itens.produtoId → produto (um por um, ou com lógica customizada)
      // → Como `PopulatePlugin` não suporta caminhos aninhados diretamente,
      //    faremos uma etapa extra com `runFuncSync` ou ajuste manual.
    ];

    const results = await app.runFuncs(commands);
    logResults(results);
  } catch (err) {
    console.error("Erro:", err.message);
  }
})();
// Se quiser adicionar paginação, ordenação ou projeção de campos
