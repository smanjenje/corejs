const crypto = require("crypto");
const path = require("path");

module.exports = ({ app, options = {} }) => {
  const secret = options.secret || "corejs-secret-key";
  const ROOT = options.root ?? path.join(process.cwd(), "db");
  const usersFile = options.usersFile ?? path.join(ROOT, "users.json");

  // Cache em memória para evitar I/O excessivo no disco
  let _usersCache = null;

  // Helpers de Log centralizados
  const log = (m) =>
    app.log ? app.log(`[Auth] ${m}`) : console.log(`[Auth] ${m}`);
  const LogError = (msg) => {
    if (app.error) app.error(`[Auth] ${msg}`);
    return { status: false, error: msg };
  };

  // ---------- Gerenciamento de Persistência ----------

  const loadUsers = async () => {
    if (_usersCache) return _usersCache;
    // Usa o readJSON do FSPlugin que já tem cache e segurança
    _usersCache = await app.readJSON(usersFile, {});
    return _usersCache;
  };

  const saveUsers = async (data) => {
    _usersCache = data;
    return await app.writeJSON(usersFile, data);
  };

  // ---------- Criptografia de Token (JWT Style) ----------

  const generateToken = (data) => {
    const payload = {
      ...data,
      iat: Date.now(), // Issued At
      exp: Date.now() + (options.expiresIn || 86400000), // Default 24h
    };

    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      "base64"
    );
    const signature = crypto
      .createHmac("sha256", secret)
      .update(encodedPayload)
      .digest("hex");

    return `${encodedPayload}.${signature}`;
  };

  // ---------- Métodos do Plugin ----------

  return {
    /**
     * Autentica um usuário comparando o hash da senha
     */
    login: async ({ username, password, dbname = null }) => {
      const users = await loadUsers();
      const user = users[username];

      // 1. Validação de existência do usuário
      if (!user) return LogError("Usuário não encontrado.");

      // 2. Validação de Senha (Integração com CryptoPlugin)
      const incomingHash = app.hash ? app.hash(password) : password;
      if (user.password !== incomingHash) {
        return LogError("Senha incorreta.");
      }

      // 3. Preparação do payload do usuário
      const userLogado = {
        name: user.name,
        user: username,
        username,
        role: user.role,
      };

      // 4. Verificação de existência do Banco de Dados (Multi-tenant)
      if (dbname != null) {
        // Usamos o username como 'folder' base para isolar os bancos
        const dbPath = app.getFullPath(username, dbname);
        const exists = await app.pathExists(dbPath);

        if (!exists) {
          return LogError(
            `O banco de dados '${dbname}' não existe para o usuário '${username}'.`
          );
        }

        userLogado.dbname = dbname;
      }

      // 5. Geração do Token assinado com o contexto completo
      const token = generateToken(userLogado);

      // Log de auditoria interna
      const scope = userLogado.dbname
        ? `DB: ${userLogado.dbname}`
        : "Global Scope";
      log(`Login bem-sucedido: ${username} @ ${scope}`);

      return {
        status: true,
        token,
        user: userLogado,
      };
    },

    /**
     * Valida o token e retorna os dados originais (username, role, dbname)
     */
    validateToken: async ({ token }) => {
      if (!token || typeof token !== "string")
        return LogError("Token ausente.");

      const [encodedPayload, signature] = token.split(".");
      if (!encodedPayload || !signature)
        return LogError("Formato de token inválido.");

      // 1. Validar Assinatura (Segurança contra manipulação)
      const expectedSignature = crypto
        .createHmac("sha256", secret)
        .update(encodedPayload)
        .digest("hex");

      if (signature !== expectedSignature) {
        return LogError("Token violado ou chave secreta alterada.");
      }

      // 2. Decodificar e verificar expiração
      try {
        const payload = JSON.parse(
          Buffer.from(encodedPayload, "base64").toString("utf8")
        );

        if (Date.now() > payload.exp) {
          return LogError("Sessão expirada. Por favor, faça login novamente.");
        }

        // 3. Sucesso: Retornamos os dados que você enviou no login
        log(
          `Token validado: ${payload.username} [${payload.dbname || "global"}]`
        );

        return {
          status: true,
          username: payload.username,
          user: payload.user,
          role: payload.role,
          dbname: payload.dbname || null,
          iat: payload.iat,
        };
      } catch (err) {
        return LogError("Erro ao processar dados do token.");
      }
    },
    /**
     * Adiciona usuário salvando a senha como HASH
     */
    addUser: async ({ name, username, password, role = "user" }) => {
      const users = await loadUsers();
      if (users[username]) return LogError("Usuário já existe.");

      users[username] = {
        name,
        password: app.hash ? app.hash(password) : password,
        role,
        createdAt: new Date().toISOString(),
      };

      await saveUsers(users);
      log(`Usuário criado: ${username}`);
      return { status: true, username };
    },

    removeUser: async (username) => {
      const users = await loadUsers();
      if (!users[username]) return LogError("Usuário não encontrado.");

      delete users[username];
      await saveUsers(users);
      return { status: true };
    },

    listUsers: async () => {
      const users = await loadUsers();
      // Retorna lista sem as senhas por segurança
      return Object.entries(users).map(([name, data]) => ({
        username: name,
        role: data.role,
        createdAt: data.createdAt,
      }));
    },
  };
};
