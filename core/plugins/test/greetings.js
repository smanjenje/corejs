// Plugin de exemplo que adiciona algumas funções ao app
module.exports = ({ app, options }) => {
  return {
    // Função síncrona simples
    sayHello: ({ name = "mundo" } = {}) => {
      const msg = `Olá, ${name}!`;
      console.log("[sayHello] ->", msg);
      return msg;
    },

    // Função síncrona que soma
    sum: ({ a = 0, b = 0 } = {}) => {
      const res = a + b;
      console.log(`[sum] -> ${a} + ${b} = ${res}`);
      return res;
    },

    // Função assíncrona (retorna Promise)
    asyncMultiply: async ({ a = 1, b = 1 } = {}) => {
      // simula I/O
      await new Promise((r) => setTimeout(r, 100));
      const res = a * b;
      console.log(`[asyncMultiply] -> ${a} * ${b} = ${res}`);
      return res;
    },

    // Função que lança erro (para demonstrar runFuncsSafe)
    boom: async () => {
      await new Promise((r) => setTimeout(r, 50));
      throw new Error("boom!");
    },
  };
};