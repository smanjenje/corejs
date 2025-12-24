// core/plugins/RedisPlugin.js
const { createClient } = require("redis");

module.exports = ({ app, options = {} }) => {
  const client = createClient(options);

  client.on("error", (err) => {
    console.error("[Redis]", err);
  });

  client.connect();

  app.redis = client;

  app.cacheGet = async (key) => {
    const raw = await client.get(key);
    return raw ? JSON.parse(raw) : null;
  };

  app.cacheSet = async (key, value, ttl = 60) => {
    await client.set(key, JSON.stringify(value), { EX: ttl });
  };

  app.cacheDel = async (key) => {
    await client.del(key);
  };
};
