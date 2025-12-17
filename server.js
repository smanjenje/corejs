const express = require("express");
const cors = require("cors");
const path = require("path");
const coreJS = require("./Core/coreJS");

// --- CARREGAMENTO DE PLUGINS ---
const UtilsPlugin = require("./core/plugins/utils/UtilsPlugin");
const DatePlugin = require("./core/plugins/utils/DatePlugin");
const CachePlugin = require("./core/plugins/utils/CachePlugin");
const FSPlugin = require("./core/plugins/utils/FSPlugin");
const SchemaPlugin = require("./core/plugins/prepare/SchemaPlugin");
const PrepareDocPlugin = require("./core/plugins/prepare/PrepareDocPlugin");
const CollMapIndexPlugin = require("./core/plugins/indexMap/CollMapIndexPlugin");
const DocsIndexPlugin = require("./core/plugins/indexMap/DocsIndexPlugin");
const DBPlugin = require("./core/plugins/CRUD/DBPlugin");
const CollPlugin = require("./core/plugins/CRUD/CollPlugin");
const DocPlugin = require("./core/plugins/CRUD/DocPlugin");
const FilterPlugin = require("./core/plugins/filters/FilterPlugin");
const QueryPlugin = require("./core/plugins/filters/QueryPlugin");
const PopulatePlugin = require("./core/plugins/joins/PopulatePlugin");
const LookupPlugin = require("./core/plugins/joins/LookupPlugin");
const AggregatePlugin = require("./core/plugins/joins/AggregatePlugin");
const PaginationPlugin = require("./core/plugins/filters/PaginationPlugin");
const BackupPlugin = require("./core/plugins/backupsplugins/BackupPlugin");
const CryptoPlugin = require("./core/plugins/utils/CryptoPlugin");
const AuditLogPlugin = require("./core/plugins/utils/AuditLogPlugin");
const AuthPlugin = require("./core/plugins/utils/AuthPlugin");

// --- CONFIGURAÇÕES ---
const DB_ROOT = path.join(__dirname, "mydb");
const PORT = 3000;
const AUTH_SECRET = "corejs-super-secret-2025";

// --- INICIALIZAÇÃO COREJS ---
const app = coreJS({ root: DB_ROOT, secret: AUTH_SECRET });

app.addPlugins([
  AuthPlugin,
  CryptoPlugin,
  UtilsPlugin,
  DatePlugin,
  FSPlugin,
  CachePlugin,
  SchemaPlugin,
  PrepareDocPlugin,
  CollMapIndexPlugin,
  DocsIndexPlugin,
  FilterPlugin,
  QueryPlugin,
  DBPlugin,
  CollPlugin,
  DocPlugin,
  PopulatePlugin,
  LookupPlugin,
  AggregatePlugin,
  PaginationPlugin,
  BackupPlugin,
  AuditLogPlugin,
]);



// --- EXPRESS SETUP ---
const appExpress = express();
appExpress.use(cors());
appExpress.use(express.json());

// --- MIDDLEWARES ---

// Validação de Token e Injeção de Contexto
// --------------------------------------------------
// MIDDLEWARE DE AUTENTICAÇÃO
// --------------------------------------------------
const authMiddleware = async (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1];

  // Contexto padrão para visitantes
  req.userContext = { user: "guest", role: "guest", dbname: "default" };

  if (token) {
    try {
      // Chama o AuthPlugin para validar o token
      const auth = await app.runFunc("validateToken", { token });

      if (auth && auth.status) {
        // Extrai user e dbname se existirem no retorno do plugin
        req.userContext = {
          user: auth.username || auth.user,
          role: auth.role || "user",
          dbname: auth.dbname || "default", // Garante um dbname padrão
          token: token,
        };
      }
    } catch (err) {
      console.warn("Token inválido:", err.message);
    }
  }
  next();
};

// Trava para Administradores
const adminOnly = (req, res, next) => {
  if (req.userContext.role !== "admin") {
    return res
      .status(403)
      .json({ success: false, error: "Acesso restrito a administradores." });
  }
  next();
};

// --- ROTAS DE IDENTIDADE (AUTH) ---

appExpress.post("/api/auth/login", async (req, res) => {
  const result = await app.runFunc("login", req.body);
  res.status(result.status ? 200 : 401).json(result);
});

appExpress.post(
  "/api/auth/addUser",
  authMiddleware,
  adminOnly,
  async (req, res) => {
    const result = await app.runFunc("addUser", req.body);
    res.json(result);
  }
);

appExpress.get(
  "/api/auth/listUsers",
  authMiddleware,
  adminOnly,
  async (req, res) => {
    const result = await app.runFunc("listUsers");
    res.json(result);
  }
);

// --- ENDPOINT HÍBRIDO (COMANDOS ÚNICOS OU BATCH) ---
appExpress.post(
  ["/api/cmd", "/api/command"],
  authMiddleware,
  async (req, res) => {
    try {
      const { cmds, cmd, fnName, args } = req.body;
      let inputToProcess;

      // 1. Normalização da Entrada
      if (cmds || cmd) {
        inputToProcess = cmds || cmd;
      } else if (fnName) {
        // Converte objeto único para estrutura compatível com buildCmds
        inputToProcess = [{ [fnName]: args || {} }];
      }

      if (!inputToProcess) throw new Error("Nenhum comando fornecido.");

      // 2. Processamento via DSL do CoreJS
      const commands = app.buildCmds(inputToProcess);

      // 3. Execução com Injeção de Contexto
      const results = [];
      for (const c of commands) {
        // Proteção contra acesso não autenticado
        const publicActions = ["login", "validateToken"];
        if (
          req.userContext.user === "guest" &&
          !publicActions.includes(c.fnName)
        ) {
          throw new Error(
            `Ação '${c.fnName}' negada. Faça login para continuar.`
          );
        }

        // --- INJEÇÃO DE CONTEXTO ---
        // Combinamos os argumentos enviados pelo usuário com o contexto do Token.
        // O userContext entra por último para que o usuário não consiga
        // "forjar" o dbname ou user nos args da requisição.
        const finalArgs = {
          ...c.args,
          user: req.userContext.user,
          username: req.userContext.user, // Alias comum
          dbname: req.userContext.dbname,
          role: req.userContext.role,
        };

        // Executa via motor CoreJS (ativando hooks before/after)
        const output = await app.runFunc(c.fnName, finalArgs);
        results.push(output);
      }

      // 4. Resposta ao Frontend
      res.json({
        success: true,
        result: results.length === 1 ? results[0] : results,
      });
    } catch (error) {
      console.error("❌ Erro na API:", error.message);
      res.status(400).json({ success: false, error: error.message });
    }
  }
);

// --- INICIALIZAÇÃO ---
appExpress.listen(PORT, () => {
  console.log(`
  ✅ CoreJS API Server Ativo
  🌍 URL: http://localhost:${PORT}
  📂 Root: ${DB_ROOT}
  🛡️ Auth: Ativado (JWT-HMAC)
  `);
});
