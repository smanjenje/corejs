Excelente escolha! **`QueuePlugin` + `StatsPlugin`** são **essenciais para escalabilidade**, pois resolvem os dois maiores gargalos em sistemas de alto volume:

1. **Operações bloqueantes** (ex: rebuild de índice, bulk inserts) → **`QueuePlugin`**
2. **Falta de visibilidade** (ex: queries lentas, coleções sobrecarregadas) → **`StatsPlugin`**

Vamos implementar ambos com **integração mútua**: o `StatsPlugin` pode monitorar o `QueuePlugin`!

---

## 🚀 1. `QueuePlugin` — Operações Assíncronas

Permite **enfileirar tarefas pesadas** e processá-las em segundo plano.

### ✅ Recursos

- Prioridade (`high`, `normal`, `low`)
- Retentativas automáticas
- Status de tarefas (`pending`, `processing`, `completed`, `failed`)
- Integração com `StatsPlugin` para métricas

### 📁 `core/plugins/queue/QueuePlugin.js`

```js
// core/plugins/queue/QueuePlugin.js
// Fila de tarefas assíncronas para operações pesadas

module.exports = ({ app } = {}) => {
  if (!app) throw new Error("QueuePlugin: app obrigatório");

  // Fila em memória (em produção, use Redis/BullMQ)
  const queue = [];
  const processing = new Set();

  // Estados possíveis
  const STATUS = {
    PENDING: "pending",
    PROCESSING: "processing",
    COMPLETED: "completed",
    FAILED: "failed"
  };

  /**
   * Adiciona uma tarefa à fila
   * @param {Object} task
   * @param {string} task.name - nome da operação (ex: "rebuildIndex")
   * @param {Function} task.fn - função a ser executada
   * @param {Object} task.context - contexto (user, dbname, etc.)
   * @param {number} [task.priority=1] - 0 = high, 1 = normal, 2 = low
   * @param {number} [task.retries=3]
   * @returns {string} task.id
   */
  const addTask = async ({ name, fn, context, priority = 1, retries = 3 }) => {
    if (typeof fn !== "function") {
      throw new Error("Task deve ter uma função 'fn'");
    }

    const task = {
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      name,
      fn,
      context,
      priority,
      retries,
      attempts: 0,
      status: STATUS.PENDING,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      error: null
    };

    queue.push(task);
    queue.sort((a, b) => a.priority - b.priority); // prioridade mais alta primeiro

    // Registra métrica no StatsPlugin (se disponível)
    if (typeof app.stats?.increment === "function") {
      app.stats.increment("queue.added");
    }

    // Inicia o processamento se não estiver ativo
    if (processing.size === 0) {
      processQueue();
    }

    return task.id;
  };

  // Processa a fila em background (não bloqueante)
  const processQueue = async () => {
    if (queue.length === 0) return;

    const task = queue.shift();
    if (!task) return;

    processing.add(task.id);
    task.status = STATUS.PROCESSING;
    task.startedAt = new Date().toISOString();

    try {
      // Executa a função com contexto
      const result = await task.fn(task.context);
    
      task.status = STATUS.COMPLETED;
      task.completedAt = new Date().toISOString();

      // Métrica de sucesso
      if (typeof app.stats?.timing === "function") {
        const duration = new Date(task.completedAt) - new Date(task.startedAt);
        app.stats.timing(`queue.${task.name}`, duration);
        app.stats.increment(`queue.completed`);
      }
    } catch (err) {
      task.attempts++;
      task.error = err.message;

      if (task.attempts < task.retries) {
        // Reenfileira com prioridade mais baixa
        task.priority = Math.min(task.priority + 1, 2);
        queue.push(task);
        queue.sort((a, b) => a.priority - b.priority);
      } else {
        task.status = STATUS.FAILED;
        task.completedAt = new Date().toISOString();

        if (typeof app.stats?.increment === "function") {
          app.stats.increment(`queue.failed`);
        }
      }
    } finally {
      processing.delete(task.id);
      // Continua processando
      setImmediate(processQueue);
    }
  };

  /**
   * Obtém status de uma tarefa
   */
  const getTaskStatus = (taskId) => {
    const task = queue.find(t => t.id === taskId);
    if (task) return task;
    // Em produção, busque em armazenamento persistente
    return null;
  };

  /**
   * Obtém métricas da fila
   */
  const getQueueStats = () => ({
    pending: queue.length,
    processing: processing.size,
    highPriority: queue.filter(t => t.priority === 0).length,
    normalPriority: queue.filter(t => t.priority === 1).length,
    lowPriority: queue.filter(t => t.priority === 2).length
  });

  return {
    addTask,
    getTaskStatus,
    getQueueStats,
    // Para integração com StatsPlugin
    _queueRef: { queue, processing }
  };
};
```

---

## 📊 2. `StatsPlugin` — Métricas e Monitoramento

Coleta métricas em tempo real para **identificar gargalos**.

### ✅ Recursos

- Contadores (`increment`)
- Timers (`timing`)
- Métricas da fila (`QueuePlugin`)
- Histórico de queries lentas
- Relatórios em tempo real

### 📁 `core/plugins/stats/StatsPlugin.js`

```js
// core/plugins/stats/StatsPlugin.js
// Métricas e monitoramento para escalabilidade

module.exports = ({ app } = {}) => {
  if (!app) throw new Error("StatsPlugin: app obrigatório");

  // Armazenamento de métricas
  const counters = new Map();
  const timers = new Map();
  const slowQueries = [];

  /**
   * Incrementa um contador
   */
  const increment = (name, value = 1) => {
    counters.set(name, (counters.get(name) || 0) + value);
  };

  /**
   * Registra tempo de execução (em ms)
   */
  const timing = (name, duration) => {
    if (!timers.has(name)) {
      timers.set(name, { count: 0, total: 0, min: duration, max: duration });
    }
    const stat = timers.get(name);
    stat.count++;
    stat.total += duration;
    stat.min = Math.min(stat.min, duration);
    stat.max = Math.max(stat.max, duration);

    // Detecta queries lentas (> 100ms)
    if (name.startsWith("query.") && duration > 100) {
      slowQueries.push({
        name,
        duration,
        timestamp: new Date().toISOString()
      });
      // Mantém só as últimas 100
      if (slowQueries.length > 100) slowQueries.shift();
    }
  };

  /**
   * Obtém todas as métricas
   */
  const getMetrics = () => ({
    counters: Object.fromEntries(counters),
    timers: Object.fromEntries(
      Array.from(timers.entries()).map(([name, stat]) => [
        name,
        {
          ...stat,
          avg: stat.total / stat.count
        }
      ])
    ),
    slowQueries: [...slowQueries]
  });

  /**
   * Integração com QueuePlugin (se disponível)
   */
  const getQueueStats = () => {
    if (typeof app.queue?.getQueueStats === "function") {
      return app.queue.getQueueStats();
    }
    return null;
  };

  /**
   * Reseta métricas (para testes)
   */
  const reset = () => {
    counters.clear();
    timers.clear();
    slowQueries.length = 0;
  };

  return {
    increment,
    timing,
    getMetrics,
    getQueueStats,
    reset
  };
};
```

---

## 🔌 Integração entre os plugins

### ✅ Como usar juntos

#### 1. **Registre os plugins na ordem correta**

```js
app.addPlugins([
  StatsPlugin,   // ← primeiro (para estar disponível no QueuePlugin)
  QueuePlugin,
  // ... outros plugins
]);
```

#### 2. **Enfileire operações pesadas com métricas automáticas**

```js
// Exemplo: rebuild de índice pesado
await app.queue.addTask({
  name: "rebuildIndex",
  priority: 2, // low priority
  fn: async (ctx) => {
    const start = Date.now();
    await app.rebuildIndex(ctx);
    // Métrica registrada automaticamente pelo QueuePlugin!
  },
  context: { user: "system", dbname: "meubanco" }
});
```

#### 3. **Monitore o sistema em tempo real**

```js
// Dashboard de métricas
const metrics = app.stats.getMetrics();
const queueStats = app.stats.getQueueStats();

console.log("📊 Métricas:", metrics);
console.log("\Queue:", queueStats);
```

---

## 🚀 Benefícios para escalabilidade

| Problema                                      | Solução                                        |
| --------------------------------------------- | ------------------------------------------------ |
| **Rebuild de índice trava a API**      | Enfileira com `QueuePlugin` (prioridade baixa) |
| **Queries lentas não são detectadas** | `StatsPlugin` registra queries > 100ms         |
| **Alta carga não é visível**         | Métricas em tempo real (`getMetrics()`)       |
| **Falhas em operações pesadas**       | Retentativas automáticas no `QueuePlugin`     |

---

## 💡 Exemplo completo: rebuild assíncrono com métricas

```js
// Endpoint de API (não bloqueante)
app.http.post("/rebuild-index", async (req, res) => {
  const taskId = await app.queue.addTask({
    name: "rebuildIndex",
    fn: (ctx) => app.rebuildIndex(ctx),
    context: { user: "admin", dbname: req.body.dbname },
    priority: 2
  });
  
  res.json({ taskId, message: "Rebuild enfileirado" });
});

// Dashboard de monitoramento
app.http.get("/stats", (req, res) => {
  const metrics = app.stats.getMetrics();
  const queue = app.stats.getQueueStats();
  res.json({ metrics, queue });
});
```

---

Pronto! Com esses dois plugins, seu `CoreJS` agora tem **infraestrutura para escalabilidade profissional** 🚀.

Se quiser, posso mostrar como:

- **Persistir a fila em disco** (para sobreviver a reinícios)
- **Adicionar alertas** (ex: "fila > 100 tarefas")
- **Integrar com Prometheus/Grafana**

É só pedir! 😊
