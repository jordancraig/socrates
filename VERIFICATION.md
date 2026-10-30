# Verification record

Date: 30 October 2026. Scope: the uploaded handoff, which is truncated in section 13.

| Check                                  | Result                                                          |
| -------------------------------------- | --------------------------------------------------------------- |
| TypeScript and Vite production build   | Passed                                                          |
| Unit safety checks                     | 7 passed                                                        |
| Disposable PostgreSQL protocol checks  | 9 passed                                                        |
| Two-client browser workflow            | Passed                                                          |
| Compose image build                    | Passed                                                          |
| Compose browser edit and reload        | Passed, no browser runtime errors                               |
| Codex installation                     | 0.163.0                                                         |
| Codex authentication status            | ChatGPT login reported locally                                  |
| Codex model discovery                  | app-server `model/list` returned catalog                        |
| Codex actual editorial generation      | Blocked by host network policy: HTTP CONNECT 403 to chatgpt.com |
| Gemini / Claude actual generation      | Not tested: CLIs not installed                                  |
| Provider subscription/automation terms | Not independently validated                                     |

Real CLI invocation was attempted through the host-worker path. It was not replaced with simulated text or a paid API fallback. Cached model discovery and a local login are not evidence of a successful model turn.

The deterministic protocol checks exercise the application boundary with disposable test fixtures, not a model. They verify stored rich-text rejection, human edit protection, preservation of stale proposals, cancellation, overlapping-scope serialization, selected-passage constraints, scoped thread acceptance/reopening, fabricated-citation rejection and request-authentication boundaries.

The container smoke check entered text through the browser at port 8080, reloaded it and read the persisted result. This checks the Nginx/websocket/backend/PostgreSQL path; it does not validate provider access from a user's own machine.

The full release should remain marked incomplete until the real-provider and remaining functional acceptance gaps listed in README.md are closed.
