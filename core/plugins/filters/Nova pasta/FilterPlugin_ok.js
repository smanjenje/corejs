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
  FilterPlugin, // agora app.findMany e app.findOne estão disponíveis
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
(async () => {
  try {
    // --- Teste de busca com findMany ---
    // const commands = [
    //   // // Reconstruir índice de documentos
    //   // {
    //   //   fnName: "rebuildIndex",
    //   //   args: { user, dbname, collname },
    //   // },
    //   // // Ler mapa de documentos reconstruído
    //   // {
    //   //   fnName: "readDocsMap",
    //   //   args: { user, dbname },
    //   // },
    //   // Obter mapa de documentos da coleção
    //   {
    //     fnName: "getCollDocsMap",
    //     args: { user, dbname, collname },
    //   },
    // ];

    // const commands = [
    //   {
    //     // Usar getDocsByIndices para obter documentos pelos índices
    //     fnName: "getDocsByIndices",
    //     args: {
    //       user: "admin",
    //       dbname: "meubanco",
    //       collname: "professores",
    //       indices: [0, 1,1],
    //     },
    //   },
    // ];

    const commands = [
      // 1. Igualdade exata
      {
        fnName: "findMany",
        args: {
          user,
          dbname,
          collname,
          queries: [{ nome: "Severino2" }],
        },
      },

      // 2. $eq (equivalente ao acima)
      {
        fnName: "findMany",
        args: {
          user,
          dbname,
          collname,
          queries: [{ nome: { $eq: "Severino2" } }],
        },
      },

      // 3. $ne (diferente)
      {
        fnName: "findMany",
        args: {
          user,
          dbname,
          collname,
          queries: [{ nome: { $ne: "Severino1" } }],
        },
      },

      // 4. $gt / $gte (números)
      {
        fnName: "findMany",
        args: {
          user,
          dbname,
          collname,
          queries: [{ _id: { $gt: 3 } }],
        },
      },

      // 5. $lt / $lte
      {
        fnName: "findMany",
        args: {
          user,
          dbname,
          collname,
          queries: [{ _id: { $lte: 2 } }],
        },
      },

      // 6. contains (substring)
      {
        fnName: "findMany",
        args: {
          user,
          dbname,
          collname,
          queries: [{ nome: { contains: "Severino" } }],
        },
      },

      // 7. $startsWith
      {
        fnName: "findMany",
        args: {
          user,
          dbname,
          collname,
          queries: [{ nome: { $startsWith: "Severino3" } }],
        },
      },

      // 8. $endsWith
      {
        fnName: "findMany",
        args: {
          user,
          dbname,
          collname,
          queries: [{ nome: { $endsWith: "4" } }],
        },
      },

      // 9. $in
      {
        fnName: "findMany",
        args: {
          user,
          dbname,
          collname,
          queries: [{ _id: { $in: [1, 3, 5] } }],
        },
      },

      // 10. $nin
      {
        fnName: "findMany",
        args: {
          user,
          dbname,
          collname,
          queries: [{ _id: { $nin: [2, 4] } }],
        },
      },

      // 11. $between (números)
      {
        fnName: "findMany",
        args: {
          user,
          dbname,
          collname,
          queries: [{ _id: { $between: [2, 4] } }],
        },
      },

      // 12. $between (datas ISO – funciona!)
      {
        fnName: "findMany",
        args: {
          user,
          dbname,
          collname,
          queries: [
            {
              createdAt: {
                $between: [
                  "2025-12-07T20:05:04.000Z",
                  "2025-12-07T20:05:07.000Z",
                ],
              },
            },
          ],
        },
      },

      // 13. $regex
      {
        fnName: "findMany",
        args: {
          user,
          dbname,
          collname,
          queries: [{ nome: { $regex: "^Severino[2-4]$", $options: "i" } }],
        },
      },

      // 14. $or
      {
        fnName: "findMany",
        args: {
          user,
          dbname,
          collname,
          queries: [
            {
              $or: [{ _id: 1 }, { nome: { contains: "4" } }],
            },
          ],
        },
      },

      // 15. $and (implícito, mas explícito aqui)
      {
        fnName: "findMany",
        args: {
          user,
          dbname,
          collname,
          queries: [
            {
              $and: [{ _id: { $gte: 2 } }, { nome: { $endsWith: "3" } }],
            },
          ],
        },
      },

      // 16. $not
      {
        fnName: "findMany",
        args: {
          user,
          dbname,
          collname,
          queries: [
            {
              $not: { _id: { $gt: 4 } },
            },
          ],
        },
      },

      // 17. $containsAny
      {
        fnName: "findMany",
        args: {
          user,
          dbname,
          collname,
          queries: [
            {
              nome: { $containsAny: ["2", "5"] },
            },
          ],
        },
      },

      // 18. $containsAll
      {
        fnName: "findMany",
        args: {
          user,
          dbname,
          collname,
          queries: [
            {
              nome: { $containsAll: ["Severino", "3"] },
            },
          ],
        },
      },
    ];

    const results = await app.runFuncs(commands);
    logResults(results);
  } catch (err) {
    console.error("Erro no exemplo:", err.message);
  }
})();
