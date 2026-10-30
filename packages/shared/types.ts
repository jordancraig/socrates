export type Provider = "codex" | "antigravity" | "claude";
export type Agent = {
  id: string;
  name: string;
  provider: Provider;
  color: string;
  model: string;
  enabled: boolean;
};
export type Harness = {
  provider: Provider;
  installed: boolean;
  version: string;
  auth: "authenticated" | "unknown" | "unavailable";
  models: string[];
  modelDiscovery: string;
  capabilities: {
    stream: "events" | "completed";
    resume: boolean;
    cancel: boolean;
  };
  error?: string;
};
export type TaskState =
  | "queued"
  | "reading"
  | "writing"
  | "completed"
  | "failed"
  | "cancelled"
  | "conflict";
export type Edit = {
  type: "replace" | "append" | "comment" | "delegate";
  nodeId?: string;
  text: string;
  citations?: {
    sourceId: string;
    quote: string;
    relation: "support" | "background";
  }[];
  agentId?: string;
};
export type Task = {
  id: string;
  documentId: string;
  agentId: string;
  instruction: string;
  nodeId: string | null;
  threadId: string | null;
  state: TaskState;
  output: string;
  error: string | null;
  createdAt: string;
  parentId: string | null;
  turn: number;
  context: any;
  selectedText?: string | null;
};
export type Change = {
  id: string;
  documentId: string;
  agentId: string;
  provider: string;
  model: string;
  nodeId: string;
  type: string;
  before: any;
  after: any;
  state: "pending" | "accepted" | "rejected" | "conflict";
  createdAt: string;
  threadId: string | null;
  dependencies: string[];
  citations: any[];
  baseVersion: string;
};
