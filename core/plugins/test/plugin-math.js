// plugin-math.js
// Plugin simples que adiciona funções sync e async ao app

module.exports = ({ app, options }) => {
  return {
    add: ({ a = 0, b = 0 } = {}) => {
      return a + b;
    },

    mul: ({ a = 1, b = 1 } = {}) => {
      return a * b;
    },

    squareAsync: async ({ n = 0 } = {}) => {
      // simula IO/latência
      await new Promise((r) => setTimeout(r, 20));
      return n * n;
    },
  };
};
