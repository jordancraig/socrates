// Deterministic protocol fixtures exercise the edit safety layer in a disposable database.
// These are not model responses and are never loaded by the application or provider adapters.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import pg from "pg";
import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";
import {
  fragment,
  find,
  replaceText,
  encodeNode,
} from "../apps/server/src/document.ts";
const root =
  process.env.TEST_DATABASE_URL ||
  "postgresql://postgres:atelier-local@127.0.0.1:5432/postgres";
const pool = new pg.Pool({ connectionString: root });
const database = "atelier_test_" + Date.now();
await pool.query(`CREATE DATABASE ${database}`);
const url = new URL(root);
url.pathname = "/" + database;
const token = "disposable-protocol-test-token";
const server = spawn(
  process.execPath,
  ["--import", "tsx", "apps/server/src/index.ts"],
  {
    env: {
      ...process.env,
      DATABASE_URL: url.toString(),
      PORT: "3101",
      COLLAB_PORT: "1235",
      WORKER_TOKEN: token,
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let logs = "";
server.stdout.on("data", (c) => (logs += c));
server.stderr.on("data", (c) => (logs += c));
const base = "http://127.0.0.1:3101/api";
async function request(path: string, body?: any, expected = 200) {
  const r = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      "content-type": "application/json",
      ...(path.startsWith("/worker/")
        ? { authorization: "Bearer " + token }
        : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await r.json();
  assert.equal(r.status, expected, JSON.stringify(result));
  return result;
}
let provider: HocuspocusProvider | undefined;
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      await request("/health");
      ready = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  assert.ok(ready, logs);
  const harnesses = [
    {
      provider: "codex",
      installed: true,
      version: "protocol test fixture",
      auth: "unknown",
      models: [],
      modelDiscovery: "Fixture registry for disposable edit-safety tests only",
      capabilities: { stream: "events", resume: false, cancel: true },
    },
  ];
  await request("/worker/claim", { harnesses });
  const { id } = await request("/documents", {
    title: "Disposable protocol safety tests",
  });
  const doc = new Y.Doc();
  await new Promise<void>((resolve, reject) => {
    provider = new HocuspocusProvider({
      url: "ws://127.0.0.1:1235",
      name: id,
      document: doc,
      onSynced: () => resolve(),
    });
    setTimeout(
      () => reject(new Error("Collaboration did not sync")),
      10000,
    ).unref();
  });
  const nodeId = String(
    (fragment(doc).get(0) as Y.XmlElement).getAttribute("id"),
  );
  replaceText(find(doc, nodeId)!, "The original argument.");
  (find(doc, nodeId)!.get(0) as Y.XmlText).format(4, 8, { bold: {} });
  await new Promise((r) => setTimeout(r, 200));
  const original = encodeNode(find(doc, nodeId)!);
  const get = () => request("/documents/" + id);
  const queue = (instruction: string, extra: any = {}) =>
    request("/tasks", {
      documentId: id,
      agentId: "astra",
      nodeId,
      instruction,
      ...extra,
    });
  const claim = () => request("/worker/claim", { harnesses });
  const emit = (task: any, op: any) =>
    request("/worker/event", {
      taskId: task.id,
      text: JSON.stringify(op) + "\n",
    });
  const finish = (task: any) => request("/worker/finish", { taskId: task.id });
  async function rewrite(text: string, extra: any = {}) {
    const task = await queue("Review the argument", extra);
    const c = await claim();
    assert.equal(c.task.id, task.id);
    await emit(task, { type: "replace", nodeId, text });
    await finish(task);
    return task;
  }
  // Safe rich-text reversal survives the JSONB storage round trip.
  await rewrite("A revised argument.");
  let data = await get();
  let change = data.changes.find((c: any) => c.state === "pending");
  assert.ok(change);
  await request(`/changes/${change.id}/reject`, {});
  await new Promise((r) => setTimeout(r, 100));
  assert.deepEqual(encodeNode(find(doc, nodeId)!), original);
  console.log("PASS persisted rich-text rejection");
  // A real Yjs human edit blocks reversal of the earlier contribution.
  await rewrite("A contribution for the author.");
  data = await get();
  change = data.changes.find((c: any) => c.state === "pending");
  (find(doc, nodeId)!.get(0) as Y.XmlText).insert(0, "Human: ");
  await new Promise((r) => setTimeout(r, 150));
  const rejected = await request(`/changes/${change.id}/reject`, {}, 400);
  assert.match(rejected.error, /Later edits/);
  await request(`/changes/${change.id}/accept`, {});
  console.log("PASS human edit protection");
  // Generation snapshots cannot overwrite a paragraph edited after task creation.
  const conflict = await queue("Review this paragraph");
  await claim();
  (find(doc, nodeId)!.get(0) as Y.XmlText).insert(0, "Newer human: ");
  await new Promise((r) => setTimeout(r, 150));
  await emit(conflict, { type: "replace", nodeId, text: "Stale proposal" });
  await finish(conflict);
  data = await get();
  assert.equal(
    data.tasks.find((t: any) => t.id === conflict.id).state,
    "conflict",
  );
  assert.equal(
    data.changes.find((c: any) => c.after?.text === "Stale proposal").state,
    "conflict",
  );
  assert.ok(find(doc, nodeId)!.toString().includes("Newer human:"));
  console.log("PASS stale generation conflict preservation");
  // A cancelled task cannot accept a late result.
  const cancelled = await queue("A task we will cancel");
  await claim();
  await request("/tasks/" + cancelled.id + "/cancel", {});
  await request("/worker/event", { taskId: cancelled.id, text: "{}\n" }, 409);
  await finish(cancelled);
  assert.equal(
    (await get()).tasks.find((t: any) => t.id === cancelled.id).state,
    "cancelled",
  );
  console.log("PASS cancellation rejects late output");
  // Two overlapping write scopes are not claimed together.
  const first = await queue("First scoped task");
  const second = await queue("Second scoped task");
  assert.equal((await claim()).task.id, first.id);
  assert.equal((await claim()).task, undefined);
  await request("/tasks/" + first.id + "/cancel", {});
  await finish(first);
  assert.equal((await claim()).task.id, second.id);
  await request("/tasks/" + second.id + "/cancel", {});
  await finish(second);
  console.log("PASS overlapping scopes are serialized");
  // Selection rewrites may not alter surrounding wording.
  replaceText(find(doc, nodeId)!, "Keep this. Improve this. Keep that.");
  await new Promise((r) => setTimeout(r, 100));
  const selection = await queue("Improve selected wording", {
    selectedText: "Improve this.",
  });
  await claim();
  await request(
    "/worker/event",
    {
      taskId: selection.id,
      text:
        JSON.stringify({
          type: "replace",
          nodeId,
          text: "I replaced the entire paragraph.",
        }) + "\n",
    },
    400,
  );
  assert.ok(find(doc, nodeId)!.toString().includes("Keep this."));
  console.log("PASS selected passage scope enforcement");
  // Thread resolution accepts only its related pending contributions, keeps history, and reopening does not undo edits.
  const thread = await request(`/documents/${id}/threads`, {
    nodeId,
    text: "Please clarify this paragraph.",
  });
  await rewrite("Keep this. Clarified wording. Keep that.", {
    threadId: thread.id,
  });
  await request(`/threads/${thread.id}/resolve`, {});
  data = await get();
  assert.equal(
    data.threads.find((t: any) => t.id === thread.id).resolved,
    true,
  );
  assert.equal(
    data.changes.find((c: any) => c.threadId === thread.id).state,
    "accepted",
  );
  await request(`/threads/${thread.id}/reopen`, {});
  assert.ok(find(doc, nodeId)!.toString().includes("Clarified wording."));
  assert.ok(
    (await get()).threads.find((t: any) => t.id === thread.id).messages.length,
  );
  console.log("PASS thread resolution and reopening");
  // Citation validation rejects fabricated sources.
  const citation = await queue("Support the argument");
  await claim();
  await request(
    "/worker/event",
    {
      taskId: citation.id,
      text:
        JSON.stringify({
          type: "replace",
          nodeId,
          text: "Unsupported wording.",
          citations: [
            {
              sourceId: "invented",
              quote: "invented passage",
              relation: "support",
            },
          ],
        }) + "\n",
    },
    400,
  );
  assert.ok(!find(doc, nodeId)!.toString().includes("Unsupported wording."));
  console.log("PASS invented citations are rejected");
  // Browser-origin and worker authentication boundaries.
  let response = await fetch(base + "/documents", {
    method: "POST",
    headers: {
      origin: "https://attacker.invalid",
      "content-type": "application/json",
    },
    body: "{}",
  });
  assert.equal(response.status, 403);
  response = await fetch(base + "/worker/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(response.status, 401);
  console.log("PASS origin and worker authentication");
  console.log("All protocol integration checks passed.");
} finally {
  provider?.destroy();
  server.kill("SIGTERM");
  await Promise.race([
    once(server, "exit"),
    new Promise((r) => setTimeout(r, 3000)),
  ]);
  server.kill("SIGKILL");
  await pool.query(`DROP DATABASE ${database} WITH (FORCE)`);
  await pool.end();
}
