import { test } from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";
import {
  paragraph,
  fragment,
  encodeNode,
  restoreNode,
  replaceText,
  canReverse,
  find,
  fingerprint,
} from "../apps/server/src/document.ts";
import { assistantText } from "../packages/harness/adapters.ts";
import { chunks } from "../packages/conversion/index.ts";
test("rejection restores rich text, not just plain text", () => {
  const doc = new Y.Doc();
  const p = paragraph("original", "p1");
  fragment(doc).insert(0, [p]);
  (p.get(0) as Y.XmlText).format(0, 8, { bold: {} });
  const before = encodeNode(p);
  replaceText(p, "revised", "change1");
  const change = { id: "change1", before, after: encodeNode(p) };
  assert.equal(canReverse(encodeNode(p), change, []), true);
  restoreNode(p, before);
  assert.deepEqual(encodeNode(p), before);
});
test("human edits prevent destructive rejection", () => {
  const doc = new Y.Doc();
  const p = paragraph("original", "p1");
  fragment(doc).insert(0, [p]);
  replaceText(p, "agent text", "change1");
  const change = { id: "change1", after: encodeNode(p) };
  (p.get(0) as Y.XmlText).insert(5, " human");
  assert.equal(canReverse(encodeNode(p), change, []), false);
});
test("accepted dependent work prevents rejection of an ancestor", () => {
  const doc = new Y.Doc();
  const p = paragraph("same", "p1");
  fragment(doc).insert(0, [p]);
  const change = { id: "change1", after: encodeNode(p) };
  assert.equal(
    canReverse(encodeNode(p), change, [
      { state: "accepted", dependencies: ["change1"] },
    ]),
    false,
  );
  assert.equal(
    canReverse(encodeNode(p), change, [
      { state: "rejected", dependencies: ["change1"] },
    ]),
    true,
  );
});
test("stable ids survive unrelated concurrent insertion", () => {
  const a = new Y.Doc();
  const b = new Y.Doc();
  fragment(a).insert(0, [paragraph("target", "p1")]);
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  fragment(a).insert(0, [paragraph("human", "human")]);
  replaceText(find(b, "p1")!, "agent revision", "change1");
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  assert.equal(find(a, "human")!.toString().includes("human"), true);
  assert.deepEqual(encodeNode(find(a, "p1")!), encodeNode(find(b, "p1")!));
});
test("provider parsers exclude reasoning and tool output", () => {
  assert.equal(
    assistantText("codex", {
      type: "item.completed",
      item: { type: "command_execution", aggregated_output: "secret" },
    }),
    null,
  );
  assert.equal(
    assistantText("codex", {
      type: "item.completed",
      item: { type: "agent_message", text: "writing" },
    }),
    "writing\n",
  );
  assert.equal(
    assistantText("antigravity", {
      event: "step_update",
      step_update: { step_type: "user_input", state: "DONE" },
    }),
    null,
  );
  assert.equal(
    assistantText("antigravity", {
      event: "step_update",
      step_update: {
        step_type: "tool",
        tool_name: "view_file",
        state: "DONE",
      },
    }),
    null,
  );
  assert.equal(
    assistantText("antigravity", {
      event: "step_update",
      step_update: { step_type: "agent_response", text_delta: "hello" },
    }),
    "hello",
  );
  assert.equal(
    assistantText("claude", {
      type: "assistant",
      message: {
        content: [
          { type: "thinking", thinking: "private" },
          { type: "text", text: "public" },
        ],
      },
    }),
    "public",
  );
});
test("retrieval chunks remain within their budget", () => {
  const result = chunks("a".repeat(10000), 2400);
  assert.equal(result.join("").length, 10000);
  assert.ok(result.every((c) => c.length <= 2400));
});

test("JSONB key ordering does not cause false rejection conflicts", () => {
  assert.equal(
    fingerprint({ name: "paragraph", attrs: { id: "p1", changeId: "c1" } }),
    fingerprint({ attrs: { changeId: "c1", id: "p1" }, name: "paragraph" }),
  );
});
