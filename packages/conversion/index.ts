import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import Turndown from "turndown";
export async function extract(name: string, buffer: Buffer) {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "docx") return (await mammoth.extractRawText({ buffer })).value;
  if (ext === "pdf") {
    const p = new PDFParse({ data: buffer });
    try {
      return (await p.getText()).text;
    } finally {
      await p.destroy();
    }
  }
  if (["txt", "md", "markdown"].includes(ext || ""))
    return buffer.toString("utf8");
  throw new Error("Supported sources: PDF, DOCX, TXT and Markdown");
}
export function chunks(text: string, budget = 2400) {
  const out: string[] = [];
  let current = "";
  for (const p of text.split(/\n\s*\n/)) {
    if (current.length + p.length > budget && current) {
      out.push(current);
      current = "";
    }
    for (let i = 0; i < p.length; i += budget) {
      const part = p.slice(i, i + budget);
      if (current.length + part.length > budget) {
        out.push(current);
        current = "";
      }
      current += (current ? "\n\n" : "") + part;
    }
  }
  if (current.trim()) out.push(current);
  return out;
}
export function htmlText(html: string) {
  return new Turndown().turndown(html);
}
