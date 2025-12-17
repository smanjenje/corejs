// core/plugins/utils/CryptoPlugin.js
const crypto = require("crypto");

module.exports = ({ app, options = {} } = {}) => {
  // Chave de criptografia (deve ter 32 caracteres)
  // Recomenda-se usar process.env.SECRET_KEY
  // Isso gera um hash SHA-256 da sua senha, que sempre resulta em 32 bytes
  const ENCRYPTION_KEY = crypto
    .createHash("sha256")
    .update(options.secretKey || "sua-chave-padrao")
    .digest();
  const IV_LENGTH = 16;

  /**
   * Gera um hash seguro (não reversível) - Ideal para SENHAS.
   */
  const hash = (text) => {
    return crypto.createHash("sha256").update(text).digest("hex");
  };

  /**
   * Criptografa um texto (reversível).
   */
  const encrypt = (text) => {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(
      "aes-256-cbc",
      Buffer.from(ENCRYPTION_KEY),
      iv
    );
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString("hex") + ":" + encrypted.toString("hex");
  };

  /**
   * Descriptografa um texto.
   */
  const decrypt = (text) => {
    try {
      const textParts = text.split(":");
      const iv = Buffer.from(textParts.shift(), "hex");
      const encryptedText = Buffer.from(textParts.join(":"), "hex");
      const decipher = crypto.createDecipheriv(
        "aes-256-cbc",
        Buffer.from(ENCRYPTION_KEY),
        iv
      );
      let decrypted = decipher.update(encryptedText);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      return decrypted.toString();
    } catch (err) {
      return null;
    }
  };

  /**
   * Criptografa um objeto JSON.
   */
  const encryptJson = (obj) => {
    if (!obj) return null;
    return encrypt(JSON.stringify(obj));
  };

  /**
   * Descriptografa para um objeto JSON.
   */
  const decryptJson = (encryptedText) => {
    const decrypted = decrypt(encryptedText);
    try {
      return decrypted ? JSON.parse(decrypted) : null;
    } catch {
      return null;
    }
  };

  /**
   * Criptografa um arquivo físico usando os métodos do FSPlugin.
   */
  const encryptFile = async ({ user, dbname, file, destFile } = {}) => {
    try {
      if (!user || !dbname || !file) {
        throw new Error("user, dbname e file são obrigatórios.");
      }

      // Usa o FSPlugin para resolver o caminho e ler o Buffer
      const filePath = app.getFullPath(user, dbname, file);
      const data = await app.readFile(filePath);

      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv(
        "aes-256-cbc",
        Buffer.from(ENCRYPTION_KEY),
        iv
      );

      let encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
      const finalBuffer = Buffer.concat([iv, encrypted]);

      // Resolve destino e usa o writeFile atômico do FSPlugin
      const finalDestFile = destFile || `${file}.enc`;
      const destinationPath = app.getFullPath(user, dbname, finalDestFile);

      await app.writeFile(destinationPath, finalBuffer);

      return {
        status: true,
        message: "Arquivo criptografado com sucesso.",
        file: finalDestFile,
      };
    } catch (err) {
      return { status: false, error: err.message };
    }
  };

  /**
   * Descriptografa um arquivo binário usando os métodos do FSPlugin.
   */
  const decryptFile = async ({ user, dbname, file, destFile } = {}) => {
    try {
      if (!user || !dbname || !file) {
        throw new Error("user, dbname e file são obrigatórios.");
      }

      const filePath = app.getFullPath(user, dbname, file);
      // Lê o buffer bruto via FSPlugin
      const data = await app.readFile(filePath);

      const iv = data.subarray(0, IV_LENGTH);
      const encryptedData = data.subarray(IV_LENGTH);

      const decipher = crypto.createDecipheriv(
        "aes-256-cbc",
        Buffer.from(ENCRYPTION_KEY),
        iv
      );

      let decrypted = Buffer.concat([
        decipher.update(encryptedData),
        decipher.final(),
      ]);

      const finalDestFile = destFile || file.replace(".enc", "");
      const destinationPath = app.getFullPath(user, dbname, finalDestFile);

      // Salva o arquivo restaurado via writeFile atômico do FSPlugin
      await app.writeFile(destinationPath, decrypted);

      return {
        status: true,
        message: "Arquivo descriptografado com sucesso.",
        file: finalDestFile,
      };
    } catch (err) {
      return {
        status: false,
        error: "Falha na descriptografia: " + err.message,
      };
    }
  };

  return {
    hash,
    encrypt,
    decrypt,
    encryptJson,
    decryptJson,
    encryptFile,
    decryptFile,
  };
};
