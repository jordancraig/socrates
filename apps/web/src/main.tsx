import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import Placeholder from "@tiptap/extension-placeholder";
import UniqueID from "@tiptap/extension-unique-id";
import { TableKit } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";
import { marked } from "marked";
import Turndown from "turndown";
import {
  PanelLeft,
  Plus,
  Search,
  FileText,
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
  MoreHorizontal,
  Settings,
  History,
  Download,
  Upload,
  MessageSquare,
  Layers,
  List,
  Activity,
  X,
  Check,
  ArrowUp,
  Square,
  Link as LinkIcon,
  Paperclip,
  CornerDownLeft,
  Feather,
  Bold,
  Italic,
  ListOrdered,
  Quote,
  Table as TableIcon,
  Image as ImageIcon,
  Undo,
  Redo,
  Heading2,
  Menu,
  CheckCheck,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import type {
  Agent,
  Task,
  Change,
  Harness,
} from "../../../packages/shared/types";
import { Attribution } from "./editor";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/lora/latin-400.css";
import "@fontsource/lora/latin-500.css";
import "./style.css";
async function api(path: string, body?: any, method?: string) {
  const response = await fetch("/api" + path, {
    method: method || (body ? "POST" : "GET"),
    headers:
      body instanceof FormData ? {} : { "content-type": "application/json" },
    body: body
      ? body instanceof FormData
        ? body
        : JSON.stringify(body)
      : undefined,
  });
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: response.statusText }));
    throw new Error(error.error);
  }
  return response.json();
}
type Panel =
  | "palette"
  | "comments"
  | "changes"
  | "activity"
  | "outline"
  | "history"
  | null;
const icons = {
  palette: Layers,
  comments: MessageSquare,
  changes: CheckCheck,
  activity: Activity,
  outline: List,
  history: History,
};
const labels = {
  palette: "Document palette",
  comments: "Discussions",
  changes: "Suggested changes",
  activity: "Agent activity",
  outline: "Document outline",
  history: "Document history",
};
function App() {
  const [boot, setBoot] = useState<any>({
    documents: [],
    workspaces: [],
    agents: [],
    harnesses: [],
  });
  const [id, setId] = useState(
    () => localStorage.getItem("atelier-document") || "welcome",
  );
  const [data, setData] = useState<any>(null);
  const [nav, setNav] = useState(() => window.innerWidth > 640);
  const [panel, setPanel] = useState<Panel>(null);
  const [search, setSearch] = useState("");
  const [workspace, setWorkspace] = useState("personal");
  const [settings, setSettings] = useState(false);
  const [toast, setToast] = useState("");
  const [source, setSource] = useState<any>(null);
  const [version, setVersion] = useState<any>(null);
  const [invoke, setInvoke] = useState<{
    agentId: string;
    nodeId: string | null;
    threadId?: string;
    instruction: string;
    selectedText?: string | null;
  } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedThread, setSelectedThread] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [sync, setSync] = useState("Connecting");
  const [presence, setPresence] = useState<any[]>([]);
  const [threadFilter, setThreadFilter] = useState("open");
  const [comment, setComment] = useState("");
  const [newSource, setNewSource] = useState(false);
  const [sourceKind, setSourceKind] = useState("note");
  const [sourceScope, setSourceScope] = useState("document");
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceText, setSourceText] = useState("");
  const titleTimer = useRef<any>(null);
  const taskComposer = useRef<HTMLTextAreaElement>(null);
  const error = (e: any) => setToast(e.message || String(e));
  const refresh = async () => {
    const [b, d] = await Promise.all([
      api("/bootstrap"),
      api("/documents/" + id),
    ]);
    setBoot(b);
    setData(d);
    setWorkspace(d.document.workspace_id);
  };
  useEffect(() => {
    refresh().catch(error);
    localStorage.setItem("atelier-document", id);
  }, [id]);
  useEffect(() => {
    const events = new EventSource("/api/events");
    events.onmessage = (e) => {
      const value = JSON.parse(e.data);
      if (!value.documentId || value.documentId === id) refresh().catch(error);
      else api("/bootstrap").then(setBoot).catch(error);
    };
    const timer = setInterval(
      () =>
        api("/bootstrap")
          .then(setBoot)
          .catch(() => {}),
      10000,
    );
    return () => {
      events.close();
      clearInterval(timer);
    };
  }, [id]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 8000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const connection = useMemo(() => {
    const doc = new Y.Doc();
    const provider = new HocuspocusProvider({
      url: `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/collaboration`,
      name: id,
      document: doc,
      onSynced: () => {
        setReady(true);
        setSync("All changes saved");
      },
      onStatus: ({ status }) =>
        setSync(status === "connected" ? "Syncing…" : "Reconnecting…"),
      onUnsyncedChanges: ({ number }) =>
        setSync(number ? "Saving…" : "All changes saved"),
    });
    return { doc, provider };
  }, [id]);
  useEffect(() => {
    setReady(false);
    setPresence([]);
    const handle = () =>
      setPresence(
        Array.from(
          connection.provider.awareness?.getStates().values() || [],
        ).filter((s: any) => s.user),
      );
    connection.provider.awareness?.on("change", handle);
    return () => {
      connection.provider.destroy();
      connection.doc.destroy();
    };
  }, [connection]);
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ undoRedo: false }),
        TableKit,
        Image.configure({ allowBase64: true }),
        UniqueID.configure({
          types: [
            "paragraph",
            "heading",
            "blockquote",
            "table",
            "bulletList",
            "orderedList",
            "listItem",
          ],
        }),
        Attribution,
        Placeholder.configure({
          placeholder: "Start writing, or type @ to invite a collaborator…",
        }),
        Collaboration.configure({ document: connection.doc }),
        CollaborationCaret.configure({
          provider: connection.provider,
          user: { name: "You", color: "#537a88" },
        }),
      ],
      editable: true,
      editorProps: {
        attributes: {
          class: "document-prose",
          "aria-label": "Document editor",
        },
        handleClick: (view, pos, event) => {
          const target = (event.target as HTMLElement).closest(
            "[data-change-id]",
          );
          if (target) {
            setSelected(target.getAttribute("data-change-id"));
            setPanel("changes");
          }
          return false;
        },
        handleKeyDown: (view, event) => {
          if (event.key === "Escape") {
            setInvoke(null);
            return false;
          }
          return false;
        },
      },
      onSelectionUpdate: ({ editor }) => {
        const n = editor.state.selection.$from;
        for (let d = n.depth; d > 0; d--) {
          const node = n.node(d);
          if (node.attrs.id) {
            setSelected(node.attrs.id);
            break;
          }
        }
      },
      onUpdate: ({ editor }) => {
        const { selection } = editor.state;
        const text = selection.$from.parent.textBetween(
          0,
          selection.$from.parentOffset,
        );
        const mention = text.match(/@([\w-]*)$/);
        const slash = text.match(/^\/([\w-]*)$/);
        setAutocomplete(
          mention
            ? {
                type: "mention",
                query: mention[1],
                from: selection.from - mention[0].length,
                to: selection.from,
              }
            : slash
              ? {
                  type: "slash",
                  query: slash[1],
                  from: selection.from - slash[0].length,
                  to: selection.from,
                }
              : null,
        );
      },
    },
    [connection],
  );
  const [autocomplete, setAutocomplete] = useState<{
    type: "mention" | "slash";
    query: string;
    from: number;
    to: number;
  } | null>(null);
  useEffect(() => {
    (window as any).__atelierEditor = import.meta.env.DEV ? editor : undefined;
  }, [editor]);
  useEffect(() => {
    if (invoke) setTimeout(() => taskComposer.current?.focus(), 50);
  }, [invoke?.agentId]);
  const agents: Agent[] = boot.agents;
  const tasks: Task[] = data?.tasks || [];
  const changes: Change[] = data?.changes || [];
  const pending = changes.filter((c) =>
    ["pending", "conflict"].includes(c.state),
  );
  const active = tasks.filter((t) =>
    ["reading", "writing", "queued"].includes(t.state),
  );
  useEffect(() => {
    for (const c of changes) {
      const agent = agents.find((a) => a.id === c.agentId);
      const node = document.querySelector(
        `[data-change-id="${c.id}"]`,
      ) as HTMLElement | null;
      if (node) {
        node.style.setProperty(
          "--agent-color",
          c.dependencies.length ? "#5c83b1" : agent?.color || "#537a88",
        );
        node.setAttribute(
          "title",
          `${agent?.name || c.agentId} · Pending contribution`,
        );
      }
    }
  }, [changes, agents, sync]);
  const scope = () => {
    if (!editor) return null;
    const sel = editor.state.selection;
    if (sel.empty) return null;
    const n = sel.$from;
    for (let d = n.depth; d > 0; d--)
      if (n.node(d).attrs.id) return n.node(d).attrs.id;
    return null;
  };
  const invokeAgent = (
    agentId: string,
    threadId?: string,
    nodeId?: string | null,
  ) => {
    const node = nodeId === undefined ? scope() : nodeId;
    const selectedText =
      node && !editor?.state.selection.empty
        ? editor?.state.doc.textBetween(
            editor.state.selection.from,
            editor.state.selection.to,
          )
        : null;
    setInvoke({
      agentId,
      nodeId: node,
      threadId,
      instruction: "",
      selectedText,
    });
  };
  const newDoc = async () => {
    try {
      const d = await api("/documents", { workspaceId: workspace });
      setId(d.id);
    } catch (e) {
      error(e);
    }
  };
  const addThread = async () => {
    if (!comment.trim()) return;
    try {
      await api(`/documents/${id}/threads`, {
        text: comment,
        nodeId: scope() || selected || null,
      });
      setComment("");
    } catch (e) {
      error(e);
    }
  };
  const sendTask = async () => {
    if (!invoke) return;
    try {
      await api("/tasks", { documentId: id, ...invoke });
      setInvoke(null);
      setPanel("activity");
    } catch (e) {
      error(e);
    }
  };
  const action = (path: string, body: any = {}) => api(path, body).catch(error);
  const exportDoc = (format: string) => {
    if (!editor) return;
    const content =
      format === "html"
        ? `<!doctype html><html><head><meta charset="utf-8"><title>${data.document.title.replace(/[<>&]/g, "")}</title></head><body>${editor.getHTML()}</body></html>`
        : format === "md"
          ? new Turndown().turndown(editor.getHTML())
          : editor.getText();
    const url = URL.createObjectURL(
      new Blob([content], {
        type: format === "html" ? "text/html" : "text/plain",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = (data.document.title || "document") + "." + format;
    a.click();
    URL.revokeObjectURL(url);
  };
  const importFile = async (file: File) => {
    try {
      const text = await file.text();
      if (!["md", "txt", "html"].includes(file.name.split(".").pop() || ""))
        throw new Error(
          "Editor import supports Markdown, text, and HTML. Add PDF or DOCX to the palette.",
        );
      if (
        editor?.getText().trim() &&
        !confirm(
          "Import will replace this document. Save a history snapshot and continue?",
        )
      )
        return;
      await api(`/documents/${id}/versions`, { title: "Before import" });
      editor?.commands.setContent(
        file.name.endsWith(".md")
          ? await marked.parse(text)
          : file.name.endsWith(".html")
            ? text
            : text
                .split("\n\n")
                .map(
                  (p) =>
                    `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`,
                )
                .join(""),
      );
    } catch (e) {
      error(e);
    }
  };
  const uploadSource = async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    form.append("scope", sourceScope);
    try {
      await api(`/documents/${id}/sources`, form);
      setToast("Source added to the shared palette");
    } catch (e) {
      error(e);
    }
  };
  const saveSource = async () => {
    try {
      await api(`/documents/${id}/sources`, {
        title: sourceTitle,
        scope: sourceScope,
        ...(sourceKind === "web"
          ? { url: sourceText }
          : { content: sourceText }),
      });
      setNewSource(false);
      setSourceTitle("");
      setSourceText("");
    } catch (e) {
      error(e);
    }
  };
  const jump = (nodeId: string) => {
    const element = editor?.view.dom.querySelector(`[data-id="${nodeId}"]`);
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const togglePanel = (p: Panel) => setPanel(panel === p ? null : p);
  return (
    <div className="app">
      <aside className={"navigation " + (!nav ? "collapsed" : "")}>
        <div className="brand">
          <span className="brand-icon">
            <Feather size={20} />
          </span>
          <span>
            atelier<span className="brand-period">.</span>
          </span>
          <button
            className="icon-button nav-collapse"
            onClick={() => setNav(false)}
            title="Collapse navigation"
          >
            <PanelLeft size={17} />
          </button>
        </div>
        <button
          className="workspace-selector"
          onClick={() => {
            const i = boot.workspaces.findIndex((w: any) => w.id === workspace);
            setWorkspace(
              boot.workspaces[(i + 1) % boot.workspaces.length]?.id ||
                "personal",
            );
          }}
        >
          <span className="workspace-avatar">
            {boot.workspaces.find((w: any) => w.id === workspace)?.name[0] ||
              "M"}
          </span>
          <span>
            {boot.workspaces.find((w: any) => w.id === workspace)?.name ||
              "My workspace"}
            <small>Personal workspace</small>
          </span>
          <ChevronDown size={15} />
        </button>
        <label className="search">
          <Search size={15} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a document"
          />
          <kbd>⌘ K</kbd>
        </label>
        <div className="nav-heading">
          WORKSPACE
          <button
            onClick={() => {
              const name = prompt("Workspace name");
              if (name) action("/workspaces", { name });
            }}
            title="New workspace"
          >
            <Plus size={14} />
          </button>
        </div>
        <button className="nav-root" onClick={() => setSearch("")}>
          <FileText size={16} /> All documents{" "}
          <span>
            {
              boot.documents.filter((d: any) => d.workspace_id === workspace)
                .length
            }
          </span>
        </button>
        <div className="nav-heading documents-heading">
          DOCUMENTS
          <button onClick={newDoc} title="New document">
            <Plus size={15} />
          </button>
        </div>
        <nav>
          {boot.documents
            .filter(
              (d: any) =>
                d.workspace_id === workspace &&
                d.title.toLowerCase().includes(search.toLowerCase()),
            )
            .map((d: any) => (
              <button
                key={d.id}
                className={"document-link " + (id === d.id ? "active" : "")}
                onClick={() => setId(d.id)}
              >
                <FileText size={16} />
                <span>{d.title || "Untitled document"}</span>
                {id === d.id && <span className="active-dot" />}
              </button>
            ))}
        </nav>
        <button className="new-document" onClick={newDoc}>
          <Plus size={15} /> New document
        </button>
        <div className="sidebar-bottom">
          <div className="quiet-note">
            <span className="tiny-orbit" />
            <span>
              A little space.
              <br />A better way to write.
            </span>
          </div>
          <button className="profile" onClick={() => setSettings(true)}>
            <span className="human-avatar">Y</span>
            <span>
              Your local workspace<small>Made for thinking together</small>
            </span>
            <Settings size={16} />
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="breadcrumbs">
            {!nav && (
              <button
                className="icon-button"
                onClick={() => setNav(true)}
                title="Open navigation"
              >
                <PanelLeft size={18} />
              </button>
            )}
            <span>
              {boot.workspaces.find(
                (w: any) => w.id === data?.document.workspace_id,
              )?.name || "My workspace"}
            </span>
            <ChevronRight size={13} />
            <span className="breadcrumb-document">
              {data?.document.title || "Untitled document"}
            </span>
            <span className="private-label">Local</span>
          </div>
          <div className="top-actions">
            <span className="save-status">
              <span
                className={
                  "status-dot " + (sync.includes("saved") ? "saved" : "")
                }
              />
              {sync}
            </span>
            <div className="presence">
              <span className="avatar you" title="You">
                Y
              </span>
              {agents
                .filter((a) => a.enabled)
                .slice(0, 3)
                .map((agent) => (
                  <button
                    key={agent.id}
                    className={
                      "avatar agent " +
                      (active.some((t) => t.agentId === agent.id)
                        ? "working"
                        : "")
                    }
                    style={{ "--avatar-color": agent.color } as any}
                    title={`${agent.name} · ${active.find((t) => t.agentId === agent.id)?.state || "Idle"} · Click to follow`}
                    onClick={() => {
                      const t = active.find((t) => t.agentId === agent.id);
                      if (t?.nodeId) jump(t.nodeId);
                      setPanel("activity");
                    }}
                  >
                    {agent.name[0]}
                    <span />
                  </button>
                ))}
            </div>
            <button
              className="icon-button"
              onClick={() => togglePanel("history")}
              title="Document history"
            >
              <History size={18} />
            </button>
            <details className="export-menu">
              <summary className="icon-button" title="Import and export">
                <Download size={18} />
              </summary>
              <div className="dropdown">
                {["md", "html", "txt"].map((f) => (
                  <button key={f} onClick={() => exportDoc(f)}>
                    Export {f.toUpperCase()}
                  </button>
                ))}
                <label>
                  Import document
                  <input
                    hidden
                    type="file"
                    accept=".txt,.md,.html"
                    onChange={(e) =>
                      e.target.files?.[0] && importFile(e.target.files[0])
                    }
                  />
                </label>
              </div>
            </details>
            <button
              className="icon-button"
              onClick={() => setSettings(true)}
              title="Settings"
            >
              <Settings size={18} />
            </button>
            <button
              className={
                "palette-toggle " + (panel === "palette" ? "selected" : "")
              }
              onClick={() => togglePanel("palette")}
            >
              <Layers size={16} /> Palette
            </button>
          </div>
        </header>
        <div className="editor-layout">
          <main className="canvas">
            <div className="document-container">
              <div className="document-eyebrow">
                <span className="document-symbol">
                  <FileText size={14} />
                </span>{" "}
                COLLABORATIVE DOCUMENT <span className="eyebrow-line" />
              </div>
              <input
                className="document-title"
                aria-label="Document title"
                key={id + ":" + (data?.document.id || "")}
                defaultValue={data?.document.title || ""}
                placeholder="Untitled document"
                onChange={(e) => {
                  const value = e.target.value;
                  clearTimeout(titleTimer.current);
                  titleTimer.current = setTimeout(
                    () =>
                      api("/documents/" + id, { title: value }, "PATCH").catch(
                        error,
                      ),
                    400,
                  );
                }}
              />
              <div className="document-meta">
                <span className="mini-human">Y</span>
                <span>
                  You, with{" "}
                  {agents
                    .filter((a) => a.enabled)
                    .map((a) => a.name)
                    .join(", ")}
                </span>
                <span className="meta-dot">·</span>
                <span>
                  {new Date().toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              </div>
              <div className="format-bar">
                <button
                  title="Undo (⌘Z)"
                  onClick={() => editor?.chain().focus().undo().run()}
                >
                  <Undo size={16} />
                </button>
                <button
                  title="Redo (⌘⇧Z)"
                  onClick={() => editor?.chain().focus().redo().run()}
                >
                  <Redo size={16} />
                </button>
                <i />
                <button
                  className="text-tool"
                  onClick={() =>
                    editor?.chain().focus().toggleHeading({ level: 2 }).run()
                  }
                >
                  Normal text <ChevronDown size={12} />
                </button>
                <i />
                <button
                  title="Bold (⌘B)"
                  className={editor?.isActive("bold") ? "is-active" : ""}
                  onClick={() => editor?.chain().focus().toggleBold().run()}
                >
                  <Bold size={16} />
                </button>
                <button
                  title="Italic (⌘I)"
                  onClick={() => editor?.chain().focus().toggleItalic().run()}
                >
                  <Italic size={16} />
                </button>
                <button
                  title="Add link"
                  onClick={() => {
                    const href = prompt("Link URL (https://…)");
                    if (href) editor?.chain().focus().setLink({ href }).run();
                  }}
                >
                  <LinkIcon size={16} />
                </button>
                <i />
                <button
                  title="Bullet list"
                  onClick={() =>
                    editor?.chain().focus().toggleBulletList().run()
                  }
                >
                  <List size={17} />
                </button>
                <button
                  title="Numbered list"
                  onClick={() =>
                    editor?.chain().focus().toggleOrderedList().run()
                  }
                >
                  <ListOrdered size={17} />
                </button>
                <button
                  title="Quote"
                  onClick={() =>
                    editor?.chain().focus().toggleBlockquote().run()
                  }
                >
                  <Quote size={16} />
                </button>
                <button
                  title="Insert table"
                  onClick={() =>
                    editor
                      ?.chain()
                      .focus()
                      .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                      .run()
                  }
                >
                  <TableIcon size={16} />
                </button>
                <label title="Insert image">
                  <ImageIcon size={16} />
                  <input
                    hidden
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        if (f.size > 2 * 1024 * 1024)
                          return error(new Error("Images must be under 2 MB"));
                        const r = new FileReader();
                        r.onload = () =>
                          editor
                            ?.chain()
                            .focus()
                            .setImage({ src: r.result as string, alt: f.name })
                            .run();
                        r.readAsDataURL(f);
                      }
                    }}
                  />
                </label>
                <span className="format-spacer" />
                <button
                  title="Discuss selected block"
                  onClick={() => {
                    setPanel("comments");
                  }}
                >
                  <MessageSquare size={16} />
                  <Plus size={9} />
                </button>
              </div>
              <div className="editor-wrap">
                {editor && (
                  <>
                    <BubbleMenu editor={editor}>
                      <div className="selection-toolbar">
                        <button
                          title="Bold selection"
                          onClick={() =>
                            editor.chain().focus().toggleBold().run()
                          }
                        >
                          <Bold size={14} />
                        </button>
                        <button
                          title="Italic selection"
                          onClick={() =>
                            editor.chain().focus().toggleItalic().run()
                          }
                        >
                          <Italic size={14} />
                        </button>
                        <i />
                        {agents
                          .filter((a) => a.enabled)
                          .map((a) => (
                            <button
                              key={a.id}
                              onClick={() => invokeAgent(a.id)}
                            >
                              <span
                                className="agent-dot"
                                style={{ background: a.color }}
                              />
                              {a.name}
                            </button>
                          ))}
                        <i />
                        <button
                          title="Discuss selection"
                          onClick={() => setPanel("comments")}
                        >
                          <MessageSquare size={14} />
                        </button>
                      </div>
                    </BubbleMenu>
                    <EditorContent editor={editor} />
                  </>
                )}{" "}
                {!ready && (
                  <span className="connecting">
                    Connecting to the shared document…
                  </span>
                )}
                {autocomplete && (
                  <div className="autocomplete">
                    {autocomplete.type === "mention"
                      ? agents
                          .filter(
                            (a) =>
                              a.enabled &&
                              a.name
                                .toLowerCase()
                                .startsWith(autocomplete.query.toLowerCase()),
                          )
                          .map((a) => (
                            <button
                              key={a.id}
                              onClick={() => {
                                editor
                                  ?.chain()
                                  .focus()
                                  .deleteRange({
                                    from: autocomplete.from,
                                    to: autocomplete.to,
                                  })
                                  .run();
                                invokeAgent(
                                  a.id,
                                  undefined,
                                  scope() || selected,
                                );
                                setAutocomplete(null);
                              }}
                            >
                              <span
                                className="agent-dot"
                                style={{ background: a.color }}
                              />
                              {a.name}
                              <small>{a.provider}</small>
                            </button>
                          ))
                      : [
                          {
                            name: "Heading",
                            run: () =>
                              editor
                                ?.chain()
                                .focus()
                                .toggleHeading({ level: 2 })
                                .run(),
                          },
                          {
                            name: "Bullet list",
                            run: () =>
                              editor?.chain().focus().toggleBulletList().run(),
                          },
                          {
                            name: "Table",
                            run: () =>
                              editor
                                ?.chain()
                                .focus()
                                .insertTable({
                                  rows: 3,
                                  cols: 3,
                                  withHeaderRow: true,
                                })
                                .run(),
                          },
                          {
                            name: "Quote",
                            run: () =>
                              editor?.chain().focus().toggleBlockquote().run(),
                          },
                        ]
                          .filter((c) =>
                            c.name
                              .toLowerCase()
                              .includes(autocomplete.query.toLowerCase()),
                          )
                          .map((c) => (
                            <button
                              key={c.name}
                              onClick={() => {
                                editor?.commands.deleteRange({
                                  from: autocomplete.from,
                                  to: autocomplete.to,
                                });
                                c.run();
                                setAutocomplete(null);
                              }}
                            >
                              {c.name}
                            </button>
                          ))}
                  </div>
                )}
              </div>
              {!editor?.getText().trim() && ready && (
                <div className="empty-prompt">
                  <span className="empty-mark">
                    <Feather size={23} />
                  </span>
                  <h2>Every good idea starts somewhere.</h2>
                  <p>
                    This is your space to think, write, and work things out.
                    <br />
                    Start with a sentence. Invite another perspective when
                    you’re ready.
                  </p>
                  <div>
                    <button onClick={() => invokeAgent("astra")}>
                      <span
                        className="agent-dot"
                        style={{ background: "#bd5c52" }}
                      />{" "}
                      Write with Astra <ArrowUpRight size={14} />
                    </button>
                    <button onClick={() => setPanel("palette")}>
                      <Layers size={14} /> Add your context
                    </button>
                  </div>
                  <small>
                    Type <kbd>@</kbd> to invite an agent · <kbd>/</kbd> for
                    writing tools
                  </small>
                </div>
              )}
              <div className="document-footer">
                <span>
                  {editor?.getText().trim().split(/\s+/).filter(Boolean)
                    .length || 0}{" "}
                  words
                </span>
                <span>
                  Shared document <span className="meta-dot">·</span>{" "}
                  {presence.length || 1} author{presence.length > 1 ? "s" : ""}{" "}
                  connected
                </span>
              </div>
            </div>
            <div className="collaborator-dock">
              <div className="dock-label">
                <span className="status-dot saved" /> YOUR COLLABORATORS
              </div>
              <div className="dock-agents">
                {agents
                  .filter((a) => a.enabled)
                  .map((a) => {
                    const h: Harness | undefined = boot.harnesses.find(
                      (h: Harness) => h.provider === a.provider,
                    );
                    const t = active.find((t) => t.agentId === a.id);
                    return (
                      <button key={a.id} onClick={() => invokeAgent(a.id)}>
                        <span
                          className="dock-avatar"
                          style={{ background: a.color + "18", color: a.color }}
                        >
                          {a.name[0]}
                        </span>
                        <span>
                          {a.name}
                          <small>
                            {t
                              ? t.state
                              : h?.installed && boot.workerOnline
                                ? "Ready to collaborate"
                                : "Connect " +
                                  (a.provider === "codex"
                                    ? "Codex"
                                    : a.provider === "gemini"
                                      ? "Gemini"
                                      : "Claude")}
                          </small>
                        </span>
                        <Plus size={13} />
                      </button>
                    );
                  })}
              </div>
              <span className="dock-hint">
                A different perspective is a mention away.
              </span>
            </div>
          </main>
          <aside className="panel-rail">
            {(
              [
                "palette",
                "comments",
                "changes",
                "activity",
                "outline",
              ] as Panel[]
            ).map((p) => {
              const Icon = icons[p!];
              return (
                <button
                  className={panel === p ? "active" : ""}
                  onClick={() => togglePanel(p)}
                  title={labels[p!]}
                  key={p}
                >
                  <Icon size={18} />
                  {p === "changes" && pending.length > 0 && (
                    <span>{pending.length}</span>
                  )}
                </button>
              );
            })}
          </aside>
          {panel && (
            <aside className="context-panel">
              <div className="panel-header">
                <span>
                  {React.createElement(icons[panel], { size: 17 })}
                  {labels[panel]}
                  {panel === "changes" && <small>{pending.length}</small>}
                </span>
                <button
                  className="icon-button"
                  onClick={() => setPanel(null)}
                  title="Close panel"
                >
                  <X size={16} />
                </button>
              </div>
              {panel === "palette" && (
                <>
                  <div className="panel-intro">
                    <span className="small-label">A SHARED UNDERSTANDING</span>
                    <p>
                      Give every collaborator the context behind your words.
                    </p>
                  </div>
                  <div className="palette-actions">
                    <button onClick={() => setNewSource(true)}>
                      <Plus size={15} /> Add a source
                    </button>
                    <label>
                      <Paperclip size={15} /> Upload
                      <input
                        hidden
                        type="file"
                        accept=".pdf,.docx,.txt,.md"
                        onChange={(e) =>
                          e.target.files?.[0] && uploadSource(e.target.files[0])
                        }
                      />
                    </label>
                  </div>
                  <div
                    className="dropzone"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      Array.from(e.dataTransfer.files).forEach(uploadSource);
                    }}
                  >
                    <Upload size={18} />
                    <span>
                      Drop reference files here
                      <small>PDF, DOCX, TXT, Markdown · up to 15 MB</small>
                    </span>
                  </div>
                  <div className="panel-section-title">WRITING BRIEF</div>
                  <label className="field-label">
                    Purpose
                    <input
                      key={id + "purpose"}
                      defaultValue={data?.document.purpose}
                      placeholder="What should this document achieve?"
                      onBlur={(e) =>
                        api(
                          "/documents/" + id,
                          { purpose: e.target.value },
                          "PATCH",
                        ).catch(error)
                      }
                    />
                  </label>
                  <label className="field-label">
                    Audience
                    <input
                      key={id + "audience"}
                      defaultValue={data?.document.audience}
                      placeholder="Who are we writing for?"
                      onBlur={(e) =>
                        api(
                          "/documents/" + id,
                          { audience: e.target.value },
                          "PATCH",
                        ).catch(error)
                      }
                    />
                  </label>
                  <label className="field-label">
                    Shared instructions
                    <textarea
                      key={id + "instructions" + data?.document.instructions}
                      defaultValue={data?.document.instructions}
                      placeholder="Voice, constraints, and agreed editorial decisions…"
                      onBlur={(e) =>
                        api(
                          "/documents/" + id,
                          { instructions: e.target.value },
                          "PATCH",
                        ).catch(error)
                      }
                    />
                  </label>
                  <div className="panel-section-title">
                    REFERENCE SOURCES <span>{data?.sources.length || 0}</span>
                  </div>
                  {data?.sources.length ? (
                    data.sources.map((s: any) => (
                      <button
                        className="source-card"
                        key={s.id}
                        onClick={() =>
                          api("/sources/" + s.id)
                            .then(setSource)
                            .catch(error)
                        }
                      >
                        <span className="source-icon">
                          {s.kind === "web" ? (
                            <LinkIcon size={17} />
                          ) : (
                            <FileText size={17} />
                          )}
                        </span>
                        <span>
                          <strong>{s.title}</strong>
                          <small>
                            {s.document_id ? "Document" : "Workspace"} context ·{" "}
                            {s.kind.toUpperCase()}
                          </small>
                          <p>{s.preview.slice(0, 100)}</p>
                        </span>
                        <ChevronRight size={14} />
                      </button>
                    ))
                  ) : (
                    <div className="panel-empty">
                      <Layers size={27} />
                      <h3>The story behind the story.</h3>
                      <p>
                        Add references, notes, and instructions.
                        <br />
                        Your agents will draw on relevant passages as they work.
                      </p>
                    </div>
                  )}
                  <div className="panel-footnote">
                    <Check size={13} /> Sources are shared across collaborators.
                  </div>
                </>
              )}
              {panel === "comments" && (
                <>
                  <div className="filter-row">
                    {["open", "resolved", "all"].map((f) => (
                      <button
                        className={threadFilter === f ? "selected" : ""}
                        key={f}
                        onClick={() => setThreadFilter(f)}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                  <div className="comment-compose">
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Discuss the selected paragraph…"
                    />
                    <button className="primary" onClick={addThread}>
                      Start discussion <ArrowUp size={14} />
                    </button>
                  </div>
                  {data?.threads
                    .filter(
                      (t: any) =>
                        threadFilter === "all" ||
                        (threadFilter === "resolved"
                          ? t.resolved
                          : !t.resolved),
                    )
                    .map((thread: any) => (
                      <div
                        className={
                          "thread-card " +
                          (selectedThread === thread.id ? "focused" : "")
                        }
                        key={thread.id}
                        onClick={() => setSelectedThread(thread.id)}
                      >
                        <button
                          className="anchor-link"
                          onClick={() => jump(thread.nodeId)}
                        >
                          <Quote size={12} />
                          {thread.nodeId
                            ? "Anchored to a paragraph"
                            : "Document discussion"}
                        </button>
                        {thread.messages.map((m: any) => (
                          <div className="message" key={m.id}>
                            <strong>
                              {m.author}
                              <small>
                                {new Date(m.createdAt).toLocaleTimeString(
                                  "en-GB",
                                  { hour: "2-digit", minute: "2-digit" },
                                )}
                              </small>
                            </strong>
                            <p>{m.text}</p>
                          </div>
                        ))}
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            const form = e.currentTarget;
                            const text = new FormData(form).get(
                              "reply",
                            ) as string;
                            action(`/threads/${thread.id}/reply`, { text });
                            form.reset();
                          }}
                        >
                          <input
                            name="reply"
                            placeholder="Add to the discussion…"
                            required
                          />
                          <button title="Send reply">
                            <ArrowUp size={15} />
                          </button>
                        </form>
                        <div className="thread-agents">
                          {agents
                            .filter((a) => a.enabled)
                            .map((a) => (
                              <button
                                key={a.id}
                                onClick={() =>
                                  invokeAgent(a.id, thread.id, thread.nodeId)
                                }
                              >
                                @{a.name}
                              </button>
                            ))}
                        </div>
                        <div className="thread-actions">
                          <button
                            onClick={() =>
                              action(
                                `/threads/${thread.id}/${thread.resolved ? "reopen" : "resolve"}`,
                              )
                            }
                          >
                            <Check size={13} />
                            {thread.resolved
                              ? "Reopen"
                              : "Resolve & accept related edits"}
                          </button>
                          <button
                            title="Save an editorial decision"
                            onClick={() => {
                              const text = prompt(
                                "Agreed decision to add to document instructions",
                              );
                              if (text)
                                action(`/threads/${thread.id}/promote`, {
                                  text,
                                });
                            }}
                          >
                            Save decision
                          </button>
                        </div>
                      </div>
                    ))}
                  {!data?.threads.length && (
                    <div className="panel-empty">
                      <MessageSquare size={27} />
                      <h3>Good writing is a conversation.</h3>
                      <p>
                        Select a paragraph and open a discussion. Invite an
                        agent for another point of view.
                      </p>
                    </div>
                  )}
                </>
              )}
              {panel === "changes" && (
                <>
                  <div className="panel-intro">
                    <p>
                      Agent contributions stay visible until you decide. Your
                      edits always take priority.
                    </p>
                  </div>
                  {pending.map((c) => {
                    const a = agents.find((a) => a.id === c.agentId);
                    return (
                      <div
                        className={
                          "change-card " + (selected === c.id ? "focused" : "")
                        }
                        key={c.id}
                      >
                        <div className="change-heading">
                          <span
                            className="agent-dot"
                            style={{ background: a?.color }}
                          />
                          <strong>{a?.name}</strong>
                          <small>
                            {c.state === "conflict"
                              ? "Needs a decision"
                              : c.type === "append"
                                ? "Added a paragraph"
                                : "Revised a paragraph"}
                          </small>
                        </div>
                        <button
                          className="anchor-link"
                          onClick={() => jump(c.nodeId)}
                        >
                          View in document <ArrowUpRight size={12} />
                        </button>
                        {c.before && (
                          <div className="diff-before">
                            <small>PREVIOUS WORDING</small>
                            {nodeText(c.before)}
                          </div>
                        )}
                        <div className="diff-after">
                          <small>
                            {c.state === "conflict"
                              ? "PRESERVED PROPOSAL"
                              : "CURRENT CONTRIBUTION"}
                          </small>
                          {nodeText(c.after)}
                        </div>
                        {c.dependencies.length > 0 && (
                          <p className="help-text">
                            Builds on {c.dependencies.length} earlier
                            contribution(s). Full attribution is retained.
                          </p>
                        )}
                        {c.citations.map((citation: any, i: number) => (
                          <button
                            className="citation"
                            key={i}
                            onClick={() =>
                              api("/sources/" + citation.sourceId)
                                .then(setSource)
                                .catch(error)
                            }
                          >
                            <LinkIcon size={12} />
                            {citation.relation}: “{citation.quote.slice(0, 80)}”
                          </button>
                        ))}
                        {c.state === "pending" ? (
                          <div className="change-buttons">
                            <button
                              onClick={() => action(`/changes/${c.id}/accept`)}
                            >
                              <Check size={14} /> Accept
                            </button>
                            <button
                              onClick={() => action(`/changes/${c.id}/reject`)}
                            >
                              <X size={14} /> Reject
                            </button>
                          </div>
                        ) : (
                          <p className="help-text">
                            The original changed while this agent worked. Copy
                            the proposal into your document after reviewing the
                            current wording.
                          </p>
                        )}
                      </div>
                    );
                  })}
                  {!pending.length && (
                    <div className="panel-empty">
                      <CheckCheck size={28} />
                      <h3>All words accounted for.</h3>
                      <p>
                        Contributions awaiting your review will appear here.
                      </p>
                    </div>
                  )}
                  <details className="audit-history">
                    <summary>
                      Reviewed contributions ({changes.length - pending.length})
                    </summary>
                    {changes
                      .filter((c) => !["pending", "conflict"].includes(c.state))
                      .map((c) => (
                        <div key={c.id}>
                          <strong>
                            {agents.find((a) => a.id === c.agentId)?.name}
                          </strong>{" "}
                          · {c.state}
                          <p>{nodeText(c.after)}</p>
                        </div>
                      ))}
                  </details>
                </>
              )}
              {panel === "activity" && (
                <>
                  <div className="activity-top">
                    <span>
                      {active.length} active task
                      {active.length !== 1 ? "s" : ""}
                    </span>
                    <button onClick={() => action(`/documents/${id}/stop`)}>
                      <Square size={11} /> Stop all
                    </button>
                  </div>
                  {!boot.workerOnline && (
                    <div className="integration-notice">
                      No host worker connected. Open Settings for local
                      connection instructions.
                    </div>
                  )}
                  {tasks
                    .slice()
                    .reverse()
                    .map((t) => (
                      <div className="task-card" key={t.id}>
                        <div className="task-heading">
                          <span
                            className="agent-dot"
                            style={{
                              background: agents.find((a) => a.id === t.agentId)
                                ?.color,
                            }}
                          />
                          <strong>
                            {agents.find((a) => a.id === t.agentId)?.name}
                          </strong>
                          <span className={"state " + t.state}>{t.state}</span>
                        </div>
                        <p>{t.instruction}</p>
                        <small>
                          {t.nodeId ? "Selected paragraph" : "Document"} · Turn{" "}
                          {t.turn + 1} of 3
                        </small>
                        {t.error && <div className="task-error">{t.error}</div>}
                        <details>
                          <summary>Harness output</summary>
                          <pre>
                            {t.output || "Waiting for actual CLI output…"}
                          </pre>
                        </details>
                        {["queued", "reading", "writing"].includes(t.state) ? (
                          <button
                            onClick={() => action(`/tasks/${t.id}/cancel`)}
                          >
                            <Square size={11} /> Stop task
                          </button>
                        ) : (
                          ["failed", "cancelled", "conflict"].includes(
                            t.state,
                          ) && (
                            <button
                              onClick={() => action(`/tasks/${t.id}/retry`)}
                            >
                              <RefreshCw size={12} /> Retry with current context
                            </button>
                          )
                        )}
                      </div>
                    ))}
                  {!tasks.length && (
                    <div className="panel-empty">
                      <Activity size={28} />
                      <h3>A place for every perspective.</h3>
                      <p>
                        Click a collaborator or type @ in your document to
                        begin.
                      </p>
                    </div>
                  )}
                </>
              )}
              {panel === "outline" && (
                <div className="outline-list">
                  {(() => {
                    const headings: any[] = [];
                    editor?.state.doc.descendants((n) => {
                      if (n.type.name === "heading")
                        headings.push({
                          id: n.attrs.id,
                          text: n.textContent,
                          level: n.attrs.level,
                        });
                    });
                    return headings.length ? (
                      headings.map((h) => (
                        <button
                          key={h.id}
                          style={{ paddingLeft: 16 + (h.level - 1) * 12 }}
                          onClick={() => jump(h.id)}
                        >
                          {h.text}
                        </button>
                      ))
                    ) : (
                      <div className="panel-empty">
                        <List size={28} />
                        <h3>Room for structure.</h3>
                        <p>Add headings to build a navigable outline.</p>
                      </div>
                    );
                  })()}
                </div>
              )}
              {panel === "history" && (
                <>
                  <div className="panel-intro">
                    <p>
                      Keep a named snapshot before a new direction. Contribution
                      history is retained separately.
                    </p>
                    <button
                      className="secondary"
                      onClick={() => {
                        const title = prompt("Snapshot name", "Saved version");
                        if (title)
                          action(`/documents/${id}/versions`, { title });
                      }}
                    >
                      <Plus size={14} /> Save a snapshot
                    </button>
                  </div>
                  {data?.versions.map((v: any) => (
                    <button
                      className="version-card"
                      key={v.id}
                      onClick={() =>
                        api("/versions/" + v.id)
                          .then(setVersion)
                          .catch(error)
                      }
                    >
                      <History size={17} />
                      <span>
                        {v.title}
                        <small>
                          {new Date(v.created_at).toLocaleString("en-GB")}
                        </small>
                      </span>
                      <ChevronRight size={14} />
                    </button>
                  ))}
                </>
              )}
            </aside>
          )}
        </div>
        <footer className="app-status">
          <span>
            <span className="status-dot saved" /> Local-first workspace
          </span>
          <span>Think independently. Write together.</span>
          <button onClick={() => setPanel("activity")}>
            {active.length
              ? `${active.length} agent${active.length > 1 ? "s" : ""} working`
              : "Your next idea is welcome here"}{" "}
            <ArrowUpRight size={11} />
          </button>
        </footer>
      </div>
      {invoke && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setInvoke(null);
          }}
        >
          <div className="invoke-modal">
            <div className="modal-heading">
              <span>
                <span
                  className="agent-dot"
                  style={{
                    background: agents.find((a) => a.id === invoke.agentId)
                      ?.color,
                  }}
                />
                Work with {agents.find((a) => a.id === invoke.agentId)?.name}
              </span>
              <button
                className="icon-button"
                onClick={() => setInvoke(null)}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="scope-pill">
              {invoke.selectedText
                ? "Selected passage"
                : invoke.nodeId
                  ? "Selected paragraph"
                  : "Whole document"}
              {invoke.threadId ? " · In a discussion" : ""}
            </div>
            <textarea
              ref={taskComposer}
              value={invoke.instruction}
              onChange={(e) =>
                setInvoke({ ...invoke, instruction: e.target.value })
              }
              placeholder="A second opinion, a clearer argument, a place to start…"
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") sendTask();
              }}
            />
            <div className="invoke-footer">
              <small>Edits appear in your document for review.</small>
              <button
                className="primary"
                disabled={!invoke.instruction.trim()}
                onClick={sendTask}
              >
                Invite contribution <ArrowUp size={15} />
              </button>
            </div>
          </div>
        </div>
      )}
      {settings && (
        <div className="modal-backdrop">
          <div className="settings-modal">
            <div className="modal-heading">
              <span>Your collaborators</span>
              <button
                className="icon-button"
                onClick={() => setSettings(false)}
                title="Close settings"
              >
                <X size={18} />
              </button>
            </div>
            <p className="settings-intro">
              Different minds, one shared document. Connect authenticated CLI
              installations through your local worker.
            </p>
            <div className="worker-status">
              <span
                className={"status-dot " + (boot.workerOnline ? "saved" : "")}
              />
              {boot.workerOnline
                ? "Host worker connected"
                : "Host worker offline"}
            </div>
            {agents.map((a) => {
              const h: Harness | undefined = boot.harnesses.find(
                (h: Harness) => h.provider === a.provider,
              );
              return (
                <div className="agent-settings" key={a.id}>
                  <div className="agent-settings-heading">
                    <input
                      type="color"
                      aria-label={a.name + " color"}
                      value={a.color}
                      onChange={(e) =>
                        api(
                          "/agents/" + a.id,
                          { color: e.target.value },
                          "PATCH",
                        ).catch(error)
                      }
                    />
                    <input
                      aria-label={a.id + " name"}
                      defaultValue={a.name}
                      onBlur={(e) =>
                        api(
                          "/agents/" + a.id,
                          { name: e.target.value },
                          "PATCH",
                        ).catch(error)
                      }
                    />
                    <label>
                      <input
                        type="checkbox"
                        checked={a.enabled}
                        onChange={(e) =>
                          api(
                            "/agents/" + a.id,
                            { enabled: e.target.checked },
                            "PATCH",
                          ).catch(error)
                        }
                      />{" "}
                      Enabled
                    </label>
                  </div>
                  <div className="provider-line">
                    {a.provider === "codex"
                      ? "OpenAI Codex CLI"
                      : a.provider === "gemini"
                        ? "Google Gemini CLI"
                        : "Claude Code CLI"}
                    <span>{h?.installed ? "Installed" : "Unavailable"}</span>
                  </div>
                  {h?.installed ? (
                    <>
                      <small>
                        {h.version} · Authentication: {h.auth}
                      </small>
                      <label className="field-label">
                        Model
                        {h.models.length ? (
                          <select
                            value={a.model}
                            onChange={(e) =>
                              api(
                                "/agents/" + a.id,
                                { model: e.target.value },
                                "PATCH",
                              ).catch(error)
                            }
                          >
                            <option value="">CLI default</option>
                            {h.models.map((m) => (
                              <option key={m}>{m}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            defaultValue={a.model}
                            placeholder="CLI default (or explicit model ID)"
                            onBlur={(e) =>
                              api(
                                "/agents/" + a.id,
                                { model: e.target.value },
                                "PATCH",
                              ).catch(error)
                            }
                          />
                        )}
                      </label>
                      <small>{h.modelDiscovery}</small>
                    </>
                  ) : (
                    <p className="integration-error">
                      {h?.error ||
                        "Run the host worker on a computer with this CLI installed."}
                    </p>
                  )}
                </div>
              );
            })}
            <details className="setup-instructions">
              <summary>Local connection instructions</summary>
              <p>
                Start the backend and host worker with the same WORKER_TOKEN.
                The worker uses your installed CLI login. Run{" "}
                <code>npm run worker</code> on your host after setting{" "}
                <code>ATELIER_URL</code> and <code>WORKER_TOKEN</code>. No
                subscription or usage entitlement is inferred from login status;
                verify your provider’s current terms.
              </p>
              <p>
                Only real CLI output is used. Missing integrations fail
                explicitly. No paid API fallback is configured.
              </p>
            </details>
          </div>
        </div>
      )}
      {newSource && (
        <div className="modal-backdrop">
          <div className="source-modal">
            <div className="modal-heading">
              <span>Add shared context</span>
              <button
                className="icon-button"
                onClick={() => setNewSource(false)}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="filter-row">
              {["note", "web"].map((k) => (
                <button
                  className={sourceKind === k ? "selected" : ""}
                  onClick={() => setSourceKind(k)}
                  key={k}
                >
                  {k === "note" ? "Text or instructions" : "Web link"}
                </button>
              ))}
            </div>
            <label className="field-label">
              Source title
              <input
                value={sourceTitle}
                onChange={(e) => setSourceTitle(e.target.value)}
                placeholder="A useful name for this reference"
              />
            </label>
            <label className="field-label">
              {sourceKind === "web" ? "Public HTTPS URL" : "Reference text"}
              <textarea
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                placeholder={
                  sourceKind === "web"
                    ? "https://…"
                    : "Paste notes, evidence, or background…"
                }
              />
            </label>
            <label className="field-label">
              Context scope
              <select
                value={sourceScope}
                onChange={(e) => setSourceScope(e.target.value)}
              >
                <option value="document">This document</option>
                <option value="workspace">
                  All documents in this workspace
                </option>
              </select>
            </label>
            <button
              className="primary"
              onClick={saveSource}
              disabled={!sourceText.trim()}
            >
              Add to palette <Plus size={15} />
            </button>
          </div>
        </div>
      )}
      {source && (
        <div className="modal-backdrop">
          <div className="source-preview">
            <div className="modal-heading">
              <span>{source.title}</span>
              <button
                className="icon-button"
                onClick={() => setSource(null)}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>
            <small>
              {source.document_id ? "Document" : "Workspace"} context ·{" "}
              {source.kind}
            </small>
            {source.location && (
              <a href={source.location} target="_blank" rel="noreferrer">
                Original source <ExternalLink size={12} />
              </a>
            )}
            <pre>{source.content}</pre>
            <button
              className="danger-text"
              onClick={() => {
                api("/sources/" + source.id, undefined, "DELETE")
                  .then(() => setSource(null))
                  .catch(error);
              }}
            >
              Remove source
            </button>
          </div>
        </div>
      )}
      {version && (
        <div className="modal-backdrop">
          <div className="source-preview">
            <div className="modal-heading">
              <span>{version.title}</span>
              <button
                className="icon-button"
                onClick={() => setVersion(null)}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>
            <small>{new Date(version.createdAt).toLocaleString("en-GB")}</small>
            <pre>{version.blocks.map((b: any) => b.text).join("\n\n")}</pre>
            <p className="help-text">
              A read-only snapshot. Copy any wording you want to bring into the
              current document.
            </p>
          </div>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button onClick={() => setToast("")} title="Dismiss">
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
function nodeText(node: any): string {
  if (!node) return "";
  if (node.text !== undefined) return node.text;
  return (node.children || [])
    .map((c: any) =>
      c.delta
        ? c.delta
            .map((d: any) => (typeof d.insert === "string" ? d.insert : ""))
            .join("")
        : nodeText(c),
    )
    .join("");
}
createRoot(document.getElementById("root")!).render(<App />);
