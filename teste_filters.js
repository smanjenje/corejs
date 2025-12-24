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
      // 1. Teste de igualdade simples (Busca o João)
      {
        fnName: "findOne",
        args: {
          user,
          dbname,
          collname: "Users",
          queries: { nome: "João" },
        },
      },
/*       // 2. Teste de operadores ($gt) e campos aninhados em Enderecos
      {
        fnName: "findMany",
        args: {
          user,
          dbname,
          collname: "Enderecos",
          queries: { _id: { $gt: 1 } },
        },
      },
      // 3. Teste de lógica booleana e Regex (Cidades que começam com "Rio")
      {
        fnName: "findMany",
        args: {
          user,
          dbname,
          collname: "Cidades",
          queries: {
            cidade_nome: { $regex: "^Rio", $options: "i" },
          },
        },
      },
      // 4. Teste de múltiplos critérios (AND implícito)
      {
        fnName: "findMany",
        args: {
          user,
          dbname,
          collname: "Users",
          queries: {
            perfil_id: 2,
            email: { $regex: "@exemplo.com$" },
          },
        },
      },
      // 5. Teste de Operador de Conjunto ($in)
      // Busca usuários que tenham o perfil_id 1 OU 2 (deve trazer João e Maria)
      {
        fnName: "findMany",
        args: {
          user,
          dbname,
          collname: "Users",
          queries: { perfil_id: { $in: [1, 2] } },
        },
      },

      // 6. Teste de Lógica Booleana Explícita ($or)
      // Busca cidades que sejam "São Paulo" OU cujo ID seja maior que 5
      {
        fnName: "findMany",
        args: {
          user,
          dbname,
          collname: "Cidades",
          queries: {
            $or: [{ cidade_nome: "São Paulo" }, { _id: { $gt: 5 } }],
          },
        },
      },

      // 7. Teste de Negação e Diferença ($ne, $nin)
      // Busca usuários cujo e-mail NÃO seja o do João
      {
        fnName: "findMany",
        args: {
          user,
          dbname,
          collname: "Users",
          queries: { email: { $ne: "joao@exemplo.com" } },
        },
      },

      // 8. Teste de Operador Numérico de Faixa ($gte e $lte combinados)
      // Simulando um "Between" manual para IDs
      {
        fnName: "findMany",
        args: {
          user,
          dbname,
          collname: "Enderecos",
          queries: {
            _id: { $gte: 1, $lte: 10 },
          },
        },
      },

      // 9. Teste de Filtro Vazio (Deve retornar todos os documentos da coleção)
      {
        fnName: "findMany",
        args: {
          user,
          dbname,
          collname: "Cidades",
          queries: {},
        },
      }, */
    ];

    const results = await app.runFuncs(commands);
    logResults(results);
  } catch (err) {
    console.error("Erro:", err.message);
  }
})();

// node teste.js
