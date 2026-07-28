# Local integration and review boundary

The frontend is developed locally against the running backend. Codex can start
the API, issue real requests, and drive a real browser, so contract-backed
behavior is verified directly instead of being inferred from captured responses.

This replaces the earlier Google AI Studio/Gemini and Fable5 arrangement in
which a remote collaborator wrote candidate code against fixtures and a
separate integrator performed acceptance. Codex now writes the implementation,
verifies it, and owns the corrective commits.

The captured responses under `fixtures/api/` remain useful as an offline regression and visual
reference, and for exercising states that are expensive to reproduce against a live Runtime. They
are no longer the primary development input.

Frontend-only mock data must remain outside `contracts/` and `fixtures/api/`, reuse contracted fields
and state values, and stay explicitly separable from the real API transport. A failed real request
must produce its contracted error state instead of silently switching the application into mock
mode.

## Frontend transport requirements

- Use relative `/api/v1` requests by default.
- Include browser credentials so the HttpOnly session cookie is sent.
- Keep the API base configurable without embedding local absolute paths.
- Support a local development proxy from `/api` to `http://127.0.0.1:8000`.
- Do not require a remote server or public deployment for M3 validation.

## Local verification

```powershell
# backend, in the mutiAI repository
uv run uvicorn mutiai.main:app --reload            # http://127.0.0.1:8000

# frontend, in this repository
npm install
npm run dev                                        # http://localhost:3000
```

`RUNTIME_PROVIDER` defaults to `fake`, which keeps the backend self-contained for frontend work.
Start the Codex sidecar only when a change needs real Runtime behavior.

Before a frontend change is called complete:

1. Run the repository's type, lint, and build commands.
2. Run the frontend against the real backend through the development proxy.
3. Verify authentication, request and response shapes, SSE reconnect behavior, and Artifact access.
4. Check the browser console for uncaught errors and the network panel for contract conformance.
5. Verify core interactions and responsive layout.

Contract defects are backend-owned. Fix them in `Purewo/mutiAI` as their own commits, then refresh
this repository's snapshots and record the source commit in `contracts/SNAPSHOT.md`.
