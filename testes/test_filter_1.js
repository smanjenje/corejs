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

// ================================
// Função principal de demonstração
// ================================
(async () => {
  try {
    // --- Teste de busca com findMany ---
    const commands = [
      // 1. Igualdade exata
      {
        fnName: "findMany",
        args: {
          user: "admin",
          dbname: "meubanco",
          collname: "professores",
          queries: [{ nome: "Severino2" }],
        },
      },

      // 2. $eq (equivalente ao acima)
      {
        fnName: "findMany",
        args: {
          user: "admin",
          dbname: "meubanco",
          collname: "professores",
          queries: [{ nome: { $eq: "Severino2" } }],
        },
      },

      // 3. $ne (diferente)
      {
        fnName: "findMany",
        args: {
          user: "admin",
          dbname: "meubanco",
          collname: "professores",
          queries: [{ nome: { $ne: "Severino1" } }],
        },
      },

      // 4. $gt / $gte (números)
      {
        fnName: "findMany",
        args: {
          user: "admin",
          dbname: "meubanco",
          collname: "professores",
          queries: [{ _id: { $gt: 3 } }],
        },
      },

      // 5. $lt / $lte
      {
        fnName: "findMany",
        args: {
          user: "admin",
          dbname: "meubanco",
          collname: "professores",
          queries: [{ _id: { $lte: 2 } }],
        },
      },

      // 6. contains (substring)
      {
        fnName: "findMany",
        args: {
          user: "admin",
          dbname: "meubanco",
          collname: "professores",
          queries: [{ nome: { contains: "Severino" } }],
        },
      },

      // 7. $startsWith
      {
        fnName: "findMany",
        args: {
          user: "admin",
          dbname: "meubanco",
          collname: "professores",
          queries: [{ nome: { $startsWith: "Severino3" } }],
        },
      },

      // 8. $endsWith
      {
        fnName: "findMany",
        args: {
          user: "admin",
          dbname: "meubanco",
          collname: "professores",
          queries: [{ nome: { $endsWith: "4" } }],
        },
      },

      // 9. $in
      {
        fnName: "findMany",
        args: {
          user: "admin",
          dbname: "meubanco",
          collname: "professores",
          queries: [{ _id: { $in: [1, 3, 5] } }],
        },
      },

      // 10. $nin
      {
        fnName: "findMany",
        args: {
          user: "admin",
          dbname: "meubanco",
          collname: "professores",
          queries: [{ _id: { $nin: [2, 4] } }],
        },
      },

      // 11. $between (números)
      {
        fnName: "findMany",
        args: {
          user: "admin",
          dbname: "meubanco",
          collname: "professores",
          queries: [{ _id: { $between: [2, 4] } }],
        },
      },

      // 12. $between (datas ISO – funciona!)
      {
        fnName: "findMany",
        args: {
          user: "admin",
          dbname: "meubanco",
          collname: "professores",
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
          user: "admin",
          dbname: "meubanco",
          collname: "professores",
          queries: [{ nome: { $regex: "^Severino[2-4]$", $options: "i" } }],
        },
      },

      // 14. $or
      {
        fnName: "findMany",
        args: {
          user: "admin",
          dbname: "meubanco",
          collname: "professores",
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
          user: "admin",
          dbname: "meubanco",
          collname: "professores",
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
          user: "admin",
          dbname: "meubanco",
          collname: "professores",
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
          user: "admin",
          dbname: "meubanco",
          collname: "professores",
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
          user: "admin",
          dbname: "meubanco",
          collname: "professores",
          queries: [
            {
              nome: { $containsAll: ["Severino", "3"] },
            },
          ],
        },
      },
    ];

    const results = await app.runFuncs(commands);

    console.log("=== Resultados das execuções ===");
    for (let i = 0; i < results.length; i++) {
      console.log(`--- Resultado do comando ${i + 1} ---`);
      console.dir(results[i], { depth: null, colors: true });
    }

  } catch (err) {
    console.error("Erro no exemplo:", err.message);
  }
})();
