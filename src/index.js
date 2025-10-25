export default {
  async fetch(request, env, ctx) {
    return new Response("Hello from cf-hell0-world 👁", {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  },
  async scheduled(event, env, ctx) {
    console.log("[CRON] cf-hell0-world triggered at " + new Date().toISOString());
  },
};
