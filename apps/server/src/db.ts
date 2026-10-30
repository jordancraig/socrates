import pg from "pg";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs/promises";
const url = process.env.DATABASE_URL;
const pool = url ? new pg.Pool({ connectionString: url }) : null;
await fs.mkdir("work/data", { recursive: true });
const embedded = pool ? null : new PGlite("work/data/postgres");
export async function query<T = any>(
  sql: string,
  params: any[] = [],
): Promise<T[]> {
  return (
    pool ? await pool.query(sql, params) : await embedded!.query(sql, params)
  ).rows as T[];
}
export async function transaction<T>(fn: (q: typeof query) => Promise<T>) {
  if (pool) {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const result = await fn(
        async (sql, params = []) => (await c.query(sql, params)).rows,
      );
      await c.query("COMMIT");
      return result;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  return embedded!.transaction(async (tx) =>
    fn(async (sql, params = []) => (await tx.query(sql, params)).rows as any),
  );
}
export async function initDb() {
  await query(`
CREATE TABLE IF NOT EXISTS workspaces(id text PRIMARY KEY,name text NOT NULL);
CREATE TABLE IF NOT EXISTS documents(id text PRIMARY KEY,workspace_id text REFERENCES workspaces(id),title text NOT NULL,instructions text NOT NULL DEFAULT '',purpose text NOT NULL DEFAULT '',audience text NOT NULL DEFAULT '',state bytea,updated_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS agents(id text PRIMARY KEY,data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS tasks(id text PRIMARY KEY,document_id text REFERENCES documents(id),data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS changes(id text PRIMARY KEY,document_id text REFERENCES documents(id),data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS threads(id text PRIMARY KEY,document_id text REFERENCES documents(id),data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS sources(id text PRIMARY KEY,workspace_id text REFERENCES workspaces(id),document_id text REFERENCES documents(id),title text NOT NULL,description text DEFAULT '',kind text,location text,content text NOT NULL,status text DEFAULT 'ready',created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS chunks(id text PRIMARY KEY,source_id text REFERENCES sources(id) ON DELETE CASCADE,ordinal int,content text NOT NULL,search tsvector GENERATED ALWAYS AS (to_tsvector('english',content)) STORED);
CREATE INDEX IF NOT EXISTS chunk_search ON chunks USING gin(search);
CREATE TABLE IF NOT EXISTS versions(id text PRIMARY KEY,document_id text REFERENCES documents(id),title text,state bytea NOT NULL,created_at timestamptz DEFAULT now());
`);
  await query(
    "INSERT INTO workspaces VALUES ('personal','My workspace') ON CONFLICT DO NOTHING",
  );
  await query(
    "INSERT INTO documents(id,workspace_id,title) VALUES ('welcome','personal','Untitled document') ON CONFLICT DO NOTHING",
  );
  for (const agent of [
    {
      id: "astra",
      name: "Astra",
      provider: "codex",
      color: "#bd5c52",
      model: "",
      enabled: true,
    },
    {
      id: "argon",
      name: "Argon",
      provider: "gemini",
      color: "#388b6a",
      model: "",
      enabled: true,
    },
    {
      id: "claude",
      name: "Claude",
      provider: "claude",
      color: "#9567b0",
      model: "",
      enabled: true,
    },
  ])
    await query("INSERT INTO agents VALUES ($1,$2) ON CONFLICT DO NOTHING", [
      agent.id,
      JSON.stringify(agent),
    ]);
  await query(
    `UPDATE tasks SET data=jsonb_set(jsonb_set(data,'{state}','"failed"'),'{error}','"Server restarted during task"') WHERE data->>'state' IN ('reading','writing','queued')`,
  );
}
