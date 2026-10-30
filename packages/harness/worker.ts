import { discover, runHarness } from "./adapters.ts";
const base = process.env.ATELIER_URL || "http://127.0.0.1:3001";
const token = process.env.WORKER_TOKEN;
if (!token)
  throw new Error("Set WORKER_TOKEN to the same value used by the backend.");
const request = async (path: string, body?: any) => {
  const r = await fetch(base + "/api/worker" + path, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body || {}),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
};
let registry = await discover();
let stopped = false;
const controllers = new Set<AbortController>();
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    stopped = true;
    for (const controller of controllers) controller.abort();
  });
const refresh = setInterval(() => {
  discover()
    .then((result) => {
      registry = result;
    })
    .catch((e) => console.error(e.message));
}, 60000);
console.log("Atelier host worker connected to", base);
async function slot() {
  while (!stopped) {
    try {
      const { task, agent, prompt } = await request("/claim", {
        harnesses: registry,
      });
      if (!task) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      const controller = new AbortController();
      controllers.add(controller);
      const timeout = setTimeout(() => controller.abort(), 180000);
      let polling = false;
      const poll = setInterval(async () => {
        if (polling) return;
        polling = true;
        try {
          const state = await request("/heartbeat", { taskId: task.id });
          if (state.cancelled) controller.abort();
        } catch {
          controller.abort();
        } finally {
          polling = false;
        }
      }, 1500);
      try {
        await runHarness(
          agent,
          prompt,
          async (text) => {
            await request("/event", { taskId: task.id, text });
          },
          controller.signal,
        );
        await request("/finish", { taskId: task.id });
      } catch (e: any) {
        await request("/finish", { taskId: task.id, error: e.message });
      } finally {
        clearTimeout(timeout);
        clearInterval(poll);
        controllers.delete(controller);
      }
    } catch (e: any) {
      console.error(e.message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}
await Promise.all([slot(), slot()]);
clearInterval(refresh);
