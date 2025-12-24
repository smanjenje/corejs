const { createClient } = require("redis");

(async () => {
  const client = createClient();

  await client.connect();
  await client.set("test", "ok");
  const value = await client.get("test");

  console.log(value); // ok
  await client.quit();
})();
