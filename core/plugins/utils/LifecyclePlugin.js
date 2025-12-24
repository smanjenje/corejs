// LifecyclePlugin.js
// Plugin de hooks de ciclo de vida (inspirado em Vue) para Node.js / CoreJS

module.exports = ({ app } = {}) => {
  if (!app) throw new Error("LifecyclePlugin: app é obrigatório");

  // Registro do plugin
  if (typeof app.pluginsNames === "object") {
    app.pluginsNames.LifecyclePlugin = true;
  }

  // Armazenamento dos hooks
  const hooks = {
    mounted: [],
    beforeUnmount: [],
    unmounted: [],
    error: [],
  };

  // -----------------------------
  // API para registrar hooks
  // -----------------------------
  const onMounted = (fn) => {
    if (typeof fn === "function") hooks.mounted.push(fn);
  };

  const onBeforeUnmount = (fn) => {
    if (typeof fn === "function") hooks.beforeUnmount.push(fn);
  };

  const onUnmounted = (fn) => {
    if (typeof fn === "function") hooks.unmounted.push(fn);
  };

  const onError = (fn) => {
    if (typeof fn === "function") hooks.error.push(fn);
  };

  // -----------------------------
  // API interna para executar hooks
  // -----------------------------
  const runHooks = async (type, ...args) => {
    const list = hooks[type];
    if (!list) return;
    for (const fn of list) {
      try {
        await fn(...args);
      } catch (err) {
        console.error(`[LifecyclePlugin][${type}] Error:`, err);
      }
    }
  };

  // -----------------------------
  // Simula mount / unmount
  // -----------------------------
  const mount = async () => {
    await runHooks("mounted");
  };

  const unmount = async () => {
    await runHooks("beforeUnmount");
    await runHooks("unmounted");
  };

  // -----------------------------
  // Integra com app
  // -----------------------------
  lifecycle = {
    onMounted,
    onBeforeUnmount,
    onUnmounted,
    onError,
    mount,
    unmount,
  };

  // Auto-mount (opcional)
  setImmediate(() => mount());

  return lifecycle;
};
