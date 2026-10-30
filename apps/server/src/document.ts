import * as Y from "yjs";
import { randomUUID, createHash } from "node:crypto";
export const fragment = (doc: Y.Doc) => doc.getXmlFragment("default");
export function blocks(doc: Y.Doc) {
  return fragment(doc)
    .toArray()
    .filter((n): n is Y.XmlElement => n instanceof Y.XmlElement)
    .map((n) => ({
      id: n.getAttribute("id") as string,
      type: n.nodeName,
      text: textOf(n),
      xml: n.toString(),
    }));
}
export function textOf(n: Y.XmlElement | Y.XmlText): string {
  return n instanceof Y.XmlText
    ? n
        .toDelta()
        .map((part: any) =>
          typeof part.insert === "string" ? part.insert : "",
        )
        .join("")
    : n
        .toArray()
        .map((x) => textOf(x as any))
        .join("");
}
export function find(doc: Y.Doc, id: string): Y.XmlElement | undefined {
  let result: Y.XmlElement | undefined;
  const walk = (root: Y.XmlFragment | Y.XmlElement) => {
    for (const n of root.toArray())
      if (n instanceof Y.XmlElement) {
        if (n.getAttribute("id") === id) result = n;
        walk(n);
      }
  };
  walk(fragment(doc));
  return result;
}
export function snapshot(n: Y.XmlElement) {
  return {
    type: n.nodeName,
    attrs: n.getAttributes(),
    children: n.toArray().map((x) => x.toJSON()),
    xml: n.toString(),
    text: textOf(n),
  };
}
function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical(value[k])]),
    );
  return value;
}
export const fingerprint = (s: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(s)))
    .digest("hex");
export function paragraph(text: string, id: string = randomUUID()) {
  const p = new Y.XmlElement("paragraph");
  p.setAttribute("id", id);
  const t = new Y.XmlText();
  t.insert(0, text);
  p.insert(0, [t]);
  return p;
}
export function replaceText(n: Y.XmlElement, text: string, changeId?: string) {
  n.delete(0, n.length);
  const t = new Y.XmlText();
  t.insert(0, text);
  n.insert(0, [t]);
  if (changeId) n.setAttribute("changeId", changeId);
  else n.removeAttribute("changeId");
}
export function canReverse(current: any, change: any, later: any[]) {
  return (
    fingerprint(current) === fingerprint(change.after) &&
    !later.some(
      (c) => c.state !== "rejected" && c.dependencies.includes(change.id),
    )
  );
}
// Preserve rich content for rejection, including text deltas and nested elements.
export function encodeNode(n: Y.XmlElement): any {
  return {
    name: n.nodeName,
    attrs: n.getAttributes(),
    children: n
      .toArray()
      .map((c) =>
        c instanceof Y.XmlText
          ? { delta: c.toDelta() }
          : encodeNode(c as Y.XmlElement),
      ),
  };
}
export function decodeNode(data: any): Y.XmlElement {
  const n = new Y.XmlElement(data.name);
  for (const [k, v] of Object.entries(data.attrs)) n.setAttribute(k, v as any);
  n.insert(
    0,
    data.children.map((c: any) => {
      if (c.delta) {
        const t = new Y.XmlText();
        t.applyDelta(c.delta);
        return t;
      }
      return decodeNode(c);
    }),
  );
  return n;
}
export function restoreNode(n: Y.XmlElement, data: any) {
  n.delete(0, n.length);
  for (const k of Object.keys(n.getAttributes())) n.removeAttribute(k);
  for (const [k, v] of Object.entries(data.attrs)) n.setAttribute(k, v as any);
  n.insert(
    0,
    data.children.map((c: any) => {
      if (c.delta) {
        const t = new Y.XmlText();
        t.applyDelta(c.delta);
        return t;
      }
      return decodeNode(c);
    }),
  );
}
