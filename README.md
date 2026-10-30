# Atelier

A local collaborative writing application built with React, Tiptap, Yjs, Hocuspocus, Node.js and PostgreSQL. The document is the main interface. Agent edits appear in the live document with attribution, recoverable wording and human review controls.

**Release status: functional editor and tested edit-safety foundation; full real-agent acceptance remains blocked in this environment.** The uploaded handoff stops at “Agent Or” in section 13. This repository implements the supplied requirements with the limitations below; it is not a claim that the complete specification has passed acceptance.

## Run on your computer

Requires Docker Compose, Node.js 24+, and at least one supported CLI installed and authenticated on the host. The tested host platform is Linux. Other host platforms require verification.

```sh
npm ci
npm run setup
docker compose up --build -d
npm run worker
```

Open **http://localhost:8080**. Keep the worker terminal running. `setup` creates `.env` with random local credentials without printing their values. Existing `.env` files are preserved. Never commit this file.

The host worker reads `.env`, polls the containerized backend over the loopback port, launches the actual installed CLIs with their own existing configuration and authentication, and returns provider events. It runs no inbound HTTP server. No host binaries or credential directories are mounted into the containers. This explicit host execution strategy avoids binary compatibility problems and keeps subscription credentials with their original CLI.

The Compose deployment contains PostgreSQL, an unprivileged application process, and an Nginx reverse proxy for HTTP, event streaming and collaborative websockets. Only port 8080 is published, bound to loopback. Container data persists in named volumes. `docker compose down` stops the app without deleting those volumes.

Agent execution needs the host network to allow the provider endpoints. The worker uses no application-managed model API keys and never switches providers or paid API endpoints when a harness fails. API-key environment variables are removed from CLI subprocesses; Codex and Claude explicitly detected API-key authentication is rejected. Provider configuration and current subscription terms must still be reviewed by the operator: a local login is not evidence of permission for every application use, nor a guarantee that the provider is reachable.

### CLI setup

Install and authenticate each CLI separately using the provider's own documented subscription login. Atelier does not perform login or install harnesses. Settings reports installed versions, locally exposed authentication status, errors, and model options. Display names and colors are independent of provider model identifiers.

| Collaborator | Harness  | Integration behavior                                                                                         |
| ------------ | -------- | ------------------------------------------------------------------------------------------------------------ |
| Astra        | `codex`  | `exec --json`, read-only sandbox, ephemeral session; discovers model catalog through app-server `model/list` |
| Argon        | `gemini` | non-interactive prompt with `stream-json` and plan approval mode                                             |
| Claude       | `claude` | print mode with `stream-json`, no tools, and `dontAsk` permissions                                           |

`CODEX_BIN`, `GEMINI_BIN`, and `CLAUDE_BIN` can select executable paths. Versions lacking the structured output flag fail explicitly. Unknown authentication status means the CLI does not expose a usable status check; it is not treated as authenticated. Codex model catalogs may be cached by the harness and do not prove current model availability. Gemini and Claude have no verified model-list operation here: use the CLI default or a deliberately entered model ID. Provider flags and auth arrangements for those two CLIs remain unverified until installed on the target host.

## Use the editor

- Create documents and workspaces in the left navigation. Click the workspace selector to cycle between workspaces. Titles and text persist automatically.
- Write and format directly; tables, images, headings, lists, links and blockquotes are supported. Use `/` for block commands. Select text for contextual formatting and collaborator actions.
- Type `@` to pick a collaborator, or click a collaborator in the lower dock. Enter a document instruction, or select a passage first to limit the rewrite. Mentions are invocation commands rather than permanent mention entities.
- Review highlighted contributions in Suggested changes. Acceptance removes the pending marker but retains attribution. Rejection restores the original rich content only when no later work would be damaged. Conflicts preserve the proposed wording for manual review.
- Select a paragraph and open Discussions. Threads support replies, agent invitations, resolve/reopen and promotion of an explicit editorial decision into shared instructions. Resolving accepts only scoped related changes and preserves conversation history.
- Use the Palette for document instructions, audience, purpose, reference notes, and PDF/DOCX/TXT/Markdown files. Workspace sources are inherited by all documents in that workspace. Sources are extracted, chunked and searched with PostgreSQL full-text ranking; only selected excerpts enter an agent prompt. Citations require an actual retrieved source ID and exact passage.
- Agent activity shows actual task output and errors. Stop a task or all tasks; retry is a deliberate action with fresh document context. A worker runs two task slots; overlapping document/block writes are queued. Delegation is limited to three total turns, one child per task, with ancestor loop protection.
- Export Markdown, HTML or plain text. Import Markdown, HTML or text; a version is saved before replacing content. Save named history snapshots for a read-only record of earlier document wording.

## Development without Docker

```sh
npm ci
npm run setup
npm run dev
# A second terminal:
npm run web
# A third terminal:
ATELIER_URL=http://127.0.0.1:3001 npm run worker
```

The development backend and worker read `.env`. Use http://localhost:5173. Without `DATABASE_URL`, the development server uses on-disk PGlite, an embedded PostgreSQL engine, in `work/data/postgres`. Set `DATABASE_URL` to use a regular PostgreSQL server. Compose always uses regular PostgreSQL.

`PORT`, `COLLAB_PORT`, `BIND_HOST`, `ALLOWED_ORIGINS`, `ATELIER_URL` and `WORKER_TOKEN` configure the local services. Keep `BIND_HOST` at its loopback default outside Docker. This is a trusted, personal, local application; it does not provide multi-user account authentication or authorization for public hosting.

Managed cloud builds that require a proxy CA can use:

```sh
docker compose -f compose.yaml -f compose.cloud.yaml build
```

Set `CODEX_PROXY_CERT` to the provided CA path. The certificate is mounted only during dependency installation; it is not copied into image layers. No TLS-verification bypass is used.

## Architecture and safety

- `apps/web`: the document canvas, contextual tools, palette, discussions, changes, activity and settings.
- `apps/server`: application routes, durable PostgreSQL records, collaboration server and task coordination.
- `packages/harness`: provider-specific process launch, discovery, event parsing, cancellation and the outbound-only host worker.
- `packages/conversion`: source extraction and bounded chunking.
- `packages/shared`: application and provider types.

The live document uses Yjs XML with stable node IDs. Comments and semantic changes anchor to those IDs; cursors use Yjs relative positions. Agent writes use paragraph/heading scopes and compare the original node state immediately before applying an edit. A selected passage is represented by its stable block ID plus unique exact content; surrounding wording must be preserved, and ambiguous or cross-block selections are rejected. No absolute-offset-only tracking is used.

Change records retain the agent, provider, selected model or explicit CLI-default label, base-state fingerprint, rich original and revised nodes, dependencies, timestamps, citations and acceptance state. Fingerprints use canonical key ordering so PostgreSQL JSONB round trips do not cause false conflicts. Reversal checks both current content and later dependency records, including accepted contributions. It never performs a global editor undo to reject an agent change.

Only complete validated protocol operations enter the document. Codex CLI emits completed assistant-message events, so its contribution can arrive a paragraph at a time rather than token by token. Gemini text deltas are accumulated until a JSON operation is complete. Harness output, validated live content and review state are separate. There is no typing animation or application-generated agent response. Provider reasoning and tool output are not inserted as document content.

Tasks have a three-minute execution deadline, process-group cancellation on Linux, output and operation budgets, a two-slot concurrency ceiling, heartbeat expiry and no automatic replay after failure. A server restart marks interrupted tasks failed and interrupted journal entries conflicted. Named snapshots and change records provide recoverable history. This is not a hardened distributed scheduler or a transactional offline editor.

## Verification

```sh
npm run build
npm test
# Requires a PostgreSQL role allowed to create/drop disposable test databases:
TEST_DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/postgres npm run test:integration
# Start the development backend and frontend first:
CHROMIUM_PATH=/path/to/chromium npm run test:e2e
```

The protocol tests create and remove a dedicated database. They use clearly identified deterministic protocol fixtures to test editorial safety; they do not simulate provider output in the product. Browser tests verify two-client synchronization, persistence, source ingestion and discussion creation. A Compose browser smoke check verified writing and reloading through Nginx, Hocuspocus and PostgreSQL.

Observed in the supplied environment on 30 October 2026:

- TypeScript and production builds pass.
- Seven safety tests pass.
- Nine PostgreSQL protocol integration checks pass: rich-text reversal after persistence, preservation of human edits, stale generation, cancellation, overlapping scopes, passage constraints, thread resolution/reopening, citation validation, and origin/worker authentication.
- The two-browser workflow test passes.
- Docker image build and containerized browser persistence check pass.
- Codex 0.163.0 is installed; `login status` reports ChatGPT authentication; model discovery returns the harness catalog. An actual generation attempt fails because the environment proxy denies `chatgpt.com` (HTTP CONNECT 403). Real generation is **not** verified.
- Claude Code and Gemini CLI are absent, so their adapters have parser coverage but no end-to-end provider verification here.

## Remaining acceptance gaps

This release is useful locally but does not meet every requirement in the full handoff yet:

1. Successful real generation for all three authenticated providers and verification of their current subscription/automation terms require a suitably configured host. The current environment cannot complete those acceptance checks.
2. Automatic agent edits are plain-text paragraph/heading replacements and paragraph additions. Rich text is preserved for rejection, but generated tables, images, structural edits, section scopes and cross-block selected-range edits are not implemented.
3. Thread anchors track logical blocks rather than exact highlighted spans. Inline mentions use a composer rather than an enduring rich mention node. Agent session resume is not implemented; the shared context is rebuilt explicitly for each task.
4. Web URL ingestion is disabled by default. For a trusted local network, `ALLOW_WEB_SOURCES=true` enables bounded HTTPS HTML fetching with redirect/private-address checks. It is not hardened against DNS rebinding; keep it disabled for untrusted use. Paste web content as a note instead. Files and notes work without external connectors.
5. File ingestion runs synchronously with a 15 MB limit. There is no OCR, semantic vector search, original binary download, durable ingestion job queue, connector integration, PDF/DOCX document export or source page-level citation indexing.
6. Document history supports named snapshots and reading/copying prior wording, not automated whole-document restore. Source descriptions are stored but do not yet have an editing form. Document navigation has search and latest-updated ordering, not a separate persistent recent-opened list or full project-management controls.
7. Settings and tasks are local and trusted. Before a public or multi-user release, add account authorization, stronger harness tool isolation, resource sandboxing, production migrations/backups and crash-recovery acceptance tests. Host CLI sandbox behavior varies by provider; prompting “do not use tools” alone is not a security boundary.

See `VERIFICATION.md` for the concrete deployment and integration results.
