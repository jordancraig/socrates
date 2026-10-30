import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { Provider, Harness, Agent } from "../shared/types.ts";
const exec = promisify(execFile);
const binaries = {
  codex: process.env.CODEX_BIN || "codex",
  claude: process.env.CLAUDE_BIN || "claude",
  antigravity: process.env.AGY_BIN || "agy",
};
async function capture(provider: Provider, args: string[]) {
  try {
    const result = await exec(binaries[provider], args, {
      timeout: 15000,
      maxBuffer: 1024 * 1024,
    });
    return (result.stdout || result.stderr).trim();
  } catch (e: any) {
    throw new Error(
      e.code === "ENOENT"
        ? `${provider} CLI is not installed on the worker host`
        : `${provider}: ${e.stderr || e.message}`,
    );
  }
}
async function codexModels(): Promise<string[]> {
  return new Promise((resolve) => {
    let buffer = "";
    let result: string[] = [];
    const p = spawn(binaries.codex, ["app-server"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const timer = setTimeout(() => {
      p.kill();
      resolve(result);
    }, 8000);
    p.on("error", () => {
      clearTimeout(timer);
      resolve([]);
    });
    p.stderr.resume();
    p.stdout.on("data", (chunk) => {
      buffer += chunk;
      let i;
      while ((i = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, i);
        buffer = buffer.slice(i + 1);
        try {
          const msg = JSON.parse(line);
          if (msg.id === 1) {
            p.stdin.write(JSON.stringify({ method: "initialized" }) + "\n");
            p.stdin.write(
              JSON.stringify({
                id: 2,
                method: "model/list",
                params: { includeHidden: false },
              }) + "\n",
            );
          }
          if (msg.id === 2) {
            result = (msg.result?.data || []).map((m: any) => m.model);
            clearTimeout(timer);
            p.kill();
            resolve(result);
          }
        } catch {}
      }
    });
    p.stdin.write(
      JSON.stringify({
        id: 1,
        method: "initialize",
        params: {
          clientInfo: { name: "atelier", version: "0.1.0" },
          capabilities: { experimentalApi: true },
        },
      }) + "\n",
    );
  });
}
export async function discover(): Promise<Harness[]> {
  return Promise.all(
    (["codex", "antigravity", "claude"] as Provider[]).map(async (provider) => {
      const base: Harness = {
        provider,
        installed: false,
        version: "",
        auth: "unavailable",
        models: [],
        modelDiscovery:
          "No model catalog exposed by this CLI; use its default or an explicitly configured model.",
        capabilities: { stream: "events", resume: false, cancel: true },
      };
      try {
        base.version = await capture(provider, ["--version"]);
        base.installed = true;
        base.auth = "unknown";
        const help = await capture(
          provider,
          provider === "codex" ? ["exec", "--help"] : ["--help"],
        );
        if (
          !(provider === "codex"
            ? help.includes("--json")
            : help.includes("--output-format"))
        ) {
          base.error =
            "Installed CLI does not expose the required structured event protocol";
          base.capabilities.stream = "completed";
        }
        if (provider === "codex") {
          const status = await capture(provider, ["login", "status"]).catch(
            (e) => e.message,
          );
          base.auth = /Logged in/.test(status) ? "authenticated" : "unknown";
          if (/API key/i.test(status))
            base.error =
              "This installation uses API-key authentication. Atelier requires the subscription CLI login; no paid API fallback is enabled.";
          base.models = await codexModels();
          base.modelDiscovery = base.models.length
            ? "Discovered from Codex app-server model/list."
            : "Model discovery unavailable; CLI default remains available.";
        }
        if (provider === "antigravity") {
          const list = await capture(provider, ["models"]).catch(() => "");
          base.models = list
            .split("\n")
            .map((line) => line.split("\t")[0].trim())
            .filter(Boolean);
          base.modelDiscovery = base.models.length
            ? "Discovered from agy models."
            : "Model discovery unavailable; CLI default remains available.";
        }
        if (provider === "claude") {
          const status = await capture(provider, ["auth", "status"]).catch(
            () => "",
          );
          try {
            const statusData = JSON.parse(status);
            if (/api.?key|bedrock|vertex/i.test(statusData.authMethod || ""))
              base.error =
                "Use the Claude subscription login for this integration; API-key and cloud billing paths are disabled.";
            base.auth = statusData.loggedIn ? "authenticated" : "unknown";
          } catch {}
        }
        return base;
      } catch (e: any) {
        return { ...base, error: e.message };
      }
    }),
  );
}
// Each provider's event protocol is parsed separately. Only actual assistant text is emitted.
export function assistantText(provider: Provider, event: any): string | null {
  if (provider === "codex") {
    if (event.type === "item.completed" && event.item?.type === "agent_message")
      return event.item.text ? event.item.text + "\n" : "";
    return null;
  }
  if (provider === "claude") {
    if (
      event.type === "stream_event" &&
      event.event?.type === "content_block_delta"
    )
      return event.event.delta?.text || null;
    if (event.type === "assistant")
      return (
        (event.message?.content || [])
          .filter((c: any) => c.type === "text")
          .map((c: any) => c.text)
          .join("") || null
      );
    return null;
  }
  if (
    event.event === "step_update" &&
    event.step_update?.step_type === "agent_response"
  )
    return event.step_update.text_delta || null;
  return null;
}
export async function runHarness(
  agent: Agent,
  prompt: string,
  onText: (text: string) => Promise<void>,
  signal: AbortSignal,
) {
  await mkdir("work/agent-scratch", { recursive: true });
  const cwd = resolve("work/agent-scratch");
  const args =
    agent.provider === "codex"
      ? [
          "exec",
          "--skip-git-repo-check",
          "--ephemeral",
          "--sandbox",
          "read-only",
          "--json",
          ...(agent.model ? ["--model", agent.model] : []),
          "-",
        ]
      : agent.provider === "claude"
        ? [
            "-p",
            "--verbose",
            "--output-format",
            "stream-json",
            "--tools",
            "",
            "--permission-mode",
            "dontAsk",
            ...(agent.model ? ["--model", agent.model] : []),
          ]
        : [
            // Print mode denies tool permission requests; plan mode would write a plan instead of answering.
            "--output-format",
            "stream-json",
            "--disable-slash-commands",
            ...(agent.model ? ["--model", agent.model] : []),
            "-p",
            prompt,
          ];
  return new Promise<void>((resolve, reject) => {
    const env = { ...process.env }; // Never allow an application integration to silently use an API-key payment path.
    for (const key of [
      "OPENAI_API_KEY",
      "ANTHROPIC_API_KEY",
      "GEMINI_API_KEY",
      "GOOGLE_API_KEY",
      "CLAUDE_CODE_USE_BEDROCK",
      "CLAUDE_CODE_USE_VERTEX",
      "GOOGLE_GENAI_USE_VERTEXAI",
    ])
      delete env[key];
    const child = spawn(binaries[agent.provider], args, {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    let buffer = "",
      stderr = "",
      chain = Promise.resolve(),
      failure: Error | undefined;
    const abort = () => {
      try {
        if (child.pid && process.platform !== "win32")
          process.kill(-child.pid, "SIGTERM");
        else child.kill("SIGTERM");
      } catch {}
      const t = setTimeout(() => {
        try {
          if (child.pid && process.platform !== "win32")
            process.kill(-child.pid, "SIGKILL");
          else child.kill("SIGKILL");
        } catch {}
      }, 2000);
      t.unref();
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    child.on("error", reject);
    child.stderr.on("data", (c) => {
      stderr = (stderr + c).slice(-6000);
      if (
        /HTTP CONNECT failed with status 403|Domain forbidden|Proxy connection failed/.test(
          stderr,
        )
      ) {
        failure = new Error(
          "Network policy blocked the CLI provider connection (HTTP 403). Allow the provider endpoint on the host network, then retry.",
        );
        abort();
      }
    });
    child.stdout.on("data", (c) => {
      buffer += c;
      if (buffer.length > 1024 * 1024) {
        failure = new Error("Harness event exceeds output limit");
        abort();
        return;
      }
      let i;
      while ((i = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, i);
        buffer = buffer.slice(i + 1);
        try {
          const event = JSON.parse(line);
          if (
            (event.type === "error" &&
              (!/reconnecting/i.test(event.message || "") ||
                /403|forbidden/i.test(event.message || ""))) ||
            event.type === "turn.failed" ||
            (event.event === "result" &&
              event.result?.status !== "SUCCESS") ||
            event.is_error
          ) {
            failure = new Error(
              event.message ||
                event.error?.message ||
                event.result?.error?.message ||
                "Harness task failed",
            );
            if (
              /403|forbidden|not authenticated|unauthorized/i.test(
                failure.message,
              )
            )
              abort();
          }
          const text = assistantText(agent.provider, event);
          if (text)
            chain = chain
              .then(() => onText(text))
              .catch((e) => {
                failure = e;
                abort();
              });
        } catch {}
      }
    });
    child.on("close", (code) => {
      signal.removeEventListener("abort", abort);
      chain
        .then(() => {
          if (signal.aborted) reject(new Error("Task cancelled or timed out"));
          else if (failure) reject(failure);
          else if (code !== 0)
            reject(new Error(`CLI exited ${code}: ${stderr.slice(-2000)}`));
          else resolve();
        })
        .catch(reject);
    });
    if (agent.provider !== "antigravity") child.stdin.end(prompt);
    else child.stdin.end();
  });
}
